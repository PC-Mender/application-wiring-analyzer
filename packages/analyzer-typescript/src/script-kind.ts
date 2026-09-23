import ts from "typescript";

/** Infer the TypeScript ScriptKind for a file name. Defaults to TS. */
export function inferScriptKind(fileName: string): ts.ScriptKind {
  const f = fileName.toLowerCase();
  if (f.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (f.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (f.endsWith(".js") || f.endsWith(".mjs") || f.endsWith(".cjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
