import ts from "typescript";
import { normalizeFrontendPath, type FrontendRequest, type HttpMethod } from "@neil-jay/core";
import { inferScriptKind } from "@neil-jay/analyzer-typescript";
import {
  extractFetchMethod,
  findFetchCallUsingParameters,
  isNativeFetchCall,
  resolveExpression,
  type ConstEnv,
} from "./internal.js";

export interface ExtractFetchRequestsOptions {
  fileName?: string;
  externalConstants?: ReadonlyMap<string, string>;
  externalWrappers?: ReadonlyMap<string, HttpMethod | null>;
  externalWrapperUrlParameters?: ReadonlyMap<string, number>;
}

export interface ExtractFetchResult {
  requests: FrontendRequest[];
  skippedShadowedFetch: number;
}

type Wrapper = { name: string; urlParam: string; urlParamIndex: number; method: HttpMethod | null };
type Scope = Set<string>;

/** Extract native fetch() calls plus conservative, local symbol reductions. */
export function extractFetchRequests(sourceText: string, options: ExtractFetchRequestsOptions = {}): ExtractFetchResult {
  const fileName = options.fileName ?? "source.tsx";
  const scriptKind = inferScriptKind(fileName);
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, scriptKind);
  const requests: FrontendRequest[] = [];
  let skippedShadowedFetch = 0;
  const env = collectStaticExpressions(sourceFile);
  const wrappers = collectSimpleFetchWrappers(sourceFile);
  for (const [name, method] of options.externalWrappers ?? []) {
    if (!wrappers.has(name)) {
      const urlParamIndex = options.externalWrapperUrlParameters?.get(name) ?? 0;
      wrappers.set(name, { name, urlParam: "path", urlParamIndex, method });
    }
  }
  const shadowScopes = buildFetchShadowScopes(sourceFile);

  const pushRequest = (node: ts.CallExpression, urlArg: ts.Expression | undefined, method: HttpMethod | null) => {
    const reduced = urlArg ? reduceUrl(urlArg, env, options.externalConstants) : null;
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    requests.push({
      kind: "frontend-request", method,
      rawUrl: urlArg?.getText(sourceFile) ?? "",
      normalizedPath: reduced === null ? null : normalizeFrontendPath(reduced),
      location: { file: fileName, line: start.line + 1, column: start.character + 1 },
    });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (isNativeFetchCall(node)) {
        const shadowedName = ts.isIdentifier(node.expression)
          ? "fetch"
          : ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
            ? node.expression.expression.text
            : null;
        if (shadowedName && isShadowedAt(node.getStart(sourceFile), shadowedName, shadowScopes)) {
          skippedShadowedFetch++;
        } else {
          pushRequest(node, node.arguments[0], extractFetchMethod(node.arguments[1], env));
        }
      } else if (ts.isIdentifier(node.expression)) {
        const wrapper = wrappers.get(node.expression.text);
        if (wrapper) pushRequest(node, node.arguments[wrapper.urlParamIndex], wrapper.method);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const filtered = requests.filter((request) => !isLocationInsideWrapper(request, wrappers, sourceFile));
  return { requests: filtered, skippedShadowedFetch };
}

function collectStaticExpressions(sourceFile: ts.SourceFile): ConstEnv {
  const env: ConstEnv = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && isStableBinding(sourceFile, declaration)) env.set(declaration.name.text, declaration.initializer);
    }
  }
  return env;
}

function isStableBinding(sourceFile: ts.SourceFile, declaration: ts.VariableDeclaration): boolean {
  if (declaration.parent.flags & ts.NodeFlags.Const) return true;
  let stable = true;
  const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
  if (!name) return false;
  const visit = (node: ts.Node): void => {
    if (node === declaration) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && ts.isIdentifier(node.left) && node.left.text === name) stable = false;
    if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
      if (ts.isIdentifier(node.operand) && node.operand.text === name) stable = false;
    }
    if (stable) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return stable;
}

function collectSimpleFetchWrappers(sourceFile: ts.SourceFile): Map<string, Wrapper & { start?: number; end?: number }> {
  const result = new Map<string, Wrapper & { start?: number; end?: number }>();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body && statement.parameters.length >= 1) {
      const parameters = statement.parameters.map((parameter) => parameter.name).filter(ts.isIdentifier).map((parameter) => parameter.text);
      const fetchMatch = findFetchCallUsingParameters(statement.body, parameters);
      if (fetchMatch) result.set(statement.name.text, { name: statement.name.text, urlParam: parameters[fetchMatch.parameterIndex]!, urlParamIndex: fetchMatch.parameterIndex, method: extractFetchMethod(fetchMatch.call.arguments[1]), start: statement.getStart(sourceFile), end: statement.getEnd() });
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !(ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) continue;
        const parameters = declaration.initializer.parameters.map((parameter) => parameter.name).filter(ts.isIdentifier).map((parameter) => parameter.text);
        const fetchMatch = findFetchCallUsingParameters(declaration.initializer.body, parameters);
        if (fetchMatch) result.set(declaration.name.text, { name: declaration.name.text, urlParam: parameters[fetchMatch.parameterIndex]!, urlParamIndex: fetchMatch.parameterIndex, method: extractFetchMethod(fetchMatch.call.arguments[1]), start: declaration.getStart(sourceFile), end: declaration.getEnd() });
      }
    }
  }
  return result;
}

function isLocationInsideWrapper(request: FrontendRequest, wrappers: Map<string, Wrapper & { start?: number; end?: number }>, sourceFile: ts.SourceFile): boolean {
  const pos = sourceFile.getPositionOfLineAndCharacter(request.location.line - 1, request.location.column - 1);
  for (const wrapper of wrappers.values()) if (wrapper.start !== undefined && wrapper.end !== undefined && pos >= wrapper.start && pos <= wrapper.end) return true;
  return false;
}

interface ShadowScopeRecord { start: number; end: number; name: string; }
type ShadowScopes = ShadowScopeRecord[];
const GLOBAL_FETCH_RECEIVERS = new Set(["globalThis", "window", "self", "global"]);

function buildFetchShadowScopes(sourceFile: ts.SourceFile): ShadowScopes {
  const scopes: ShadowScopes = [];
  const scopeStack: Scope[] = [];
  const recording = new Map<string, number>();
  const currentScope = (): Scope => scopeStack[scopeStack.length - 1];
  const isBound = (name: string): boolean => {
    for (let i = scopeStack.length - 1; i >= 0; i--) if (scopeStack[i].has(name)) return true;
    return false;
  };
  const pushScope = (): void => { scopeStack.push(new Set<string>()); };
  const popScope = (): void => { scopeStack.pop(); };
  const bind = (name: string): void => { const s = currentScope(); if (s) s.add(name); };
  const bindDeclarationName = (name: ts.BindingName | undefined): void => {
    if (!name) return;
    if (ts.isIdentifier(name)) bind(name.text);
    else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      const walk = (pattern: ts.BindingPattern): void => {
        for (const e of pattern.elements) {
          if (ts.isBindingElement(e)) walkBindingName(e.name);
          else if (ts.isOmittedExpression(e)) { /* skip */ }
        }
      };
      const walkBindingName = (n: ts.BindingName): void => {
        if (ts.isIdentifier(n)) bind(n.text);
        else if (ts.isObjectBindingPattern(n) || ts.isArrayBindingPattern(n)) walk(n);
      };
      walk(name as ts.BindingPattern);
    }
  };
  pushScope();
  for (const stmt of sourceFile.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const c = stmt.importClause;
      if (c.name) bind(c.name.text);
      if (c.namedBindings) {
        if (ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) bind(el.name.text);
        else if (ts.isNamespaceImport(c.namedBindings)) { /* namespace X: X.fetch call site would use identifier X not fetch, so not reachable by isNativeFetchCall */ }
      }
    }
  }
  const trackedNames = new Set(["fetch", ...GLOBAL_FETCH_RECEIVERS]);
  const checkStartRecord = (pos: number): void => {
    for (const name of trackedNames) if (!recording.has(name) && isBound(name)) recording.set(name, pos);
  };
  const checkEndRecord = (pos: number): void => {
    for (const [name, start] of recording) {
      if (!isBound(name)) { scopes.push({ start, end: pos, name }); recording.delete(name); }
    }
  };
  const enter = (node: ts.Node): void => {
    checkEndRecord(node.getStart(sourceFile));
    if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
      if (node.name) bind(node.name.text);
    }
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node)) {
      pushScope();
      if ((ts.isFunctionExpression(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) bind(node.name.text);
      for (const p of node.parameters) bindDeclarationName(p.name);
    } else if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isWithStatement(node) || ts.isBlock(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node) || ts.isCatchClause(node)) {
      pushScope();
    }
    if (ts.isVariableStatement(node)) {
      for (const d of node.declarationList.declarations) bindDeclarationName(d.name);
    } else if (ts.isVariableDeclarationList(node)) {
      for (const d of node.declarations) bindDeclarationName(d.name);
    }
    if (ts.isCatchClause(node) && node.variableDeclaration) bindDeclarationName(node.variableDeclaration.name);
    checkStartRecord(node.getStart(sourceFile));
  };
  const leave = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node) || ts.isConstructorDeclaration(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isWithStatement(node) || ts.isBlock(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node) || ts.isCatchClause(node)) {
      popScope();
    }
    checkEndRecord(node.getEnd());
  };
  const walk = (node: ts.Node): void => { enter(node); ts.forEachChild(node, walk); leave(node); };
  checkStartRecord(0);
  ts.forEachChild(sourceFile, walk);
  checkEndRecord(sourceFile.getEnd());
  for (const [name, start] of recording) scopes.push({ start, end: sourceFile.getEnd(), name });
  return scopes;
}

function isShadowedAt(position: number, name: string, scopes: ShadowScopes): boolean {
  return scopes.some((scope) => scope.name === name && position >= scope.start && position <= scope.end);
}

function reduceUrl(expression: ts.Expression, env: ConstEnv, externalConstants?: ReadonlyMap<string, string>): string | null {
  if (ts.isIdentifier(expression) && !env.has(expression.text)) {
    const external = externalConstants?.get(expression.text);
    if (external !== undefined) return extractPathFromStaticUrl(external);
  }
  const resolved = resolveExpression(expression, env);
  const urlConstructor = unwrapStaticUrlConstructor(resolved);
  if (urlConstructor) {
    const argumentsList = urlConstructor.arguments ?? [];
    const value = resolveStaticString(argumentsList[0], env, externalConstants);
    if (value === null) return null;
    const base = argumentsList[1]
      ? resolveStaticString(argumentsList[1], env, externalConstants)
      : null;
    if (base !== null) {
      try {
        const url = new URL(value, base);
        return extractPathFromStaticUrl(url.toString());
      } catch { return null; }
    }
    return extractPathFromStaticUrl(value);
  }
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = reduceUrlPart(resolved.left, env, externalConstants);
    const right = reduceUrlPart(resolved.right, env, externalConstants);
    if (left === null) return null;
    return extractPathFromStaticUrl(left + (right ?? ":dynamic"));
  }
  if (ts.isStringLiteral(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) return extractPathFromStaticUrl(resolved.text);
  if (ts.isTemplateExpression(resolved)) {
    let value = resolved.head.text;
    for (const span of resolved.templateSpans) {
      const staticPart = resolveStaticString(span.expression, env, externalConstants);
      const following = span.literal.text;
      if (staticPart !== null) {
        value += staticPart + following;
        continue;
      }
      value += ":dynamic" + following;
    }
    return extractPathFromStaticUrl(value);
  }
  return null;
}

function unwrapStaticUrlConstructor(expression: ts.Expression): ts.NewExpression | null {
  let current = expression;
  if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression) && current.expression.name.text === "toString") {
    current = current.expression.expression;
  } else if (ts.isPropertyAccessExpression(current) && current.name.text === "href") {
    current = current.expression;
  }
  return ts.isNewExpression(current)
    && ts.isIdentifier(current.expression)
    && current.expression.text === "URL"
    && (current.arguments?.length ?? 0) >= 1
    ? current
    : null;
}

function reduceUrlPart(expression: ts.Expression, env: ConstEnv, externalConstants?: ReadonlyMap<string, string>): string | null {
  const resolved = resolveExpression(expression, env);
  if (ts.isStringLiteral(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) return resolved.text;
  if (ts.isIdentifier(resolved)) return externalConstants?.get(resolved.text) ?? null;
  if (ts.isBinaryExpression(resolved) && resolved.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = reduceUrlPart(resolved.left, env, externalConstants);
    const right = reduceUrlPart(resolved.right, env, externalConstants);
    return left !== null ? left + (right ?? ":dynamic") : null;
  }
  return null;
}

function resolveStaticString(expression: ts.Expression, env: ConstEnv, externalConstants?: ReadonlyMap<string, string>): string | null {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isIdentifier(expression)) {
    const local = env.get(expression.text);
    if (local) {
      const resolved = resolveExpression(local, env);
      if (ts.isStringLiteral(resolved) || ts.isNoSubstitutionTemplateLiteral(resolved)) return resolved.text;
    }
    return externalConstants?.get(expression.text) ?? null;
  }
  return null;
}

function extractPathFromStaticUrl(value: string): string | null {
  if (value.startsWith("/")) return value;
  try { const url = new URL(value); if (url.protocol === "http:" || url.protocol === "https:") return `${url.pathname}${url.search}${url.hash}`; } catch {}
  return null;
}
