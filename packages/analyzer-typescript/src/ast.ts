import ts from "typescript";

/** True when the node carries an `export` modifier. */
export function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}
