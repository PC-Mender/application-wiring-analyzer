/** Normalize a Hono-style route path for structural comparison. */
export function normalizeBackendPath(path: string): string {
  return normalizeComparablePath(path.replace(/:[A-Za-z_$][\w$]*/g, ":dynamic"));
}

/** Normalize an already-reduced frontend path for structural comparison. */
export function normalizeFrontendPath(path: string): string {
  return normalizeComparablePath(path);
}

function normalizeComparablePath(path: string): string {
  const withoutQuery = path.split("?", 1)[0] ?? path;
  const withoutHash = withoutQuery.split("#", 1)[0] ?? withoutQuery;
  return withoutHash.length > 1 ? withoutHash.replace(/\/$/, "") : withoutHash;
}
