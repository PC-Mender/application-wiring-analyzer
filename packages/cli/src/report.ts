import type { AnalysisStatus, SideInfo } from "@neil-jay/core";
import type { AnalysisResult } from "./analysis.js";
import type { ParsedArgs } from "./args.js";
import { paint } from "./terminal.js";

const VERSION = "0.1.0";
const REPO_HOME = "https://github.com/PC-Mender/application-wiring-analyzer";

export function computeExitCode(analysis: AnalysisResult): number {
  if (analysis.status === "failed") return 2;
  const hasErrors = analysis.result.diagnostics.some((d) => d.severity === "error");
  if (analysis.strictIncomplete && (analysis.status === "partial" || analysis.status === "unsupported")) return 3;
  return hasErrors ? 1 : 0;
}

export function printReport(options: AnalysisResult & { showWarnings: boolean; parsed: ParsedArgs }) {
  const { frontendRequests, backendRoutes, result, projectRoot, showWarnings, topology, parsed, frontendExtractorUsed, backendExtractorUsed, frontendExtractorNote, backendExtractorNote, status, frontendFilesScanned, backendFilesScanned, frontendSkippedShadowedFetch, frontendSkippedByExclude, backendSkippedByExclude, frontendImportResolutionFailures, backendImportResolutionFailures } = options;
  console.log(`${paint.brand("◆ Application Wiring Analyzer")} ${paint.muted("— Check")}\n`);
  console.log(`${paint.label("Project:")} ${paint.path(projectRoot)}`);
  printStatusBanner(status);
  if (topology.languages.length) console.log(`${paint.label("Languages:")} ${paint.muted(topology.languages.map((x: any) => `${x.language} (${x.files})`).join(", "))}`);
  if (!parsed.frontend || !parsed.backend) printTopology(topology, parsed);
  console.log(`${paint.label("Frontend requests:")} ${paint.value(frontendRequests.length)}${frontendExtractorUsed && frontendExtractorUsed !== "none" ? paint.muted(` (${frontendExtractorUsed} extractor)`) : ""}`);
  console.log(`${paint.label("Backend routes:")}       ${paint.value(backendRoutes.length)}${backendExtractorUsed && backendExtractorUsed !== "none" ? paint.muted(` (${backendExtractorUsed} extractor)`) : ""}`);
  console.log(`${paint.label("Matched wiring:")}    ${paint.value(result.matches.length)}\n`);
  console.log(`${paint.label("Files scanned:")}       ${paint.muted(`frontend=${frontendFilesScanned}, backend=${backendFilesScanned}`)}`);
  console.log(`${paint.label("Items extracted:")}     ${paint.muted(`frontend=${frontendRequests.length}, backend=${backendRoutes.length}`)}`);
  if (frontendSkippedShadowedFetch > 0) console.log(`${paint.label("Shadowed fetch skip:")} ${paint.muted(`frontend=${frontendSkippedShadowedFetch}`)}`);
  if (frontendSkippedByExclude > 0 || backendSkippedByExclude > 0) console.log(`${paint.label("Skipped by exclude:")}  ${paint.muted(`frontend=${frontendSkippedByExclude}, backend=${backendSkippedByExclude}`)}`);
  if (frontendImportResolutionFailures > 0 || backendImportResolutionFailures > 0) console.log(`${paint.label("Import failures:")}     ${paint.warning(`frontend=${frontendImportResolutionFailures}, backend=${backendImportResolutionFailures}`)}`);
  console.log("");
  if (frontendExtractorNote) console.log(`${paint.info("ℹ")} ${paint.muted(frontendExtractorNote)}`);
  if (backendExtractorNote) console.log(`${paint.info("ℹ")} ${paint.muted(backendExtractorNote)}`);
  if (frontendExtractorNote || backendExtractorNote) console.log("");
  const errors = result.diagnostics.filter((d) => d.severity === "error"),
    warnings = result.diagnostics.filter((d) => d.severity === "warning"),
    visible = showWarnings ? result.diagnostics : errors;
  for (const d of visible) {
    const isError = d.severity === "error",
      mark = isError ? paint.error("✗") : paint.warning("⚠"),
      code = isError ? paint.error(d.code) : paint.warning(d.code),
      severity = isError ? paint.error(d.severity.toUpperCase()) : paint.warning(d.severity.toUpperCase()),
      loc = d.location;
    console.log(`${mark} ${code} ${severity}\n  ${paint.path(`${loc.file}:${loc.line}:${loc.column}`)}\n  ${d.message}\n`);
  }
  if (!showWarnings && warnings.length) {
    const counts = new Map();
    for (const d of warnings) counts.set(d.code, (counts.get(d.code) ?? 0) + 1);
    console.log(paint.warning("Warnings (summarized):"));
    for (const [code, count] of [...counts].sort()) console.log(`  ${paint.warning(code)}: ${paint.value(count)}`);
    console.log(`${paint.muted("  Use")} ${paint.command("--show-warnings")} ${paint.muted("to list warning details.")}\n`);
  }
  if (result.diagnostics.length) {
    const errorText = errors.length ? paint.error(`${errors.length} error(s)`) : paint.success("0 error(s)"),
      warningText = warnings.length ? paint.warning(`${warnings.length} warning(s)`) : paint.muted("0 warning(s)");
    console.log(`${errorText}, ${warningText}`);
  } else if (status === "complete") {
    console.log(paint.success("✓ No wiring problems detected."));
  }
  if (status === "partial" || status === "unsupported") {
    console.log();
    printIncompleteBanner(status, options);
  }
}

function printStatusBanner(status: AnalysisStatus) {
  const map: Record<AnalysisStatus, { label: string; icon: string; tone: "success" | "warning" | "error" }> = {
    complete: { label: "ANALYSIS COMPLETE", icon: "✓", tone: "success" },
    partial: { label: "ANALYSIS PARTIAL", icon: "⚠", tone: "warning" },
    unsupported: { label: "ANALYSIS UNSUPPORTED", icon: "⚠", tone: "warning" },
    failed: { label: "ANALYSIS FAILED", icon: "✗", tone: "error" },
  };
  const info = map[status];
  console.log(`${paint[info.tone](`${info.icon} ${info.label}`)}\n`);
}

function printIncompleteBanner(status: AnalysisStatus, options: { strictIncomplete: boolean; frontendExtractorNote?: string; backendExtractorNote?: string }) {
  if (status === "unsupported") {
    console.log(paint.warning("⚠ ANALYSIS UNSUPPORTED"));
  } else {
    console.log(paint.warning("⚠ ANALYSIS INCOMPLETE"));
  }
  if (options.frontendExtractorNote) console.log(paint.muted(options.frontendExtractorNote));
  if (options.backendExtractorNote) console.log(paint.muted(options.backendExtractorNote));
  if (!options.strictIncomplete) {
    console.log(`\n${paint.info("Tip:")} Pass ${paint.command("--strict-incomplete")} to return a non-zero exit code for incomplete analyses.`);
  }
}

function printTopology(topology: any, parsed: ParsedArgs) {
  console.log(`\n${paint.section("Discovering application structure...")}`);
  printSideTopology("Frontend", parsed.frontend, topology.frontends);
  printSideTopology("Backend", parsed.backend, topology.backends);
  console.log(`\n${paint.section("Analyzing wiring automatically...")}`);
}

function printSideTopology(side: "Frontend" | "Backend", override: string | null, detections: any[]) {
  const aligned = `${side}:`.padEnd(9);
  if (override) {
    console.log(`${paint.info("→")} ${paint.label(aligned)} explicit override ${paint.path(override)}`);
    return;
  }
  if (detections.length) {
    for (const x of detections) {
      const mark = x.supported ? paint.success("✓") : paint.warning("~");
      const suffix = x.supported ? "" : paint.warning(" (extractor not yet available)");
      console.log(`${mark} ${paint.label(aligned)} ${paint.value(x.framework)} ${paint.muted(`/`)} ${paint.muted(x.language)}  ${paint.path(x.root)}  ${paint.muted(`(${x.confidence} confidence)`)}${suffix}`);
    }
  } else {
    console.log(`${paint.warning("?")} ${paint.label(`${side}:`)} no framework root confidently identified; scanning entire project`);
  }
}

export function renderJson(analysis: AnalysisResult, exitCode: number): string {
  const diagnostics = [...analysis.result.diagnostics].sort((a, b) => {
    const f = a.location.file.localeCompare(b.location.file);
    if (f !== 0) return f;
    const l = a.location.line - b.location.line;
    if (l !== 0) return l;
    const c = a.location.column - b.location.column;
    if (c !== 0) return c;
    return a.code.localeCompare(b.code);
  });
  const matches = [...analysis.result.matches].sort((a, b) => {
    const af = a.frontend.location.file.localeCompare(b.frontend.location.file);
    if (af !== 0) return af;
    const al = a.frontend.location.line - b.frontend.location.line;
    if (al !== 0) return al;
    return a.frontend.location.column - b.frontend.location.column;
  });
  const scannedFiles = [...analysis.scannedFiles].sort((a, b) => {
    const r = a.role.localeCompare(b.role);
    if (r !== 0) return r;
    return a.path.localeCompare(b.path);
  });
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const mapSide = (s: SideInfo) => ({
    framework: s.framework,
    extractorUsed: s.extractorUsed,
    extractorNote: s.extractorNote ?? null,
    filesScanned: s.metadata.filesScanned,
    itemsExtracted: s.metadata.itemsExtracted,
    skippedShadowedFetch: s.metadata.skippedShadowedFetch,
    skippedByExclude: s.metadata.skippedByExclude,
    importResolutionFailures: s.metadata.importResolutionFailures,
  });
  const out = {
    schemaVersion: 1,
    projectRoot: analysis.projectRoot,
    status: analysis.status,
    frontends: analysis.frontends.map(mapSide),
    backends: analysis.backends.map(mapSide),
    scannedFiles,
    matches,
    diagnostics,
    summary: {
      frontendRequests: analysis.frontendRequests.length,
      backendRoutes: analysis.backendRoutes.length,
      matched: matches.length,
      errors,
      warnings,
    },
    notes: analysis.notes,
    exitCode,
  };
  return JSON.stringify(out, null, 2) + "\n";
}

export function renderSarif(analysis: AnalysisResult): string {
  const rules = [
    {
      id: "AWA001",
      shortDescription: { text: "Frontend request has no matching backend route." },
      fullDescription: { text: "A statically resolved frontend request has no structurally matching backend route." },
      defaultConfiguration: { level: "error" as const },
    },
    {
      id: "AWA002",
      shortDescription: { text: "Frontend request matches a backend path but not its HTTP method." },
      fullDescription: { text: "A frontend request matches a backend route path, but no backend route uses the requested HTTP method." },
      defaultConfiguration: { level: "error" as const },
    },
    {
      id: "AWA003",
      shortDescription: { text: "Frontend request URL or HTTP method could not be resolved statically." },
      fullDescription: { text: "A frontend request was detected, but its URL or HTTP method could not be resolved statically." },
      defaultConfiguration: { level: "warning" as const },
    },
    {
      id: "AWA004",
      shortDescription: { text: "Backend route has no detected frontend caller." },
      fullDescription: { text: "No supported frontend caller was detected for this backend route." },
      defaultConfiguration: { level: "warning" as const },
    },
  ];
  const results = analysis.result.diagnostics.map((d) => ({
    ruleId: d.code,
    level: d.severity === "error" ? "error" : "warning",
    message: { text: d.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: d.location.file },
          region: { startLine: d.location.line, startColumn: d.location.column },
        },
      },
    ],
  }));
  const sarif = {
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Application Wiring Analyzer",
            informationUri: REPO_HOME,
            version: VERSION,
            rules,
            properties: {
              status: analysis.status,
            },
          },
        },
        invocations: [
          {
            executionSuccessful: analysis.status !== "failed",
          },
        ],
        results,
      },
    ],
  };
  return JSON.stringify(sarif, null, 2) + "\n";
}
