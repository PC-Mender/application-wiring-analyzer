import ts from "typescript";
import { HTTP_METHODS, type HttpMethod } from "@neil-jay/core";

/** HTTP methods recognized in fetch() options. */
export const FETCH_METHODS = new Set<HttpMethod>(HTTP_METHODS);

/** Maps a top-level const name to its initializer expression for static reduction. */
export type ConstEnv = Map<string, ts.Expression>;

/** True for the global Fetch API, without treating arbitrary client.fetch() calls as native. */
export function isNativeFetchCall(node: ts.CallExpression): boolean {
  if (ts.isIdentifier(node.expression)) return node.expression.text === "fetch";
  if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "fetch") return false;
  return ts.isIdentifier(node.expression.expression)
    && new Set(["globalThis", "window", "self", "global"]).has(node.expression.expression.text);
}

/** Resolve an identifier through the const environment, guarding against cycles. */
export function resolveExpression(expression: ts.Expression, env: ConstEnv, seen = new Set<string>()): ts.Expression {
  if (!ts.isIdentifier(expression) || seen.has(expression.text)) return expression;
  const target = env.get(expression.text);
  if (!target) return expression;
  seen.add(expression.text);
  return resolveExpression(target, env, seen);
}

function getPropertyName(name: ts.PropertyName, env: ConstEnv = new Map()): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) {
    const expression = resolveExpression(name.expression, env);
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  }
  return null;
}

/**
 * Extract the HTTP method from a fetch() options argument. Returns "GET" when
 * no options or method are present, null when the method cannot be statically
 * resolved (unresolved spread, non-literal, unsupported).
 */
export function extractFetchMethod(options: ts.Expression | undefined, env: ConstEnv = new Map()): HttpMethod | null {
  if (!options) return "GET";
  const resolved = resolveExpression(options, env);
  if (!ts.isObjectLiteralExpression(resolved)) return null;
  const method = resolveMethodProperty(resolved, env, new Set());
  if (method === undefined) return "GET";
  if (method === null) return null;
  const value = resolveExpression(method, env);
  if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) return null;
  const normalized = value.text.toUpperCase();
  return FETCH_METHODS.has(normalized as HttpMethod) ? normalized as HttpMethod : null;
}

/** Returns undefined for no method, null for an indeterminate method. */
function resolveMethodProperty(
  object: ts.ObjectLiteralExpression,
  env: ConstEnv,
  seen: Set<string>,
): ts.Expression | null | undefined {
  let method: ts.Expression | null | undefined;
  for (const property of object.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = resolveExpression(property.expression, env);
      if (ts.isIdentifier(property.expression) && seen.has(property.expression.text)) return null;
      if (ts.isObjectLiteralExpression(spread)) {
        const nestedSeen = new Set(seen);
        if (ts.isIdentifier(property.expression)) nestedSeen.add(property.expression.text);
        const nested = resolveMethodProperty(spread, env, nestedSeen);
        if (nested !== undefined) method = nested;
      } else {
        method = null;
      }
      continue;
    }
    if (ts.isShorthandPropertyAssignment(property) && getPropertyName(property.name, env) === "method") {
      method = env.get(property.name.text) ?? null;
      continue;
    }
    if (ts.isPropertyAssignment(property) && getPropertyName(property.name, env) === "method") {
      method = property.initializer;
    }
  }
  return method;
}

/**
 * Find a fetch() call where the first argument is derived from the given
 * parameter (including through simple `const alias = param` aliasing).
 */
export function findFetchCallUsingParameter(root: ts.Node, parameterName: string): ts.CallExpression | null {
  return findFetchCallUsingParameters(root, [parameterName])?.call ?? null;
}

/** Find a fetch call whose URL is derived from any parameter, including aliases. */
export function findFetchCallUsingParameters(
  root: ts.Node,
  parameterNames: readonly string[],
): { call: ts.CallExpression; parameterIndex: number } | null {
  const aliases = new Map<string, string>();
  const buildAliasMap = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isIdentifier(node.initializer)) {
      const fromName = node.initializer.text;
      const source = parameterNames.find((name) => name === fromName || aliases.get(fromName) === name);
      if (source) aliases.set(node.name.text, source);
    }
    ts.forEachChild(node, buildAliasMap);
  };
  buildAliasMap(root);

  let found: { call: ts.CallExpression; parameterIndex: number } | null = null;
  const search = (node: ts.Node): void => {
    if (found) return;
    if (ts.isCallExpression(node) && isNativeFetchCall(node)) {
      const arg = node.arguments[0];
      if (arg && ts.isIdentifier(arg)) {
        const name = parameterNames.find((parameter) => parameter === arg.text || aliases.get(arg.text) === parameter);
        if (name) found = { call: node, parameterIndex: parameterNames.indexOf(name) };
      }
    }
    ts.forEachChild(node, search);
  };
  search(root);
  return found;
}
