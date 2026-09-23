/** A re-export edge such as `export { x as y } from "./m"` or `export * from "./m"`. */
export interface ReExportEdge {
  publicName: string | "*";
  importedName: string | "*";
  file: string;
}

/**
 * Per-file module graph information. `TExport` is the adapter-specific value
 * associated with each exported symbol (e.g. a static constant or an instance
 * reference).
 */
export interface ModuleGraphFile<TExport> {
  fileName: string;
  exports: Map<string, TExport>;
  imports: Map<string, { file: string; imported: string }>;
  reExports: ReExportEdge[];
  unresolvedEdges: string[];
}

/**
 * Propagate re-exported symbols through the graph until a fixpoint is reached.
 * `equals` compares two export values for identity (defaults to `===`).
 */
export function propagateReExports<TExport>(
  infos: ReadonlyMap<string, ModuleGraphFile<TExport>>,
  equals: (a: TExport, b: TExport) => boolean = (a, b) => a === b,
): void {
  for (let pass = 0; pass < infos.size + 1; pass++) {
    let changed = false;
    for (const info of infos.values()) {
      for (const re of info.reExports) {
        const target = infos.get(re.file);
        if (!target) continue;
        if (re.publicName === "*" && re.importedName === "*") {
          for (const [name, value] of target.exports) {
            if (name === "default" || info.exports.has(name)) continue;
            info.exports.set(name, value);
            changed = true;
          }
        } else {
          const value = target.exports.get(re.importedName);
          if (value) {
            const existing = info.exports.get(re.publicName);
            if (!existing || !equals(existing, value)) {
              info.exports.set(re.publicName, value);
              changed = true;
            }
          }
        }
      }
    }
    if (!changed) break;
  }
}

/** Look up the export a local imported name resolves to, if any. */
export function lookupImportedExport<TExport>(
  infos: ReadonlyMap<string, ModuleGraphFile<TExport>>,
  info: ModuleGraphFile<TExport>,
  localName: string,
): TExport | undefined {
  const imported = info.imports.get(localName);
  if (!imported) return undefined;
  return infos.get(imported.file)?.exports.get(imported.imported);
}

/**
 * Collect every unresolvable module edge: unresolved edges recorded during
 * parsing, re-export targets missing an exported symbol, and imports whose
 * target file or exported symbol could not be found. Edges are keyed
 * `fileName#localName`.
 */
export function collectResolutionFailures<TExport>(
  infos: ReadonlyMap<string, ModuleGraphFile<TExport>>,
): { failedEdges: Set<string>; count: number } {
  const failedEdges = new Set<string>();
  for (const info of infos.values()) {
    for (const edge of info.unresolvedEdges) failedEdges.add(edge);
    for (const re of info.reExports) {
      const target = infos.get(re.file);
      if (target && re.importedName !== "*" && !target.exports.has(re.importedName)) {
        failedEdges.add(`${info.fileName}#${re.publicName}`);
      }
    }
  }
  for (const info of infos.values()) {
    for (const localName of info.imports.keys()) {
      if (lookupImportedExport(infos, info, localName) === undefined) {
        failedEdges.add(`${info.fileName}#${localName}`);
      }
    }
  }
  return { failedEdges, count: failedEdges.size };
}
