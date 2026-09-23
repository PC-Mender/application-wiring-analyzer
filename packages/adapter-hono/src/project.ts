import ts from "typescript";
import { normalizeBackendPath, type BackendRoute, type HttpMethod, type SourceLocation } from "@neil-jay/core";
import {
  collectResolutionFailures,
  hasExportModifier,
  inferScriptKind,
  joinRelativeSpecifier,
  lookupImportedExport,
  normalizeFilePath,
  propagateReExports,
  resolveModuleFile,
  type ModuleGraphFile,
} from "@neil-jay/analyzer-typescript";
import {
  collectHonoConstructorNames,
  getHandlerName,
  isHonoConstruction,
  getOnMethods,
  joinPaths,
  ROUTE_METHODS,
  unwrapChain,
} from "./internal.js";

export interface HonoProjectFile { fileName: string; sourceText: string }

export interface ExtractHonoProjectResult {
  routes: BackendRoute[];
  importResolutionFailures: number;
}

interface LocalRoute { instance: string; method: HttpMethod; path: string; handler?: string; location: SourceLocation }
interface Mount { parent: string; prefix: string; childLocal: string; childFile?: string; location: SourceLocation }
type InstanceRef = { file: string; instance: string };

interface FileInfo extends ModuleGraphFile<InstanceRef> {
  instances: Set<string>;
  routes: LocalRoute[];
  mounts: Mount[];
}

/** Extract routes across a small Hono project, including app.route('/prefix', importedRouter). */
export function extractHonoProjectRoutes(files: HonoProjectFile[]): ExtractHonoProjectResult {
  const known = new Set(files.map((f) => normalizeFilePath(f.fileName)));
  const infos = new Map<string, FileInfo>();
  for (const file of files) infos.set(normalizeFilePath(file.fileName), parseFile(file, known));

  propagateReExports(infos, (a, b) => a.file === b.file && a.instance === b.instance);

  const { count: importResolutionFailures } = collectResolutionFailures(infos);

  const resolveSymbol = (fileName: string, local: string): InstanceRef | null => {
    const info = infos.get(fileName);
    if (!info) return null;
    if (info.instances.has(local)) return { file: fileName, instance: local };
    return lookupImportedExport(infos, info, local) ?? null;
  };

  const mountedChildren = new Set<string>();
  for (const [fileName, info] of infos) for (const m of info.mounts) {
    const child = resolveSymbol(fileName, m.childLocal);
    if (child) mountedChildren.add(`${child.file}#${child.instance}`);
  }

  const out: BackendRoute[] = [];
  const walk = (fileName: string, instance: string, prefix: string, stack: Set<string>) => {
    const key = `${fileName}#${instance}`;
    if (stack.has(key)) return;
    const info = infos.get(fileName);
    if (!info) return;
    const next = new Set(stack);
    next.add(key);
    for (const r of info.routes.filter((r) => r.instance === instance)) {
      const full = joinPaths(prefix, r.path);
      out.push({ kind: "backend-route", method: r.method, rawPath: full, normalizedPath: normalizeBackendPath(full), handler: r.handler, location: r.location });
    }
    for (const m of info.mounts.filter((m) => m.parent === instance)) {
      const child = resolveSymbol(fileName, m.childLocal);
      if (child) walk(child.file, child.instance, joinPaths(prefix, m.prefix), next);
    }
  };

  for (const [fileName, info] of infos) for (const instance of info.instances) {
    if (!mountedChildren.has(`${fileName}#${instance}`)) walk(fileName, instance, "", new Set());
  }
  return { routes: dedupe(out), importResolutionFailures };
}

function parseFile(input: HonoProjectFile, known: Set<string>): FileInfo {
  const fileName = normalizeFilePath(input.fileName);
  const sourceFile = ts.createSourceFile(fileName, input.sourceText, ts.ScriptTarget.Latest, true, inferScriptKind(fileName));
  const constructors = collectHonoConstructorNames(sourceFile);
  const instances = new Set<string>();
  const instanceBasePaths = new Map<string, string>();
  const exports = new Map<string, InstanceRef>();
  const imports = new Map<string, { file: string; imported: string }>();
  const routes: LocalRoute[] = [];
  const mounts: Mount[] = [];
  const reExports: FileInfo["reExports"] = [];
  const unresolvedEdges: string[] = [];
  let inlineCount = 0;

  const addInstance = (name: string, basePath: string): void => {
    instances.add(name);
    if (basePath) instanceBasePaths.set(name, joinPaths(instanceBasePaths.get(name) ?? "", basePath));
  };
  const enclosingVariableName = (node: ts.Node): string | null => {
    for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    }
    return null;
  };

  // Collect relative imports so mounted routers can be resolved across files.
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const spec = statement.moduleSpecifier.text;
    if (!spec.startsWith(".")) continue;
    const target = resolveModuleFile(fileName, spec, known) ?? joinRelativeSpecifier(fileName, spec);
    if (statement.importClause?.name) imports.set(statement.importClause.name.text, { file: target, imported: "default" });
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, { file: target, imported: element.propertyName?.text ?? element.name.text });
      }
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const chain = unwrapChain(node.initializer);
      if (isHonoConstruction(chain.root, constructors)) addInstance(node.name.text, chain.basePath);
      else if (ts.isIdentifier(chain.root) && instances.has(chain.root.text)) {
        addInstance(node.name.text, joinPaths(instanceBasePaths.get(chain.root.text) ?? "", chain.basePath));
      }
      if (instances.has(node.name.text) && hasExportModifier(node.parent.parent)) {
        exports.set(node.name.text, { file: fileName, instance: node.name.text });
      }
    }
    if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression)) {
      exports.set("default", { file: fileName, instance: node.expression.text });
    }
    if (ts.isExportDeclaration(node)) {
      const target = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")
        ? resolveModuleFile(fileName, node.moduleSpecifier.text, known)
        : null;
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (target) reExports.push({ publicName: element.name.text, importedName: imported, file: target });
          else if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")) {
            unresolvedEdges.push(`${fileName}#${element.name.text}`);
          } else if (instances.has(imported)) {
            exports.set(element.name.text, { file: fileName, instance: imported });
          }
        }
      } else if (!node.exportClause && target) {
        reExports.push({ publicName: "*", importedName: "*", file: target });
      } else if (!node.exportClause && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith(".")) {
        unresolvedEdges.push(`${fileName}#*:${node.moduleSpecifier.text}`);
      }
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const name = node.expression.name.text;
      const method = ROUTE_METHODS.get(name);
      if (method || name === "route" || name === "use" || name === "on") {
        const chain = unwrapChain(node.expression.expression);
        let receiver: string | null = null;
        let prefix = "";
        if (ts.isIdentifier(chain.root) && instances.has(chain.root.text)) {
          receiver = chain.root.text;
          prefix = joinPaths(instanceBasePaths.get(receiver) ?? "", chain.basePath);
        } else if (isHonoConstruction(chain.root, constructors)) {
          receiver = enclosingVariableName(node) ?? `<inline${inlineCount++}>`;
          instances.add(receiver);
          prefix = chain.basePath;
        }
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const location = { file: fileName, line: start.line + 1, column: start.character + 1 };
        const methods = method ? [method] : name === "on" ? getOnMethods(node.arguments[0]) : [];
        const pathArg = name === "on" ? node.arguments[1] : node.arguments[0];
        const handlerArg = name === "on" ? node.arguments[2] : node.arguments[1];
        if (receiver && methods.length > 0 && pathArg && (ts.isStringLiteral(pathArg) || ts.isNoSubstitutionTemplateLiteral(pathArg))) {
          for (const routeMethod of methods) routes.push({ instance: receiver, method: routeMethod, path: joinPaths(prefix, pathArg.text), handler: getHandlerName(handlerArg), location });
        }
        const childArg = name === "use" ? node.arguments[1] : node.arguments[1];
        if (receiver && (name === "route" || name === "use") && pathArg && (ts.isStringLiteral(pathArg) || ts.isNoSubstitutionTemplateLiteral(pathArg)) && childArg && ts.isIdentifier(childArg)) {
          mounts.push({ parent: receiver, prefix: joinPaths(prefix, pathArg.text), childLocal: childArg.text, location });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { fileName, instances, exports, imports, routes, mounts, reExports, unresolvedEdges };
}

function dedupe(routes: BackendRoute[]): BackendRoute[] {
  const seen = new Set<string>();
  return routes.filter((r) => {
    const key = `${r.method}|${r.normalizedPath}|${r.location.file}|${r.location.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
