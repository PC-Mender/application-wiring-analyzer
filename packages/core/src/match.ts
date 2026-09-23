import type { BackendRoute, FrontendRequest } from "./model.js";
import type { WiringAnalysis, WiringDiagnostic, WiringMatch } from "./diagnostics.js";

/** Match extracted frontend requests to extracted backend routes. */
export function analyzeWiring(
  frontendRequests: FrontendRequest[],
  backendRoutes: BackendRoute[],
): WiringAnalysis {
  const matches: WiringMatch[] = [];
  const diagnostics: WiringDiagnostic[] = [];
  const matchedBackend = new Set<number>();
  const mismatchReportedFor = new Set<BackendRoute>();

  for (const frontend of frontendRequests) {
    if (frontend.normalizedPath === null || frontend.method === null) {
      diagnostics.push({
        code: "AWA003",
        severity: "warning",
        message: unresolvedMessage(frontend),
        location: frontend.location,
        frontend,
      });
      continue;
    }

    const pathCandidates = backendRoutes
      .map((backend, index) => ({ backend, index }))
      .filter(({ backend }) => backend.normalizedPath === frontend.normalizedPath);

    const exact = pathCandidates.find(({ backend }) => backend.method === frontend.method);
    if (exact) {
      matches.push({ frontend, backend: exact.backend });
      matchedBackend.add(exact.index);
      continue;
    }

    if (pathCandidates.length > 0) {
      diagnostics.push({
        code: "AWA002",
        severity: "error",
        message: `${frontend.method} ${frontend.normalizedPath} matches a backend path, but not its HTTP method. Backend methods: ${uniqueMethods(pathCandidates.map(({ backend }) => backend.method)).join(", ")}.`,
        location: frontend.location,
        frontend,
        backend: pathCandidates[0]?.backend,
      });
      if (pathCandidates[0]) mismatchReportedFor.add(pathCandidates[0].backend);
      continue;
    }

    diagnostics.push({
      code: "AWA001",
      severity: "error",
      message: `${frontend.method} ${frontend.normalizedPath} has no matching backend route.`,
      location: frontend.location,
      frontend,
    });
  }

  backendRoutes.forEach((backend, index) => {
    if (matchedBackend.has(index)) return;

    if (mismatchReportedFor.has(backend)) return;

    diagnostics.push({
      code: "AWA004",
      severity: "warning",
      message: backend.normalizedPath === null
        ? `${backend.method} ${backend.rawPath} could not be normalized; no detected frontend caller.`
        : `${backend.method} ${backend.normalizedPath} has no detected frontend caller.`,
      location: backend.location,
      backend,
    });
  });

  return { matches, diagnostics };
}

function unresolvedMessage(frontend: FrontendRequest): string {
  if (frontend.normalizedPath === null && frontend.method === null) {
    return "Frontend request URL and HTTP method could not be resolved statically.";
  }
  if (frontend.normalizedPath === null) return "Frontend request URL could not be resolved statically.";
  return `HTTP method for ${frontend.normalizedPath} could not be resolved statically.`;
}

function uniqueMethods<T>(values: T[]): T[] {
  return [...new Set(values)];
}
