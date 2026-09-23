import ts from "typescript";
import { normalizeBackendPath, type BackendRoute } from "@neil-jay/core";
import { inferScriptKind } from "@neil-jay/analyzer-typescript";
import {
  collectHonoConstructorNames,
  getHandlerName,
  isHonoConstruction,
  getOnMethods,
  joinPaths,
  ROUTE_METHODS,
  unwrapChain,
} from "./internal.js";

export interface ExtractHonoRoutesOptions {
  fileName?: string;
}

/**
 * Extract Hono routes from a TypeScript/TSX source file.
 *
 * v0.1 intentionally recognizes Hono instances created from `new Hono()` where
 * `Hono` is imported from `hono` or a `hono/*` subpath (e.g. `hono/tiny`).
 * Aliases, chained route registration, and `.basePath()` prefixes are supported.
 */
export function extractHonoRoutes(
  sourceText: string,
  options: ExtractHonoRoutesOptions = {},
): BackendRoute[] {
  const fileName = options.fileName ?? "source.ts";
  const scriptKind = inferScriptKind(fileName);
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind);

  const honoConstructorNames = collectHonoConstructorNames(sourceFile);
  const staticPaths = collectStaticPaths(sourceFile);
  const honoInstanceNames = new Set<string>();
  const instanceBasePaths = new Map<string, string>();
  const routes: BackendRoute[] = [];

  const addInstance = (name: string, basePath: string): void => {
    honoInstanceNames.add(name);
    if (basePath) instanceBasePaths.set(name, joinPaths(instanceBasePaths.get(name) ?? "", basePath));
  };

  // Identify variables initialized with a known Hono constructor,
  // including chained forms such as `new Hono().basePath("/api")` or
  // `const api = app.basePath("/v1")`.
  const findInstances = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const chain = unwrapChain(node.initializer);
      if (isHonoConstruction(chain.root, honoConstructorNames)) addInstance(node.name.text, chain.basePath);
      else if (ts.isIdentifier(chain.root) && honoInstanceNames.has(chain.root.text)) {
        addInstance(node.name.text, joinPaths(instanceBasePaths.get(chain.root.text) ?? "", chain.basePath));
      }
    }
    ts.forEachChild(node, findInstances);
  };
  findInstances(sourceFile);

  // Extract method calls on identified Hono instances.
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression;
      const methodName = node.expression.name.text;
      const methods = ROUTE_METHODS.has(methodName)
        ? [ROUTE_METHODS.get(methodName)!]
        : methodName === "on" ? getOnMethods(node.arguments[0]) : [];

      if (methods.length > 0) {
        const chain = unwrapChain(receiver);
        let prefix: string | null = null;
        if (ts.isIdentifier(chain.root) && honoInstanceNames.has(chain.root.text)) {
          prefix = joinPaths(instanceBasePaths.get(chain.root.text) ?? "", chain.basePath);
        } else if (isHonoConstruction(chain.root, honoConstructorNames)) {
          prefix = chain.basePath;
        }
        const pathArg = methodName === "on" ? node.arguments[1] : node.arguments[0];
        const handlerArg = methodName === "on" ? node.arguments[2] : node.arguments[1];
        const resolvedPath = pathArg ? reduceRoutePath(pathArg, staticPaths) : null;
        if (prefix !== null && resolvedPath !== null) {
          const rawPath = joinPaths(prefix, resolvedPath);
          const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          for (const method of methods) routes.push({
            kind: "backend-route",
            method,
            rawPath,
            normalizedPath: normalizeBackendPath(rawPath),
            handler: getHandlerName(handlerArg),
            location: {
              file: fileName,
              line: start.line + 1,
              column: start.character + 1,
            },
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return routes;
}

function collectStaticPaths(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const paths = new Map<string, ts.Expression>();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if ((statement.declarationList.flags & ts.NodeFlags.Const) !== 0 && ts.isIdentifier(declaration.name) && declaration.initializer) paths.set(declaration.name.text, declaration.initializer);
    }
  }
  return paths;
}

function reduceRoutePath(expression: ts.Expression, paths: ReadonlyMap<string, ts.Expression>, seen = new Set<string>()): string | null {
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) return null;
    const target = paths.get(expression.text);
    if (!target) return null;
    const next = new Set(seen);
    next.add(expression.text);
    return reduceRoutePath(target, paths, next);
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = reduceRoutePath(expression.left, paths, seen);
    const right = reduceRoutePath(expression.right, paths, seen);
    return left !== null && right !== null ? left + right : null;
  }
  if (ts.isTemplateExpression(expression)) {
    let value = expression.head.text;
    for (const span of expression.templateSpans) {
      value += reduceRoutePath(span.expression, paths, seen) ?? ":dynamic";
      value += span.literal.text;
    }
    return value;
  }
  return null;
}
