import { paint } from "./terminal.js";

export interface ParsedArgs {
  command: string | null;
  project: string | null;
  frontend: string | null;
  backend: string | null;
  help: boolean;
  showWarnings: boolean;
  port: number | null;
  host: string | null;
  format: "human" | "json" | "sarif";
  configPath: string | null;
  excludePatterns: string[];
  frontendOnly: boolean;
  backendOnly: boolean;
  strictIncomplete: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    project: null,
    frontend: null,
    backend: null,
    help: false,
    showWarnings: false,
    port: null,
    host: null,
    format: "human",
    configPath: null,
    excludePatterns: [],
    frontendOnly: false,
    backendOnly: false,
    strictIncomplete: false,
  };
  const args = [...argv];
  if (args[0] === "--help" || args[0] === "-h") return { ...result, help: true };
  if (args[0] && !args[0].startsWith("-")) {
    const first = args.shift();
    if (first && ["check", "ui", "explore"].includes(first)) {
      result.command = first;
    } else if (first) {
      result.command = "ui";
      result.project = first;
    }
  }
  while (args.length) {
    const flag = args.shift();
    if (!flag) break;
    if (flag === "--help" || flag === "-h") {
      result.help = true;
    } else if (flag === "--frontend") {
      result.frontend = requireValue(flag, args.shift());
    } else if (flag === "--backend") {
      result.backend = requireValue(flag, args.shift());
    } else if (flag === "--show-warnings" || flag === "--verbose") {
      result.showWarnings = true;
    } else if (flag === "--port") {
      result.port = Number(requireValue(flag, args.shift()));
    } else if (flag === "--host") {
      result.host = requireValue(flag, args.shift());
    } else if (flag === "--format" || flag === "-f") {
      const v = requireValue(flag, args.shift());
      if (v !== "human" && v !== "json" && v !== "sarif") throw new Error(`${flag} requires one of: human, json, sarif`);
      result.format = v;
    } else if (flag === "--config") {
      result.configPath = requireValue(flag, args.shift());
    } else if (flag === "--exclude") {
      result.excludePatterns.push(requireValue(flag, args.shift()));
    } else if (flag === "--frontend-only") {
      result.frontendOnly = true;
    } else if (flag === "--backend-only") {
      result.backendOnly = true;
    } else if (flag === "--strict-incomplete") {
      result.strictIncomplete = true;
    } else if (!result.project && !flag.startsWith("-")) {
      result.project = flag;
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return result;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}

export function printHelp() {
  console.log(`${paint.info("ℹ")} ${paint.brand("Application Wiring Analyzer")} ${paint.muted("v0.1")}

${paint.section("Usage:")}
  ${paint.command("awa [project]")} ${paint.option("[--port 4177]")}       ${paint.muted("Open Visual Explorer (default)")}
  ${paint.command("awa ui [project]")}                  ${paint.muted("Open Visual Explorer")}
  ${paint.command("awa check [project]")}               ${paint.muted("CI/terminal verification")}

${paint.section("Options:")}
  ${paint.option("--frontend <dir>")}   ${paint.muted("optional frontend override")}
  ${paint.option("--backend <dir>")}    ${paint.muted("optional backend override")}
  ${paint.option("--show-warnings")}    ${paint.muted("list warning details in check mode")}
  ${paint.option("--port <number>")}    ${paint.muted("dashboard port (default 4177)")}
  ${paint.option("--host <address>")}   ${paint.muted("dashboard host (default 127.0.0.1)")}
  ${paint.option("--format, -f <fmt>")} ${paint.muted("output format: human (default), json, sarif")}
  ${paint.option("--config <path>")}    ${paint.muted("path to awa.config.json (defaults to project root)")}
  ${paint.option("--exclude <glob>")}   ${paint.muted("repeatable exclude glob (appended to config excludes)")}
  ${paint.option("--frontend-only")}    ${paint.muted("skip backend analysis; allow complete with zero routes")}
  ${paint.option("--backend-only")}     ${paint.muted("skip frontend analysis; allow complete with zero requests")}
  ${paint.option("--strict-incomplete")} ${paint.muted("return exit code 3 for partial/unsupported analyses")}

${paint.muted("AWA detects repository languages, frameworks, and topology automatically by reading package.json, config files, and source imports. Supported extractors: React / Next.js (frontend), Hono (backend). Use --frontend/--backend to force analysis even on unsupported projects.")}

${paint.muted("Terminal colors are enabled automatically; set NO_COLOR=1 to disable them or FORCE_COLOR=1 when piping output.")}`);
}
