/** Normalize a file path to forward slashes for cross-platform comparisons. */
export function normalizeFilePath(fileName: string): string {
  return fileName.replaceAll("\\", "/");
}

/** Resolve a relative module specifier ("./x", "../x") against an importing file path. */
export function joinRelativeSpecifier(fromFile: string, specifier: string): string {
  const parts = normalizeFilePath(fromFile).split("/");
  parts.pop();
  for (const part of specifier.split("/")) {
    if (!part || part === ".") continue;
    if (part === ".." && parts.length > 0) parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

const CASE_INSENSITIVE_FILE_MAPS = new WeakMap<object, Map<string, string>>();

const MODULE_CANDIDATE_SUFFIXES = [
  "",
  ".ts", ".tsx", ".mts", ".cts",
  ".js", ".jsx", ".mjs", ".cjs",
  "/index.ts", "/index.tsx", "/index.mts", "/index.cts",
  "/index.js", "/index.jsx", "/index.mjs", "/index.cjs",
];

/**
 * Resolve a relative module specifier to a known file, trying the base path,
 * extension candidates, and index files.
 */
export function resolveModuleFile(fromFile: string, specifier: string, knownFiles: ReadonlySet<string>): string | null {
  const base = joinRelativeSpecifier(fromFile, specifier);
  let files: Map<string, string> | null = null;
  if (process.platform === "win32") {
    files = CASE_INSENSITIVE_FILE_MAPS.get(knownFiles) ?? null;
    if (!files) {
      files = new Map([...knownFiles].map((file) => [file.toLowerCase(), file]));
      CASE_INSENSITIVE_FILE_MAPS.set(knownFiles, files);
    }
  }
  for (const suffix of MODULE_CANDIDATE_SUFFIXES) {
    const candidate = `${base}${suffix}`;
    if (knownFiles.has(candidate)) return candidate;
    const match = files?.get(candidate.toLowerCase());
    if (match) return match;
  }
  return null;
}
