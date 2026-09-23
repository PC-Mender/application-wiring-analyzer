export type ProjectFile = { fileName: string; sourceText: string };
export type LanguageDetection = { language: string; files: number; extensions: string[] };
export type Detection = { kind: "frontend" | "backend"; framework: string; language: string; root: string; confidence: "high" | "medium"; evidence: string[]; supported: boolean };
export type ProjectTopology = { languages: LanguageDetection[]; frontends: Detection[]; backends: Detection[] };

export const SUPPORTED_FRONTENDS = new Set(["React", "Next.js"]);
export const SUPPORTED_BACKENDS = new Set(["Hono"]);

const FRONTEND_DIRS = new Set(["src", "app", "pages", "components", "client", "frontend", "web", "ui"]);
const BACKEND_DIRS = new Set(["src", "api", "routes", "server", "backend", "worker", "workers", "services"]);

export function detectLanguages(files: ProjectFile[]): LanguageDetection[] {
  const groups = new Map<string, { files: number; extensions: Set<string> }>();
  for (const file of files) {
    const ext = extension(file.fileName);
    const language = languageForExtension(ext);
    if (!language) continue;
    const value = groups.get(language) ?? { files: 0, extensions: new Set<string>() };
    value.files++; value.extensions.add(ext); groups.set(language, value);
  }
  return [...groups.entries()].map(([language, value]) => ({ language, files: value.files, extensions: [...value.extensions].sort() }))
    .sort((a, b) => b.files - a.files || a.language.localeCompare(b.language));
}

type Pkg = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name?: string;
  private?: boolean;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

const FRONTEND_PKG_MARKERS: Array<{ dep: string; framework: string; score?: number; requireImport?: boolean }> = [
  { dep: "next", framework: "Next.js", score: 10 },
  { dep: "react", framework: "React", score: 8 },
  { dep: "vue", framework: "Vue", score: 8 },
  { dep: "nuxt", framework: "Nuxt", score: 10 },
  { dep: "svelte", framework: "Svelte", score: 6 },
  { dep: "@sveltejs/kit", framework: "SvelteKit", score: 10 },
  { dep: "@angular/core", framework: "Angular", score: 8 },
  { dep: "solid-js", framework: "Solid", score: 6 },
  { dep: "astro", framework: "Astro", score: 8 },
];

const BACKEND_PKG_MARKERS: Array<{ dep: string; framework: string; score?: number }> = [
  { dep: "hono", framework: "Hono", score: 10 },
  { dep: "express", framework: "Express", score: 10 },
  { dep: "fastify", framework: "Fastify", score: 10 },
  { dep: "@nestjs/core", framework: "NestJS", score: 10 },
  { dep: "koa", framework: "Koa", score: 8 },
  { dep: "@hapi/hapi", framework: "Hapi", score: 8 },
  { dep: "restify", framework: "Restify", score: 8 },
  { dep: "elysia", framework: "Elysia", score: 10 },
  { dep: "@cloudflare/workers-types", framework: "Cloudflare Workers", score: 6 },
  { dep: "bun", framework: "Bun", score: 4 },
  { dep: "remix", framework: "Remix", score: 8 },
];

const CONFIG_FRONTEND_MARKERS: Array<{ pattern: RegExp; framework: string; score?: number }> = [
  { pattern: /next\.config\.(?:js|mjs|cjs|ts)$/, framework: "Next.js", score: 6 },
  { pattern: /nuxt\.config\.(?:js|mjs|cjs|ts)$/, framework: "Nuxt", score: 6 },
  { pattern: /svelte\.config\.(?:js|mjs|cjs|ts)$/, framework: "SvelteKit", score: 4 },
  { pattern: /astro\.config\.(?:js|mjs|cjs|ts)$/, framework: "Astro", score: 6 },
  { pattern: /vite\.config\.(?:js|mjs|cjs|ts)$/, framework: "Vite", score: 2 },
  { pattern: /angular\.json$/, framework: "Angular", score: 6 },
];

const CONFIG_BACKEND_MARKERS: Array<{ pattern: RegExp; framework: string; score?: number }> = [
  { pattern: /wrangler\.toml$/, framework: "Cloudflare Workers", score: 8 },
  { pattern: /nest-cli\.json$/, framework: "NestJS", score: 6 },
  { pattern: /serverless\.(?:yml|yaml|json)$/, framework: "Serverless", score: 4 },
];

const SOURCE_FRONTEND_MARKERS: Array<{ sourcePattern?: RegExp; pathPattern?: RegExp; framework: string; score: number; evidence: string }> = [
  { sourcePattern: /from\s+["']react["']|require\(["']react["']\)/, framework: "React", score: 4, evidence: "React import" },
  { sourcePattern: /from\s+["']react-dom(?:\/client)?["']|\bcreateRoot\s*\(/, framework: "React", score: 5, evidence: "React DOM entry" },
  { sourcePattern: /from\s+["']vue["']|createApp\s*\(/, framework: "Vue", score: 6, evidence: "Vue source" },
  { sourcePattern: /from\s+["']svelte["']/, pathPattern: /\.svelte$/, framework: "Svelte", score: 6, evidence: "Svelte source" },
  { sourcePattern: /@angular\/core|bootstrapApplication\s*\(/, framework: "Angular", score: 6, evidence: "Angular source" },
];

const SOURCE_BACKEND_MARKERS: Array<{ sourcePattern?: RegExp; pathPattern?: RegExp; framework: string; score: number; evidence: string }> = [
  { sourcePattern: /from\s+["']hono(?:\/[^"']*)?["']|require\(["']hono/, framework: "Hono", score: 6, evidence: "Hono import" },
  { sourcePattern: /new\s+Hono\s*[<(]/, framework: "Hono", score: 5, evidence: "Hono application/router" },
  { sourcePattern: /from\s+["']express["']|require\(["']express["']\)/, framework: "Express", score: 6, evidence: "Express import" },
  { sourcePattern: /from\s+["']fastify["']|require\(["']fastify["']\)/, framework: "Fastify", score: 6, evidence: "Fastify import" },
  { sourcePattern: /require\(["']koa["']\)|from\s+["']koa(?:\/[^"']*)?["']/, framework: "Koa", score: 6, evidence: "Koa import" },
  { sourcePattern: /from\s+["']@nestjs\//, framework: "NestJS", score: 6, evidence: "NestJS import" },
  { sourcePattern: /from\s+["']elysia["']|require\(["']elysia["']\)/, framework: "Elysia", score: 6, evidence: "Elysia import" },
];

interface SideAccumulator {
  score: number;
  evidence: string[];
  frameworkScores: Map<string, number>;
}

function addScore(acc: SideAccumulator, score: number, evidence: string, framework?: string): void {
  acc.score += score;
  acc.evidence.push(evidence);
  if (framework) acc.frameworkScores.set(framework, (acc.frameworkScores.get(framework) ?? 0) + score);
}

const SCRIPT_MARKERS: Array<{ pattern: RegExp; kind: "frontend" | "backend" | "either"; framework?: string; score?: number }> = [
  { pattern: /\bnext\b/, kind: "frontend", framework: "Next.js", score: 8 },
  { pattern: /\bnuxt\b/, kind: "frontend", framework: "Nuxt", score: 8 },
  { pattern: /\bremix\b/, kind: "frontend", framework: "Remix", score: 8 },
  { pattern: /\bastro\b/, kind: "frontend", framework: "Astro", score: 4 },
  { pattern: /\bnest\s+start\b/, kind: "backend", framework: "NestJS", score: 6 },
  { pattern: /\bwrangler\b/, kind: "backend", framework: "Cloudflare Workers", score: 6 },
  { pattern: /\belysia\b/, kind: "backend", framework: "Elysia", score: 6 },
];

export function discoverProjectTopology(files: ProjectFile[]): ProjectTopology {
  const frontend = new Map<string, { score: number; evidence: Set<string>; languages: Map<string, number>; frameworks: Map<string, number> }>();
  const backend = new Map<string, { score: number; evidence: Set<string>; languages: Map<string, number>; frameworks: Map<string, number> }>();
  const pkgJsonByDir = new Map<string, Pkg>();

  for (const file of files) {
    const path = normalize(file.fileName);
    const pkgDir = packageJsonDir(path);
    if (isPackageJson(path)) {
      try { pkgJsonByDir.set(pkgDir, JSON.parse(file.sourceText)); } catch { /* ignore malformed */ }
    }
  }

  for (const file of files) {
    const path = normalize(file.fileName), source = file.sourceText, language = languageForExtension(extension(path)) ?? "Unknown";
    const pkgDir = packageJsonDir(path);
    const pkg = pkgJsonByDir.get(pkgDir);

    const frontendAcc: SideAccumulator = { score: 0, evidence: [], frameworkScores: new Map() };
    const backendAcc: SideAccumulator = { score: 0, evidence: [], frameworkScores: new Map() };

    if (pkg) {
      const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
      for (const [markers, acc] of [[FRONTEND_PKG_MARKERS, frontendAcc], [BACKEND_PKG_MARKERS, backendAcc]] as const) {
        for (const marker of markers) {
          if (allDeps[marker.dep]) addScore(acc, marker.score ?? 5, `dependency: ${marker.dep}`, marker.framework);
        }
      }
      if (pkg.scripts) {
        for (const script of Object.values(pkg.scripts)) {
          if (!script) continue;
          for (const marker of SCRIPT_MARKERS) {
            if (!marker.pattern.test(script)) continue;
            const s = marker.score ?? 3;
            const evidence = `script: ${marker.pattern.source}`;
            if (marker.kind !== "backend") addScore(frontendAcc, s, evidence, marker.framework);
            if (marker.kind !== "frontend") addScore(backendAcc, s, evidence, marker.framework);
          }
        }
      }
    }

    for (const [markers, acc] of [[CONFIG_FRONTEND_MARKERS, frontendAcc], [CONFIG_BACKEND_MARKERS, backendAcc]] as const) {
      for (const marker of markers) {
        if (marker.pattern.test(path)) addScore(acc, marker.score ?? 4, `config file: ${path}`, marker.framework);
      }
    }

    for (const [markers, acc] of [[SOURCE_FRONTEND_MARKERS, frontendAcc], [SOURCE_BACKEND_MARKERS, backendAcc]] as const) {
      for (const marker of markers) {
        const matched = (marker.sourcePattern?.test(source) ?? false) || (marker.pathPattern?.test(path) ?? false);
        if (matched) addScore(acc, marker.score, marker.evidence, marker.framework);
      }
    }

    if (/\.(?:tsx|jsx)$/.test(path)) { frontendAcc.score += 1; frontendAcc.evidence.push("JSX/TSX source"); }

    if (/export\s+default\s*\{[\s\S]{0,500}\bfetch\s*\(/.test(source)) {
      backendAcc.score += 4;
      backendAcc.evidence.push("Cloudflare Worker fetch handler");
      if (!backendAcc.frameworkScores.has("Cloudflare Workers")) backendAcc.frameworkScores.set("Cloudflare Workers", 4);
    }

    const fFramework = winner(frontendAcc.frameworkScores) ?? "Web";
    const bFramework = winner(backendAcc.frameworkScores) ?? "Server";

    if (frontendAcc.score >= 5) addEvidence(frontend, inferRoot(path, "frontend"), frontendAcc.score, frontendAcc.evidence, language, fFramework, frontendAcc.frameworkScores);
    if (backendAcc.score >= 5) addEvidence(backend, inferRoot(path, "backend"), backendAcc.score, backendAcc.evidence, language, bFramework, backendAcc.frameworkScores);
  }

  return { languages: detectLanguages(files), frontends: finish(frontend, "frontend"), backends: finish(backend, "backend") };
}

function addEvidence(
  map: Map<string, { score: number; evidence: Set<string>; languages: Map<string, number>; frameworks: Map<string, number> }>,
  root: string,
  score: number,
  evidence: string[],
  language: string,
  framework: string,
  frameworkScores: Map<string, number>
) {
  const current = map.get(root) ?? { score: 0, evidence: new Set<string>(), languages: new Map<string, number>(), frameworks: new Map<string, number>() };
  current.score += score;
  for (const item of evidence) current.evidence.add(item);
  current.languages.set(language, (current.languages.get(language) ?? 0) + score);
  for (const [fw, fwScore] of frameworkScores.entries()) current.frameworks.set(fw, (current.frameworks.get(fw) ?? 0) + fwScore);
  if (frameworkScores.size === 0) current.frameworks.set(framework, (current.frameworks.get(framework) ?? 0) + score);
  map.set(root, current);
}

function finish(
  map: Map<string, { score: number; evidence: Set<string>; languages: Map<string, number>; frameworks: Map<string, number> }>,
  kind: Detection["kind"]
): Detection[] {
  return [...map.entries()].map(([root, value]) => {
    const framework = winner(value.frameworks) ?? "Unknown";
    return {
      kind,
      framework,
      language: winner(value.languages) ?? "Unknown",
      root,
      confidence: value.score >= 12 ? "high" as const : "medium" as const,
      evidence: [...value.evidence].sort(),
      supported: kind === "frontend" ? SUPPORTED_FRONTENDS.has(framework) : SUPPORTED_BACKENDS.has(framework),
    };
  }).sort((a, b) => b.confidence.localeCompare(a.confidence) || a.root.localeCompare(b.root));
}

function winner(map: Map<string, number>): string | null {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

function inferRoot(file: string, kind: Detection["kind"]): string {
  const parts = normalize(file).split("/");
  parts.pop();
  if (!parts.length) return ".";
  const markers = kind === "frontend" ? FRONTEND_DIRS : BACKEND_DIRS;
  for (let i = 0; i < parts.length; i++) {
    if (markers.has(parts[i].toLowerCase()) && i > 0) return parts.slice(0, i).join("/");
  }
  return parts.length > 1 ? parts[0] : parts.join("/") || ".";
}

function isPackageJson(path: string): boolean {
  const tail = path.split("/").pop() ?? "";
  return tail === "package.json";
}

function packageJsonDir(path: string): string {
  const parts = normalize(path).split("/");
  parts.pop();
  return parts.join("/") || ".";
}

function extension(path: string): string { const name = normalize(path).split("/").pop() ?? ""; const i = name.lastIndexOf("."); return i >= 0 ? name.slice(i).toLowerCase() : ""; }

function languageForExtension(ext: string): string | null {
  return ({
    ".ts": "TypeScript", ".tsx": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
    ".vue": "Vue SFC", ".svelte": "Svelte",
    ".py": "Python", ".go": "Go", ".rs": "Rust", ".java": "Java", ".kt": "Kotlin", ".php": "PHP", ".rb": "Ruby", ".cs": "C#",
    ".json": "JSON", ".toml": "TOML", ".yml": "YAML", ".yaml": "YAML",
  } as Record<string, string>)[ext] ?? null;
}

function normalize(path: string): string { return path.replaceAll("\\", "/").replace(/^\.\//, ""); }
