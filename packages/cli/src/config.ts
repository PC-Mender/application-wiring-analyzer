import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type AwaConfig = {
  frontend?: { roots?: string[]; adapter?: string };
  backend?: { roots?: string[]; adapter?: string };
  exclude?: string[];
  adapters?: { frontend?: string; backend?: string };
  frontendOnly?: boolean;
  backendOnly?: boolean;
  strictIncomplete?: boolean;
};

const DEFAULT_CONFIG: AwaConfig = {};

export async function loadConfig(projectRoot: string, configPath?: string): Promise<AwaConfig> {
  const resolvedConfigPath = configPath ? resolve(projectRoot, configPath) : join(projectRoot, "awa.config.json");
  const content = await readFile(resolvedConfigPath, "utf8").catch(() => null);
  if (!content) return { ...DEFAULT_CONFIG };
  const parsed = JSON.parse(content) as AwaConfig;
  return mergeConfig(DEFAULT_CONFIG, parsed);
}

function mergeConfig(a: AwaConfig, b: AwaConfig): AwaConfig {
  const result: AwaConfig = { ...a };
  if (b.frontend) result.frontend = { ...(a.frontend ?? {}), ...b.frontend };
  if (b.backend) result.backend = { ...(a.backend ?? {}), ...b.backend };
  if (b.exclude) result.exclude = [...(a.exclude ?? []), ...b.exclude];
  if (b.adapters) result.adapters = { ...(a.adapters ?? {}), ...b.adapters };
  if (b.frontendOnly !== undefined) result.frontendOnly = b.frontendOnly;
  if (b.backendOnly !== undefined) result.backendOnly = b.backendOnly;
  if (b.strictIncomplete !== undefined) result.strictIncomplete = b.strictIncomplete;
  return result;
}

const CASE_INSENSITIVE = process.platform === "win32";

function matchSegment(pattern: string, str: string): boolean {
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (".+^${}()|[]\\/".includes(ch)) re += "\\" + ch;
    else re += ch;
  }
  re += "$";
  return new RegExp(re, CASE_INSENSITIVE ? "i" : "").test(str);
}

function matchGlobRecursive(patterns: string[], paths: string[], p: number, s: number): boolean {
  while (p < patterns.length && patterns[p] === "") p++;
  while (s < paths.length && paths[s] === "") s++;
  if (p === patterns.length) return s === paths.length;
  if (patterns[p] === "**") {
    if (matchGlobRecursive(patterns, paths, p + 1, s)) return true;
    while (s < paths.length) {
      if (matchGlobRecursive(patterns, paths, p + 1, s + 1)) return true;
      s++;
    }
    return false;
  }
  if (s === paths.length) return false;
  return matchSegment(patterns[p], paths[s]) && matchGlobRecursive(patterns, paths, p + 1, s + 1);
}

export function matchesGlob(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchGlobRecursive(pattern.split("/"), path.split("/"), 0, 0));
}
