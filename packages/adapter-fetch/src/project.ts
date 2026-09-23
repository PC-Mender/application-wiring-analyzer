import ts from "typescript";
import type { FrontendRequest, HttpMethod } from "@neil-jay/core";
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
import { extractFetchRequests, type ExtractFetchResult } from "./extract.js";
import { extractFetchMethod, findFetchCallUsingParameters } from "./internal.js";

export interface ReactProjectFile { fileName: string; sourceText: string }

export interface ExtractProjectResult {
  requests: FrontendRequest[];
  skippedShadowedFetch: number;
  importResolutionFailures: number;
}

type ExportValue =
  | { kind: "constant"; value: string }
  | { kind: "wrapper"; method: HttpMethod | null; urlParamIndex: number };

interface FileInfo extends ModuleGraphFile<ExportValue> {
  sourceText: string;
}

/** Project-aware deterministic frontend extraction. */
export function extractReactProjectRequests(files: ReactProjectFile[]): ExtractProjectResult {
  const known = new Set(files.map((file) => normalizeFilePath(file.fileName)));
  const infos = new Map<string, FileInfo>();
  for (const input of files) {
    const info = parseFile(input, known);
    infos.set(info.fileName, info);
  }

  propagateReExports(infos);

  const { count: importResolutionFailures } = collectResolutionFailures(infos);
  const requests: FrontendRequest[] = [];
  let skippedShadowedFetch = 0;
  for (const info of infos.values()) {
    const constants = new Map<string, string>();
    const wrappers = new Map<string, HttpMethod | null>();
    const wrapperUrlParameters = new Map<string, number>();
    for (const localName of info.imports.keys()) {
      const target = lookupImportedExport(infos, info, localName);
      if (!target) continue;
      if (target.kind === "constant") constants.set(localName, target.value);
      else {
        wrappers.set(localName, target.method);
        wrapperUrlParameters.set(localName, target.urlParamIndex);
      }
    }
    const extracted: ExtractFetchResult = extractFetchRequests(info.sourceText, {
      fileName: info.fileName,
      externalConstants: constants,
      externalWrappers: wrappers,
      externalWrapperUrlParameters: wrapperUrlParameters,
    });
    requests.push(...extracted.requests);
    skippedShadowedFetch += extracted.skippedShadowedFetch;
  }
  return { requests, skippedShadowedFetch, importResolutionFailures };
}

function parseFile(input: ReactProjectFile, known: Set<string>): FileInfo {
  const fileName = normalizeFilePath(input.fileName);
  const sourceFile = ts.createSourceFile(fileName, input.sourceText, ts.ScriptTarget.Latest, true,
    inferScriptKind(fileName));
  const imports = new Map<string, { file: string; imported: string }>();
  const exports = new Map<string, ExportValue>();
  const reExports: FileInfo["reExports"] = [];
  const unresolvedEdges: string[] = [];
  const localValues = new Map<string, ExportValue>();

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith(".")) {
      const target = resolveModuleFile(fileName, statement.moduleSpecifier.text, known);
      const importTarget = target ?? joinRelativeSpecifier(fileName, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, { file: importTarget, imported: "default" });
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements)
          imports.set(element.name.text, { file: importTarget, imported: element.propertyName?.text ?? element.name.text });
      }
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer || !isStableBinding(sourceFile, declaration)) continue;
        const value = staticString(declaration.initializer);
        if (value !== null) localValues.set(declaration.name.text, { kind: "constant", value });
        else if ((ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) && declaration.initializer.parameters[0]?.name && ts.isIdentifier(declaration.initializer.parameters[0].name)) {
          const parameters = declaration.initializer.parameters.map((parameter) => parameter.name).filter(ts.isIdentifier).map((parameter) => parameter.text);
          const fetchMatch = findFetchCallUsingParameters(declaration.initializer.body, parameters);
          if (fetchMatch) localValues.set(declaration.name.text, { kind: "wrapper", method: extractFetchMethod(fetchMatch.call.arguments[1]), urlParamIndex: fetchMatch.parameterIndex });
        }
      }
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body && statement.parameters[0]?.name && ts.isIdentifier(statement.parameters[0].name)) {
      const parameters = statement.parameters.map((parameter) => parameter.name).filter(ts.isIdentifier).map((parameter) => parameter.text);
      const fetchMatch = findFetchCallUsingParameters(statement.body, parameters);
      if (fetchMatch) localValues.set(statement.name.text, { kind: "wrapper", method: extractFetchMethod(fetchMatch.call.arguments[1]), urlParamIndex: fetchMatch.parameterIndex });
    }
  }

  for (const statement of sourceFile.statements) {
    if (hasExportModifier(statement)) {
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) {
          const value = localValues.get(declaration.name.text); if (value) exports.set(declaration.name.text, value);
        }
      } else if (ts.isFunctionDeclaration(statement) && statement.name) {
        const value = localValues.get(statement.name.text); if (value) exports.set(statement.name.text, value);
      }
    }

    if (ts.isExportDeclaration(statement)) {
      const target = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith(".")
        ? resolveModuleFile(fileName, statement.moduleSpecifier.text, known) : null;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const imported = element.propertyName?.text ?? element.name.text;
          if (target) reExports.push({ publicName: element.name.text, importedName: imported, file: target });
          else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith(".")) {
            unresolvedEdges.push(`${fileName}#${element.name.text}`);
          } else {
            const value = localValues.get(imported); if (value) exports.set(element.name.text, value);
          }
        }
      } else if (!statement.exportClause && target) reExports.push({ publicName: "*", importedName: "*", file: target });
      else if (!statement.exportClause && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith(".")) {
        unresolvedEdges.push(`${fileName}#*:${statement.moduleSpecifier.text}`);
      }
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      const value = localValues.get(statement.expression.text); if (value) exports.set("default", value);
    }
  }
  return { fileName, sourceText: input.sourceText, exports, imports, reExports, unresolvedEdges };
}

function isStableBinding(sourceFile: ts.SourceFile, declaration: ts.VariableDeclaration): boolean {
  if (declaration.parent.flags & ts.NodeFlags.Const) return true;
  const name = ts.isIdentifier(declaration.name) ? declaration.name.text : null;
  if (!name) return false;
  let stable = true;
  const visit = (node: ts.Node): void => {
    if (node === declaration) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && ts.isIdentifier(node.left) && node.left.text === name) stable = false;
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && ts.isIdentifier(node.operand) && node.operand.text === name) stable = false;
    if (stable) ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return stable;
}

function staticString(expression: ts.Expression): string | null {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text;
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(expression.left);
    const right = staticString(expression.right);
    return left !== null && right !== null ? left + right : null;
  }
  return null;
}
