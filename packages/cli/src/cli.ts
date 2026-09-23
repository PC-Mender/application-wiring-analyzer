import { resolve } from "node:path";
import { parseArgs, printHelp } from "./args.js";
import { analyzeProject, type AnalysisResult } from "./analysis.js";
import { computeExitCode, printReport, renderJson, renderSarif } from "./report.js";
import { runUi } from "./ui-server.js";
import { paint } from "./terminal.js";

export async function runCLI(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    printHelp();
    return 0;
  }
  if (!parsed.command || parsed.command === "ui" || parsed.command === "explore") {
    return runUi(parsed);
  }
  if (parsed.command !== "check") {
    console.error(`${paint.error("! Unknown command:")} ${paint.command(parsed.command)}\n`);
    printHelp();
    return 2;
  }
  let analysis: AnalysisResult;
  try {
    analysis = await analyzeProject(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const errAnalysis: AnalysisResult = {
      projectRoot: resolve(parsed.project ?? "."),
      topology: { languages: [], frontends: [], backends: [] },
      frontendRequests: [],
      backendRoutes: [],
      result: { matches: [], diagnostics: [] },
      frontendFramework: null,
      backendFramework: null,
      frontendExtractorUsed: "none",
      backendExtractorUsed: "none",
      frontendExtractorNote: "",
      backendExtractorNote: "",
      status: "failed",
      frontends: [],
      backends: [],
      scannedFiles: [],
      notes: [`Analysis failed: ${msg}`],
      frontendFilesScanned: 0,
      backendFilesScanned: 0,
      frontendSkippedByExclude: 0,
      backendSkippedByExclude: 0,
      frontendSkippedShadowedFetch: 0,
      backendImportResolutionFailures: 0,
      frontendImportResolutionFailures: 0,
      strictIncomplete: parsed.strictIncomplete,
    };
    if (parsed.format === "json") {
      process.stdout.write(renderJson(errAnalysis, 2));
    } else if (parsed.format === "sarif") {
      process.stdout.write(renderSarif(errAnalysis));
    } else {
      printReport({ ...errAnalysis, showWarnings: parsed.showWarnings, parsed });
    }
    return 2;
  }
  if (parsed.format === "json") {
    const exitCode = computeExitCode(analysis);
    process.stdout.write(renderJson(analysis, exitCode));
  } else if (parsed.format === "sarif") {
    process.stdout.write(renderSarif(analysis));
  } else {
    printReport({ ...analysis, showWarnings: parsed.showWarnings, parsed });
  }
  return computeExitCode(analysis);
}
