import ts from "typescript";
import { HTTP_METHODS, type HttpMethod } from "@neil-jay/core";

/** Lowercase Hono route-registration method names mapped to HTTP methods. */
export const ROUTE_METHODS = new Map<string, HttpMethod>(HTTP_METHODS.map((method) => [method.toLowerCase(), method]));

export function getOnMethods(expression: ts.Expression | undefined): HttpMethod[] {
  if (!expression) return [];
  const values = ts.isArrayLiteralExpression(expression) ? expression.elements : [expression];
  return values.flatMap((value) => {
    if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) return [];
    const method = value.text.toUpperCase();
    return ROUTE_METHODS.get(method.toLowerCase()) ?? [];
  });
}

/** Methods that return the Hono instance and can appear in a call chain. */
const CHAINABLE = new Set<string>([...ROUTE_METHODS.keys(), "route", "use", "on"]);

/**
 * Collect the local names bound to `Hono` imported from `hono` or a `hono/*`
 * subpath (e.g. `hono/tiny`).
 */
export function collectHonoConstructorNames(sourceFile: ts.SourceFile): Set<string> {
  const constructors = new Set<string>();
  const isHonoRequire = (node: ts.Expression): boolean => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === "require"
    && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])
    && (node.arguments[0].text === "hono" || node.arguments[0].text.startsWith("hono/"));
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const spec = statement.moduleSpecifier.text;
      if (spec === "hono" || spec.startsWith("hono/")) {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) {
          const importedName = element.propertyName?.text ?? element.name.text;
          if (importedName === "Hono") constructors.add(element.name.text);
        }
      }
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer && ts.isPropertyAccessExpression(declaration.initializer)
        && declaration.initializer.name.text === "Hono" && isHonoRequire(declaration.initializer.expression)) constructors.add(declaration.name.text);
      if (!declaration.initializer || !isHonoRequire(declaration.initializer)) continue;
      if (ts.isObjectBindingPattern(declaration.name)) for (const element of declaration.name.elements) {
        if (ts.isIdentifier(element.name) && (!element.propertyName || ts.isIdentifier(element.propertyName) && element.propertyName.text === "Hono")) constructors.add(element.name.text);
      }
    }
  }
  return constructors;
}

/** True for `new <ImportedHonoName>(...)` where the name was imported from `hono`. */
export function isHonoConstruction(node: ts.Node, constructors: ReadonlySet<string>): boolean {
  return ts.isNewExpression(node) && ts.isIdentifier(node.expression) && constructors.has(node.expression.text);
}

/**
 * Unwrap a chained receiver such as `app.get("/a", h)` in
 * `app.get("/a", h).post("/b", h2)` down to its root expression, collecting
 * any literal `.basePath("...")` segments encountered along the way.
 */
export function unwrapChain(expression: ts.Expression): { root: ts.Expression; basePath: string } {
  let basePath = "";
  let current = expression;
  while (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression)) {
    const name = current.expression.name.text;
    if (name === "basePath") {
      const arg = current.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) basePath = joinPaths(arg.text, basePath);
      current = current.expression.expression;
      continue;
    }
    if (!CHAINABLE.has(name)) break;
    current = current.expression.expression;
  }
  return { root: current, basePath };
}

export function joinPaths(a: string, b: string): string {
  const x = !a || a === "/" ? "" : a.replace(/\/$/, "");
  const y = !b || b === "/" ? "" : b.startsWith("/") ? b : `/${b}`;
  return `${x}${y}` || "/";
}

export function getHandlerName(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.getText();
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return "anonymous";
  return undefined;
}
