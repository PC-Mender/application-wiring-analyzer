import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { extractReactProjectRequests } from "@neil-jay/adapter-fetch";
import { extractHonoProjectRoutes } from "@neil-jay/adapter-hono";
import {
  analyzeWiring,
  type AnalysisStatus,
  type BackendRoute,
  type FrontendRequest,
  type ScannedFile,
  type SideInfo,
  type WiringAnalysis,
} from "@neil-jay/core";
import { SUPPORTED_BACKENDS, SUPPORTED_FRONTENDS, discoverProjectTopology } from "@neil-jay/framework-detector";
import type { ParsedArgs } from "./args.js";
import { loadConfig, matchesGlob, type AwaConfig } from "./config.js";

const IGNORED_DIRS = new Set(["node_modules", "dist", "build", ".git", ".next", ".wrangler", "coverage", ".turbo", ".parcel-cache", ".expo"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".py", ".go", ".rs", ".java", ".kt", ".php", ".rb", ".cs"]);
const TOPOLOGY_META_EXTENSIONS = new Set([".json", ".toml", ".yml", ".yaml"]);
const TOPOLOGY_META_FILES = new Set(["package.json", "wrangler.toml", "angular.json", "nest-cli.json", "serverless.yml", "serverless.yaml", "serverless.json"]);
const ANALYZABLE_JS_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"]);
const FRONTEND_ADAPTER_PINS = new Set(["fetch", "react"]);
const BACKEND_ADAPTER_PINS = new Set(["hono"]);

export interface AnalysisResult {
  projectRoot: string;
  topology: any;
  frontendRequests: FrontendRequest[];
  backendRoutes: BackendRoute[];
  result: WiringAnalysis;
  frontendFramework: string | null;
  backendFramework: string | null;
  frontendExtractorUsed: string;
  backendExtractorUsed: string;
  frontendExtractorNote: string;
  backendExtractorNote: string;
  status: AnalysisStatus;
  frontends: SideInfo[];
  backends: SideInfo[];
  scannedFiles: ScannedFile[];
  notes: string[];
  frontendFilesScanned: number;
  backendFilesScanned: number;
  frontendSkippedByExclude: number;
  backendSkippedByExclude: number;
  frontendSkippedShadowedFetch: number;
  backendImportResolutionFailures: number;
  frontendImportResolutionFailures: number;
  strictIncomplete: boolean;
}

export async function analyzeProject(parsed: ParsedArgs): Promise<AnalysisResult> {
  const projectRoot = resolve(parsed.project ?? ".");
  const config = await loadConfig(projectRoot, parsed.configPath !== null ? parsed.configPath : undefined);
  const excludePatterns = [...(config.exclude ?? []), ...parsed.excludePatterns];
  const frontendOnly = parsed.frontendOnly || config.frontendOnly || false;
  const backendOnly = parsed.backendOnly || config.backendOnly || false;
  const strictIncomplete = parsed.strictIncomplete || config.strictIncomplete === true;
  if (frontendOnly && backendOnly) {
    throw new Error("--frontend-only and --backend-only cannot be used together.");
  }

  const allSourceFiles = await collectSourceFiles({ exclude: excludePatterns, scanRoot: projectRoot, projectRoot });
  const allMetaFiles = await collectMetaFiles(projectRoot);
  const topologyFiles = [...allSourceFiles.files, ...allMetaFiles];
  const topologyProjectFiles = await Promise.all(
    topologyFiles.map(async (file) => ({ fileName: displayPath(projectRoot, file), sourceText: await readFile(file, "utf8") }))
  );
  const topology = discoverProjectTopology(topologyProjectFiles);

  const { frontendRoots, backendRoots, frontendFramework, backendFramework, frontendNote, backendNote, explicitSingleSided, frontendAdapterPin, backendAdapterPin } = resolveFrameworkRoots(
    parsed,
    topology,
    config
  );

  let frontendFilesResult = { files: [] as string[], skippedByExclude: 0 };
  let backendFilesResult = { files: [] as string[], skippedByExclude: 0 };

  if (!backendOnly) {
    frontendFilesResult = frontendRoots.length
      ? await collectSourceFilesForRoots(frontendRoots, projectRoot, excludePatterns)
      : allSourceFiles;
  }
  if (!frontendOnly) {
    backendFilesResult = backendRoots.length
      ? await collectSourceFilesForRoots(backendRoots, projectRoot, excludePatterns)
      : allSourceFiles;
  }

  const frontendFiles = frontendFilesResult.files.filter(isAnalyzableJsFile);
  const backendFiles = backendFilesResult.files.filter(isAnalyzableJsFile);
  const frontendProjectFiles = await Promise.all(
    frontendFiles.map(async (file) => ({ fileName: displayPath(projectRoot, file), sourceText: await readFile(file, "utf8") }))
  );
  const backendProjectFiles = await Promise.all(
    backendFiles.map(async (file) => ({ fileName: displayPath(projectRoot, file), sourceText: await readFile(file, "utf8") }))
  );

  const unsupportedCandidates = (detections: Array<{ framework: string }>) =>
    detections.map((x) => x.framework).join(", ") || "none";

  const frontendExtraction = runSideExtraction({
    skip: backendOnly,
    skipNote: "Skipping frontend analysis (--frontend-only or config backendOnly=true).",
    adapterPin: frontendAdapterPin,
    framework: frontendFramework,
    supportedFrameworks: SUPPORTED_FRONTENDS,
    forced: !!parsed.frontend,
    forcedLabel: frontendFramework ?? "React (forced)",
    files: frontendProjectFiles,
    extract: (files) => extractReactProjectRequests(files),
    genericLabel: "Generic JS/TS",
    genericNote: (count) => `No explicit frontend framework detected; running generic fetch/HTTP-request search on ${count} JS/TS file(s).`,
    unsupportedNote: `No supported frontend framework detected (found candidates: ${unsupportedCandidates(topology.frontends)}).`,
    priorNote: frontendNote ?? "",
  });
  const frontendRequests = frontendExtraction.result?.requests ?? [];
  const frontendSkippedShadowedFetch = frontendExtraction.result?.skippedShadowedFetch ?? 0;
  const frontendImportResolutionFailures = frontendExtraction.result?.importResolutionFailures ?? 0;
  const frontendExtractorUsed = frontendExtraction.extractorUsed;
  const frontendExtractorNote = frontendExtraction.extractorNote;

  const backendExtraction = runSideExtraction({
    skip: frontendOnly,
    skipNote: "Skipping backend analysis (--backend-only or config frontendOnly=true).",
    adapterPin: backendAdapterPin,
    framework: backendFramework,
    supportedFrameworks: SUPPORTED_BACKENDS,
    forced: !!parsed.backend,
    forcedLabel: "Hono (forced)",
    files: backendProjectFiles,
    extract: (files) => extractHonoProjectRoutes(files),
    genericLabel: "Best-effort Hono",
    genericNote: (count) => `No supported backend framework detected (found candidates: ${unsupportedCandidates(topology.backends)}). Running Hono-style route search on ${count} JS/TS file(s); routes may be incomplete.`,
    unsupportedNote: `No supported backend framework detected (found candidates: ${unsupportedCandidates(topology.backends)}).`,
    priorNote: backendNote ?? "",
  });
  const backendRoutes = backendExtraction.result?.routes ?? [];
  const backendImportResolutionFailures = backendExtraction.result?.importResolutionFailures ?? 0;
  const backendExtractorUsed = backendExtraction.extractorUsed;
  const backendExtractorNote = backendExtraction.extractorNote;

  const result = (frontendOnly || backendOnly)
    ? { matches: [], diagnostics: [] }
    : analyzeWiring(frontendRequests, backendRoutes);

  const scannedFiles: ScannedFile[] = [
    ...frontendFiles.map((f) => ({ role: "frontend" as const, path: displayPath(projectRoot, f) })),
    ...backendFiles.map((f) => ({ role: "backend" as const, path: displayPath(projectRoot, f) })),
  ];

  const frontendSideInfo = makeSideInfo({
    framework: frontendFramework,
    extractorUsed: frontendExtractorUsed,
    extractorNote: frontendExtractorNote,
    filesScanned: frontendFiles.length,
    itemsExtracted: frontendRequests.length,
    skippedShadowedFetch: frontendSkippedShadowedFetch,
    skippedByExclude: frontendFilesResult.skippedByExclude,
    importResolutionFailures: frontendImportResolutionFailures,
  });

  const backendSideInfo = makeSideInfo({
    framework: backendFramework,
    extractorUsed: backendExtractorUsed,
    extractorNote: backendExtractorNote,
    filesScanned: backendFiles.length,
    itemsExtracted: backendRoutes.length,
    skippedShadowedFetch: 0,
    skippedByExclude: backendFilesResult.skippedByExclude,
    importResolutionFailures: backendImportResolutionFailures,
  });

  const notes: string[] = [];
  if (frontendExtractorNote) notes.push(`ℹ ${frontendExtractorNote}`);
  if (backendExtractorNote) notes.push(`ℹ ${backendExtractorNote}`);

  const status = computeStatus({
    topology,
    parsed,
    frontendExtractorUsed,
    backendExtractorUsed,
    frontendFilesScanned: frontendFiles.length,
    backendFilesScanned: backendFiles.length,
    frontendItemsExtracted: frontendRequests.length,
    backendItemsExtracted: backendRoutes.length,
    frontendImportResolutionFailures,
    backendImportResolutionFailures,
    frontendOnly,
    backendOnly,
    explicitSingleSided,
  });

  const analysis: AnalysisResult = {
    projectRoot,
    topology,
    frontendRequests,
    backendRoutes,
    result,
    frontendFramework,
    backendFramework,
    frontendExtractorUsed,
    backendExtractorUsed,
    frontendExtractorNote,
    backendExtractorNote,
    status,
    frontends: [frontendSideInfo],
    backends: [backendSideInfo],
    scannedFiles,
    notes,
    frontendFilesScanned: frontendFiles.length,
    backendFilesScanned: backendFiles.length,
    frontendSkippedByExclude: frontendFilesResult.skippedByExclude,
    backendSkippedByExclude: backendFilesResult.skippedByExclude,
    frontendSkippedShadowedFetch,
    backendImportResolutionFailures,
    frontendImportResolutionFailures,
    strictIncomplete,
  };

  return analysis;
}

function computeStatus(opts: {
  topology: any;
  parsed: ParsedArgs;
  frontendExtractorUsed: string;
  backendExtractorUsed: string;
  frontendFilesScanned: number;
  backendFilesScanned: number;
  frontendItemsExtracted: number;
  backendItemsExtracted: number;
  frontendImportResolutionFailures: number;
  backendImportResolutionFailures: number;
  frontendOnly: boolean;
  backendOnly: boolean;
  explicitSingleSided: boolean;
}): AnalysisStatus {
  const { topology, parsed, frontendExtractorUsed, backendExtractorUsed, frontendFilesScanned, backendFilesScanned, frontendItemsExtracted, backendItemsExtracted, frontendImportResolutionFailures, backendImportResolutionFailures, frontendOnly, backendOnly, explicitSingleSided } = opts;

  const sides = [
    {
      skip: backendOnly,
      unsupportedDetected: topology.frontends.some((f: any) => !SUPPORTED_FRONTENDS.has(f.framework)),
      forced: !!parsed.frontend,
      extractorUsed: frontendExtractorUsed,
      filesScanned: frontendFilesScanned,
      genericLabel: "Generic JS/TS",
    },
    {
      skip: frontendOnly,
      unsupportedDetected: topology.backends.some((b: any) => !SUPPORTED_BACKENDS.has(b.framework)),
      forced: !!parsed.backend,
      extractorUsed: backendExtractorUsed,
      filesScanned: backendFilesScanned,
      genericLabel: "Best-effort Hono",
    },
  ];

  let isPartial = false;
  let isUnsupported = false;

  for (const side of sides) {
    if (side.skip) continue;
    if (side.unsupportedDetected && !side.forced && side.extractorUsed === "none") {
      isUnsupported = true;
    }
    if (side.extractorUsed === side.genericLabel && (side.filesScanned > 0 || side.unsupportedDetected)) {
      isPartial = true;
    }
  }

  if (frontendImportResolutionFailures > 0 || backendImportResolutionFailures > 0) {
    isPartial = true;
  }

  // `isUnsupported` is only ever set by a side satisfying the no-force
  // unsupported condition, so isUnsupported implies the stricter check below.
  if (isUnsupported && !isPartial) {
    return "unsupported";
  }

  if (isPartial || isUnsupported) {
    return "partial";
  }

  if (!frontendOnly && !backendOnly && !explicitSingleSided && !(frontendItemsExtracted > 0 && backendItemsExtracted > 0)) {
    return "partial";
  }

  return "complete";
}

/**
 * Shared frontend/backend extraction ladder: config pin → detected supported
 * framework → forced flag → generic best-effort fallback → unsupported note.
 */
function runSideExtraction<TResult>(opts: {
  skip: boolean;
  skipNote: string;
  adapterPin: string | null;
  framework: string | null;
  supportedFrameworks: ReadonlySet<string>;
  forced: boolean;
  forcedLabel: string;
  files: Array<{ fileName: string; sourceText: string }>;
  extract: (files: Array<{ fileName: string; sourceText: string }>) => TResult;
  genericLabel: string;
  genericNote: (fileCount: number) => string;
  unsupportedNote: string;
  priorNote: string;
}): { result: TResult | null; extractorUsed: string; extractorNote: string } {
  if (opts.skip) return { result: null, extractorUsed: "none", extractorNote: opts.skipNote };
  let extractorUsed = "none";
  let extractorNote = opts.priorNote;
  let result: TResult | null = null;
  if (opts.adapterPin) {
    result = opts.extract(opts.files);
    extractorUsed = `${opts.adapterPin} (pinned via config)`;
  } else if (opts.framework && opts.supportedFrameworks.has(opts.framework)) {
    result = opts.extract(opts.files);
    extractorUsed = opts.framework;
  } else if (opts.forced) {
    result = opts.extract(opts.files);
    extractorUsed = opts.forcedLabel;
  } else if (opts.files.length > 0) {
    result = opts.extract(opts.files);
    extractorUsed = opts.genericLabel;
    extractorNote = extractorNote || opts.genericNote(opts.files.length);
  } else {
    extractorNote = extractorNote || opts.unsupportedNote;
  }
  return { result, extractorUsed, extractorNote };
}

function makeSideInfo(opts: {
  framework: string | null;
  extractorUsed: string;
  extractorNote: string;
  filesScanned: number;
  itemsExtracted: number;
  skippedShadowedFetch: number;
  skippedByExclude: number;
  importResolutionFailures: number;
}): SideInfo {
  return {
    framework: opts.framework,
    extractorUsed: opts.extractorUsed,
    extractorNote: opts.extractorNote || undefined,
    metadata: {
      filesScanned: opts.filesScanned,
      itemsExtracted: opts.itemsExtracted,
      skippedShadowedFetch: opts.skippedShadowedFetch,
      skippedByExclude: opts.skippedByExclude,
      importResolutionFailures: opts.importResolutionFailures,
    },
  };
}

/** Normalize a config adapter pin; returns null when absent or not in the allowed set. */
function normalizeAdapterPin(raw: string | null, allowed: ReadonlySet<string>): string | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  return allowed.has(normalized) ? normalized : null;
}

/** Note to emit when a config adapter pin names an unknown adapter. */
function unknownAdapterPinNote(raw: string | null, allowed: ReadonlySet<string>, side: string): string | null {
  return raw && !allowed.has(raw.toLowerCase())
    ? `Unknown adapter pin '${raw}' for ${side}; falling back to auto detection.`
    : null;
}

/** Pick the best detected root/framework for a side, or a note when the best match is unsupported. */
function pickDetectedSide(opts: {
  detections: Array<{ framework: string; root: string }>;
  supported: ReadonlySet<string>;
  adapterPin: string | null;
  note: string | null;
  sideLabel: string;
  forceFlag: string;
  forceFramework: string;
}): { root: string | null; framework: string | null; note: string | null } {
  const best = opts.detections.filter((d) => opts.supported.has(d.framework))[0] ?? opts.detections[0];
  if (!best) return { root: null, framework: null, note: null };
  if (opts.supported.has(best.framework)) return { root: best.root, framework: best.framework, note: null };
  if (!opts.adapterPin && !opts.note) {
    return {
      root: null,
      framework: null,
      note: `Detected ${opts.sideLabel}: ${best.framework} (not yet supported by an extractor). Try ${opts.forceFlag} <dir> to force ${opts.forceFramework} extraction.`,
    };
  }
  return { root: null, framework: null, note: null };
}

function resolveFrameworkRoots(
  parsed: ParsedArgs,
  topology: any,
  config: AwaConfig
): { frontendRoots: string[]; backendRoots: string[]; frontendFramework: string | null; backendFramework: string | null; frontendNote: string | null; backendNote: string | null; explicitSingleSided: boolean; frontendAdapterPin: string | null; backendAdapterPin: string | null } {
  let frontendRoots = parsed.frontend ? [parsed.frontend] : [...(config.frontend?.roots ?? [])];
  let backendRoots = parsed.backend ? [parsed.backend] : [...(config.backend?.roots ?? [])];

  const explicitSingleSided =
    !!config.frontendOnly || !!config.backendOnly ||
    parsed.frontendOnly || parsed.backendOnly;

  const rawFrontendPin = config.frontend?.adapter ?? config.adapters?.frontend ?? null;
  const rawBackendPin = config.backend?.adapter ?? config.adapters?.backend ?? null;
  const frontendAdapterPin = normalizeAdapterPin(rawFrontendPin, FRONTEND_ADAPTER_PINS);
  const backendAdapterPin = normalizeAdapterPin(rawBackendPin, BACKEND_ADAPTER_PINS);

  let frontendFramework = parsed.frontend ? "React" : (config.frontend?.roots?.length ? "React" : null);
  let backendFramework = parsed.backend ? "Hono" : (config.backend?.roots?.length ? "Hono" : null);
  let frontendNote = unknownAdapterPinNote(rawFrontendPin, FRONTEND_ADAPTER_PINS, "frontend");
  let backendNote = unknownAdapterPinNote(rawBackendPin, BACKEND_ADAPTER_PINS, "backend");

  if (!parsed.frontend && frontendRoots.length === 0) {
    const pick = pickDetectedSide({
      detections: topology.frontends,
      supported: SUPPORTED_FRONTENDS,
      adapterPin: frontendAdapterPin,
      note: frontendNote,
      sideLabel: "frontend",
      forceFlag: "--frontend",
      forceFramework: "React",
    });
    if (pick.root) {
      frontendRoots = [pick.root];
      frontendFramework = pick.framework;
    }
    if (pick.note) frontendNote = pick.note;
  }
  if (!parsed.backend && backendRoots.length === 0) {
    const pick = pickDetectedSide({
      detections: topology.backends,
      supported: SUPPORTED_BACKENDS,
      adapterPin: backendAdapterPin,
      note: backendNote,
      sideLabel: "backend",
      forceFlag: "--backend",
      forceFramework: "Hono",
    });
    if (pick.root) {
      backendRoots = [pick.root];
      backendFramework = pick.framework;
    }
    if (pick.note) backendNote = pick.note;
  }
  return { frontendRoots, backendRoots, frontendFramework, backendFramework, frontendNote, backendNote, explicitSingleSided, frontendAdapterPin, backendAdapterPin };
}

function isIgnoredPath(pathName: string): boolean {
  return pathName.split(/[\\\\/]/).some((part) => IGNORED_DIRS.has(part.toLowerCase()));
}

async function isIgnoredSymlinkDirectory(entryName: string, fullPath: string): Promise<boolean> {
  if (IGNORED_DIRS.has(entryName.toLowerCase())) return true;
  const canonical = await realpath(fullPath).catch(() => null);
  return canonical !== null && isIgnoredPath(canonical);
}

function isTopologyMetaFile(file: string): boolean {
  const name = basename(file).toLowerCase();
  if (TOPOLOGY_META_FILES.has(name)) return true;
  if (TOPOLOGY_META_EXTENSIONS.has(extname(name).toLowerCase())) return true;
  if (/\.config\.(?:js|mjs|cjs|ts)$/i.test(name)) return true;
  return false;
}

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function collectSourceFiles(opts: { exclude?: string[]; scanRoot: string; projectRoot: string }): Promise<{ files: string[]; skippedByExclude: number }> {
  const { exclude = [], scanRoot, projectRoot } = opts;
  const canonicalProjectRoot = await realpath(projectRoot).catch(() => resolve(projectRoot));
  const canonicalScanRoot = await realpath(scanRoot).catch(() => resolve(scanRoot));
  if (!isWithinRoot(canonicalProjectRoot, canonicalScanRoot)) {
    throw new Error(`Scan root must be inside the project: ${scanRoot}`);
  }
  const info = await stat(scanRoot).catch(() => null);
  if (!info) throw new Error(`Directory not found: ${scanRoot}`);
  if (!info.isDirectory()) throw new Error(`Expected a directory: ${scanRoot}`);
  const files: string[] = [];
  let skippedByExclude = 0;
  const visited = new Set<string>();
  const MAX_DEPTH = 64;
  async function walk(dir: string, depth: number) {
    if (depth >= MAX_DEPTH) return;
    const canonical = await realpath(dir).catch(() => null);
    if (canonical) {
      if (!isWithinRoot(canonicalProjectRoot, canonical)) return;
      if (visited.has(canonical)) return;
      visited.add(canonical);
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
      const full = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const targetInfo = await stat(full).catch(() => null);
        if (targetInfo?.isDirectory()) {
          if (!(await isIgnoredSymlinkDirectory(entry.name, full))) await walk(full, depth + 1);
        } else if (targetInfo?.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && !entry.name.toLowerCase().endsWith(".d.ts")) {
          const canonicalFile = await realpath(full).catch(() => null);
          if (!canonicalFile || !isWithinRoot(canonicalProjectRoot, canonicalFile)) continue;
          const rel = relative(projectRoot, full).replaceAll("\\", "/");
          const excluded = exclude.length > 0 && matchesGlob(rel, exclude as string[]);
          if (excluded) skippedByExclude++;
          else files.push(full);
        }
      } else if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && !entry.name.toLowerCase().endsWith(".d.ts")) {
        const rel = relative(projectRoot, full).replaceAll("\\", "/");
        const excluded = exclude.length > 0 && matchesGlob(rel, exclude as string[]);
        if (excluded) skippedByExclude++;
        else files.push(full);
      }
    }
  }
  await walk(scanRoot, 0);
  return { files: files.sort(), skippedByExclude };
}

async function collectSourceFilesForRoots(
  roots: string[],
  projectRoot: string,
  exclude: string[],
): Promise<{ files: string[]; skippedByExclude: number }> {
  const resolvedRoots = roots.map((root) => {
    const scanRoot = resolve(projectRoot, root);
    if (!isWithinRoot(resolve(projectRoot), scanRoot)) {
      throw new Error(`Scan root must be inside the project: ${root}`);
    }
    return scanRoot;
  });
  const results = await Promise.all(
    resolvedRoots.map((scanRoot) => collectSourceFiles({
      exclude,
      scanRoot,
      projectRoot,
    })),
  );
  const files = [...new Set(results.flatMap((result) => result.files))].sort();
  return {
    files,
    skippedByExclude: results.reduce((total, result) => total + result.skippedByExclude, 0),
  };
}

async function collectMetaFiles(root: string): Promise<string[]> {
  const canonicalProjectRoot = await realpath(root).catch(() => resolve(root));
  const files: string[] = [];
  const visited = new Set<string>();
  const MAX_DEPTH = 64;
  async function walk(dir: string, depth: number) {
    if (depth >= MAX_DEPTH) return;
    const canonical = await realpath(dir).catch(() => null);
    if (canonical) {
      if (!isWithinRoot(canonicalProjectRoot, canonical)) return;
      if (visited.has(canonical)) return;
      visited.add(canonical);
    }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
      const full = resolve(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const targetInfo = await stat(full).catch(() => null);
        if (targetInfo?.isDirectory()) {
          if (!(await isIgnoredSymlinkDirectory(entry.name, full))) await walk(full, depth + 1);
        } else if (targetInfo?.isFile() && isTopologyMetaFile(entry.name) && !entry.name.toLowerCase().endsWith(".d.ts")) {
          const canonicalFile = await realpath(full).catch(() => null);
          if (!canonicalFile || !isWithinRoot(canonicalProjectRoot, canonicalFile)) continue;
          files.push(full);
        }
      } else if (entry.isDirectory()) {
        await walk(full, depth + 1);
      } else if (entry.isFile() && isTopologyMetaFile(entry.name) && !entry.name.toLowerCase().endsWith(".d.ts")) {
        files.push(full);
      }
    }
  }
  await walk(root, 0);
  return files.sort();
}

function isAnalyzableJsFile(file: string): boolean {
  return ANALYZABLE_JS_EXTENSIONS.has(extname(file).toLowerCase());
}

function displayPath(projectRoot: string, file: string): string {
  const rel = relative(projectRoot, file);
  return rel && !rel.startsWith("..") ? rel.replaceAll("\\", "/") : file;
}
