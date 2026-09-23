import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const bin = resolve(repoRoot, "packages/cli/dist/bin/awa.js");
const run = (...args) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd: repoRoot });
const runIn = (cwd, ...args) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd });
const runWithEnv = (env, ...args) =>
  spawnSync(process.execPath, [bin, ...args], { encoding: "utf8", cwd: repoRoot, env: { ...process.env, ...env } });
function makeTmpProject(tree) {
  const root = mkdtempSync(tmpdir() + sep + "awa-cli-");
  for (const [relPath, content] of Object.entries(tree)) {
    const full = resolve(root, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return root;
}

test("check scans a project end-to-end and exits 1 on wiring errors", () => {
  const result = run("check", "fixtures/end-to-end", "--frontend", "src/frontend", "--backend", "src/backend");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Frontend requests: 3/);
  assert.match(result.stdout, /Backend routes:.*\b2\b/);
  assert.match(result.stdout, /Matched wiring:\s+1/);
  assert.match(result.stdout, /AWA002/);
  assert.match(result.stdout, /AWA001/);
  assert.match(result.stdout, /AWA004/);
});

test("help exits successfully", () => {
  const result = run("--help");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Application Wiring Analyzer v0\.1/);
});

test("check auto-discovers topology when roots are omitted", () => {
  const result = run("check", "fixtures/end-to-end");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /Discovering application structure/);
  assert.match(result.stdout, /Analyzing wiring automatically/);
  assert.match(result.stdout, /Frontend requests: 3/);
  assert.match(result.stdout, /Backend routes:.*\b2\b/);
});

test("unsupported Express backend reports partial/unsupported status and never complete banner", () => {
  const jsonResult = run("check", "fixtures/cli-scenarios/unsupported-express", "--format", "json");
  const jsonParsed = JSON.parse(jsonResult.stdout);
  assert.notEqual(jsonParsed.status, "complete", "status should never be complete for Express backend");
  assert.ok(jsonParsed.status === "partial" || jsonParsed.status === "unsupported", `expected partial or unsupported, got ${jsonParsed.status}`);
  const humanResult = run("check", "fixtures/cli-scenarios/unsupported-express", "--format", "human");
  assert.ok(!humanResult.stdout.includes("No wiring problems detected."), "human output should never contain 'No wiring problems detected.'");
});

test("shadowed fetch false positives report 0 extracted items and >= 3 skipped shadowed", () => {
  const result = run("check", "fixtures/cli-scenarios/shadowed-fetch", "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const frontend = parsed.frontends[0];
  assert.ok(frontend.skippedShadowedFetch >= 3, `expected skippedShadowedFetch >= 3, got ${frontend.skippedShadowedFetch}`);
  assert.equal(frontend.itemsExtracted, 0, `expected itemsExtracted === 0, got ${frontend.itemsExtracted}`);
});

test("config exclude patterns skip files reporting skippedByExclude >= 2", () => {
  const result = run("check", "fixtures/cli-scenarios/config-exclude", "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const frontend = parsed.frontends[0];
  assert.ok(frontend.skippedByExclude >= 2, `expected skippedByExclude >= 2, got ${frontend.skippedByExclude}`);
});

test("frontendOnly project reports complete with zero backend routes and exit 0", () => {
  const result = run("check", "fixtures/cli-scenarios/frontend-only", "--format", "json");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "complete", `expected status complete, got ${parsed.status}`);
  assert.equal(parsed.summary.backendRoutes, 0, `expected backendRoutes === 0, got ${parsed.summary.backendRoutes}`);
  const errorCount = parsed.diagnostics.filter((d) => d.severity === "error").length;
  assert.equal(errorCount, 0, `expected 0 error diagnostics, got ${errorCount}`);
  assert.equal(result.status, 0, `expected exit code 0, got ${result.status}`);
});

test("backendOnly project reports complete with zero frontend requests and exit 0", () => {
  const result = run("check", "fixtures/cli-scenarios/backend-only", "--format", "json");
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "complete", `expected status complete, got ${parsed.status}`);
  assert.equal(parsed.summary.frontendRequests, 0, `expected frontendRequests === 0, got ${parsed.summary.frontendRequests}`);
  assert.equal(result.status, 0, `expected exit code 0, got ${result.status}`);
});

test("json and sarif roundtrip produce correct schemas and all AWA diagnostic codes", () => {
  const jsonResult = run("check", "fixtures/cli-scenarios/json-sarif", "--format", "json");
  const jsonParsed = JSON.parse(jsonResult.stdout);
  assert.equal(jsonParsed.schemaVersion, 1);
  assert.ok(jsonParsed.diagnostics.length >= 4, `expected diagnostics >= 4, got ${jsonParsed.diagnostics.length}`);
  const codes = new Set(jsonParsed.diagnostics.map((d) => d.code));
  assert.ok(codes.has("AWA001"), "expected AWA001 present");
  assert.ok(codes.has("AWA002"), "expected AWA002 present");
  assert.ok(codes.has("AWA003"), "expected AWA003 present");
  assert.ok(codes.has("AWA004"), "expected AWA004 present");
  const sarifResult = run("check", "fixtures/cli-scenarios/json-sarif", "--format", "sarif");
  const sarifParsed = JSON.parse(sarifResult.stdout);
  assert.equal(sarifParsed.version, "2.1.0");
  const driver = sarifParsed.runs[0].tool.driver;
  assert.ok(driver.rules.length === 4, `expected 4 SARIF rules, got ${driver.rules.length}`);
  assert.ok(driver.rules.every((rule) => rule.fullDescription?.text), "expected every SARIF rule to include fullDescription");
  assert.ok(sarifParsed.runs[0].results.length >= 4, `expected SARIF results >= 4, got ${sarifParsed.runs[0].results.length}`);
  assert.equal(sarifParsed.runs[0].invocations[0].executionSuccessful, true);
  const validStatuses = ["complete", "partial", "unsupported", "failed"];
  assert.ok(validStatuses.includes(driver.properties.status), `expected valid status, got ${driver.properties.status}`);
});

test("--strict-incomplete returns exit code 3 for partial/unsupported analyses", () => {
  const withoutStrict = run("check", "fixtures/cli-scenarios/strict-incomplete", "--format", "json");
  assert.notEqual(withoutStrict.status, 3, `without --strict-incomplete exit code should not be 3, got ${withoutStrict.status}`);
  const withStrict = run("check", "fixtures/cli-scenarios/strict-incomplete", "--strict-incomplete", "--format", "json");
  assert.equal(withStrict.status, 3, `with --strict-incomplete expected exit code 3, got ${withStrict.status}`);
});

test("adapter pinning: per-side backend.adapter pins hono and suppresses unsupported-framework notes", () => {
  const project = makeTmpProject({
    "package.json": JSON.stringify({ name: "pin-demo", dependencies: { hono: "^4.0.0", express: "^4.18.0", react: "^18.0.0" } }),
    "awa.config.json": JSON.stringify({ backend: { adapter: "hono" } }),
    "src/index.ts": `import { Hono } from "hono";
const app = new Hono();
app.get("/users", (c) => c.json([]));
export default app;`,
    "src/client.tsx": `import { useState } from "react";
export function Users() {
  const [u, setU] = useState([]);
  fetch("/users").then(r => r.json()).then(setU);
  return <div>{u.length}</div>;
}`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const be = parsed.backends[0];
  assert.ok(be.extractorUsed && be.extractorUsed.includes("pinned via config"), `expected pinned label in extractorUsed (per-side), got: ${be.extractorUsed}`);
  assert.ok(parsed.notes.every(n => !/Express.*not yet supported/i.test(n)), `expected no Express-unsupported note in parsed.notes, got: ${JSON.stringify(parsed.notes)}`);
  assert.ok(be.itemsExtracted >= 1, `expected backend itemsExtracted >= 1, got ${be.itemsExtracted}`);
});

test("adapter pinning: top-level adapters.backend pins hono independently", () => {
  const project = makeTmpProject({
    "package.json": JSON.stringify({ name: "pin-demo", dependencies: { hono: "^4.0.0", express: "^4.18.0", react: "^18.0.0" } }),
    "awa.config.json": JSON.stringify({ adapters: { backend: "hono" } }),
    "src/index.ts": `import { Hono } from "hono";
const app = new Hono();
app.get("/users", (c) => c.json([]));
export default app;`,
    "src/client.tsx": `import { useState } from "react";
export function Users() {
  const [u, setU] = useState([]);
  fetch("/users").then(r => r.json()).then(setU);
  return <div>{u.length}</div>;
}`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const be = parsed.backends[0];
  assert.ok(be.extractorUsed && be.extractorUsed.includes("pinned via config"), `expected pinned label in extractorUsed (top-level), got: ${be.extractorUsed}`);
  assert.ok(parsed.notes.every(n => !/Express.*not yet supported/i.test(n)), `expected no Express-unsupported note in parsed.notes, got: ${JSON.stringify(parsed.notes)}`);
  assert.ok(be.itemsExtracted >= 1, `expected backend itemsExtracted >= 1, got ${be.itemsExtracted}`);
});

test("adapter pinning: per-side backend.adapter wins over top-level adapters.backend when values differ", () => {
  const project = makeTmpProject({
    "package.json": JSON.stringify({ name: "pin-demo", dependencies: { hono: "^4.0.0", react: "^18.0.0" } }),
    "awa.config.json": JSON.stringify({ adapters: { backend: "unknown" }, backend: { adapter: "hono" } }),
    "src/index.ts": `import { Hono } from "hono";
const app = new Hono();
app.get("/items", (c) => c.json([]));
export default app;`,
    "src/client.tsx": `export function App() { fetch("/items"); return null; }`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const be = parsed.backends[0];
  assert.ok(be.extractorUsed && be.extractorUsed.includes("hono") && be.extractorUsed.includes("pinned via config"), `expected hono pinned via per-side to win, got: ${be.extractorUsed}`);
  assert.ok(be.itemsExtracted >= 1, `expected backend itemsExtracted >= 1, got ${be.itemsExtracted}`);
});

test("adapter pinning: frontend adapter pin via config.frontend.adapter works", () => {
  const project = makeTmpProject({
    "package.json": JSON.stringify({ name: "pin-fe", dependencies: { react: "^18.0.0", vue: "^3.0.0", hono: "^4.0.0" } }),
    "awa.config.json": JSON.stringify({ frontend: { adapter: "react" } }),
    "src/App.tsx": `export function App() { fetch("/data"); return null; }`,
    "src/server.ts": `import { Hono } from "hono"; const app = new Hono(); app.get("/data", c => c.json([])); export default app;`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const fe = parsed.frontends[0];
  assert.ok(fe.extractorUsed && fe.extractorUsed.includes("pinned via config"), `expected frontend pinned label, got: ${fe.extractorUsed}`);
  assert.ok(fe.itemsExtracted >= 1, `expected frontend itemsExtracted >= 1, got ${fe.itemsExtracted}`);
});

test("adapter pinning: unknown adapter pin generates fallback note and falls back to auto detection", () => {
  const project = makeTmpProject({
    "package.json": JSON.stringify({ name: "pin-unknown", dependencies: { hono: "^4.0.0", react: "^18.0.0" } }),
    "awa.config.json": JSON.stringify({ backend: { adapter: "bogus" } }),
    "src/index.ts": `import { Hono } from "hono";
const app = new Hono();
app.get("/x", (c) => c.json([]));
export default app;`,
    "src/client.tsx": `export function App() { fetch("/x"); return null; }`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const be = parsed.backends[0];
  assert.ok(parsed.notes.some(n => /Unknown adapter pin/i.test(n)), `expected unknown-adapter note in parsed.notes, got: ${JSON.stringify(parsed.notes)}`);
  assert.ok(!be.extractorUsed.includes("pinned via config"), `expected no pinned label for unknown adapter, got: ${be.extractorUsed}`);
});

test("only frontend.roots set without explicit frontendOnly yields status partial not complete", () => {
  const project = makeTmpProject({
    "awa.config.json": JSON.stringify({ frontend: { roots: ["src/web"] } }),
    "src/web/App.tsx": `export function App() { fetch("/api/items"); return null; }`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  assert.notEqual(parsed.status, "complete", `expected status != complete, got ${parsed.status}`);
  assert.equal(parsed.status, "partial", `expected status partial, got ${parsed.status}`);
});

test("only backend.roots set without explicit backendOnly yields status partial not complete", () => {
  const project = makeTmpProject({
    "awa.config.json": JSON.stringify({ backend: { roots: ["src/api"] } }),
    "src/api/server.ts": `import { Hono } from "hono";
const app = new Hono();
app.get("/api/items", (c) => c.json([]));
export default app;`,
    "package.json": JSON.stringify({ name: "backend-partial", dependencies: { hono: "^4.0.0" } }),
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  assert.notEqual(parsed.status, "complete", `expected status != complete, got ${parsed.status}`);
  assert.equal(parsed.status, "partial", `expected status partial, got ${parsed.status}`);
});

test("exclude matching is project-root-relative: same skippedByExclude from two distinct cwds", () => {
  const fixture = resolve(repoRoot, "fixtures/cli-scenarios/config-exclude");
  const altCwd = mkdtempSync(tmpdir() + sep + "awa-alt-cwd-");
  const run1 = runIn(repoRoot, "check", fixture, "--format", "json");
  const run2 = runIn(altCwd, "check", fixture, "--format", "json");
  const p1 = JSON.parse(run1.stdout);
  const p2 = JSON.parse(run2.stdout);
  const fe1 = p1.frontends[0];
  const fe2 = p2.frontends[0];
  assert.equal(fe1.skippedByExclude, fe2.skippedByExclude, `skippedByExclude differs across cwds: ${fe1.skippedByExclude} vs ${fe2.skippedByExclude}`);
  assert.ok(fe1.skippedByExclude >= 2, `expected skippedByExclude >= 2, got ${fe1.skippedByExclude}`);
});

test("analysis output is cwd-independent: summary/status/diagnostic codes match from outside project dir", () => {
  const fixture = resolve(repoRoot, "fixtures/end-to-end");
  const altCwd = mkdtempSync(tmpdir() + sep + "awa-outside-");
  const run1 = runIn(repoRoot, "check", fixture, "--frontend", "src/frontend", "--backend", "src/backend", "--format", "json");
  const run2 = runIn(altCwd, "check", fixture, "--frontend", "src/frontend", "--backend", "src/backend", "--format", "json");
  const p1 = JSON.parse(run1.stdout);
  const p2 = JSON.parse(run2.stdout);
  assert.equal(p1.status, p2.status, `status mismatch: ${p1.status} vs ${p2.status}`);
  assert.deepEqual(p1.summary, p2.summary, `summary mismatch`);
  const c1 = p1.diagnostics.map(d => d.code).sort();
  const c2 = p2.diagnostics.map(d => d.code).sort();
  assert.deepEqual(c1, c2, `diagnostic code mismatch: ${c1.join(",")} vs ${c2.join(",")}`);
  assert.equal(run1.status, run2.status, `exit code mismatch: ${run1.status} vs ${run2.status}`);
});

test("strictIncomplete in awa.config.json returns exit code 3 for partial analysis (config-only, no CLI flag)", () => {
  const project = makeTmpProject({
    "awa.config.json": JSON.stringify({ strictIncomplete: true, frontend: { roots: ["src/client"] } }),
    "src/client/App.tsx": `export function App() { fetch("/api/items"); return null; }`,
  });
  const withoutStrictProject = makeTmpProject({
    "awa.config.json": JSON.stringify({ strictIncomplete: false, frontend: { roots: ["src/client"] } }),
    "src/client/App.tsx": `export function App() { fetch("/api/items"); return null; }`,
  });
  const withStrict = runIn(project, "check", project, "--format", "json");
  assert.equal(withStrict.status, 3, `with strictIncomplete:true in config expected exit code 3, got ${withStrict.status}. stdout: ${withStrict.stdout}. stderr: ${withStrict.stderr}`);
  const p = JSON.parse(withStrict.stdout);
  assert.equal(p.status, "partial", `expected partial status, got ${p.status}`);
  assert.equal(p.exitCode, 3, `expected exitCode field = 3 in JSON, got ${p.exitCode}`);
  const withoutStrict = runIn(withoutStrictProject, "check", withoutStrictProject, "--format", "json");
  assert.notEqual(withoutStrict.status, 3, `with strictIncomplete:false exit code should not be 3, got ${withoutStrict.status}`);
});

test("exclude globs with anchored nested-root patterns match project-relative paths", () => {
  const project = makeTmpProject({
    "awa.config.json": JSON.stringify({
      frontend: { roots: ["src/client"] },
      exclude: ["src/client/generated/**"]
    }),
    "src/client/App.tsx": `export function App() { fetch("/items"); return null; }`,
    "src/client/generated/client.ts": `export const generated = 1; fetch("/should-be-excluded");`,
    "src/client/generated/api.ts": `export const api = 2; fetch("/should-also-be-excluded");`,
    "src/client/utils/helpers.ts": `export function h() {}`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const fe = parsed.frontends[0];
  assert.equal(fe.skippedByExclude, 2, `expected 2 files skipped by exclude (generated dir), got ${fe.skippedByExclude}. scannedFiles: ${JSON.stringify(parsed.scannedFiles)}`);
  const scannedFrontendPaths = parsed.scannedFiles.filter((s) => s.role === "frontend").map((s) => s.path);
  assert.ok(scannedFrontendPaths.some((p) => p.includes("App.tsx")), `expected App.tsx to be scanned, got: ${JSON.stringify(scannedFrontendPaths)}`);
  assert.ok(!scannedFrontendPaths.some((p) => p.includes("generated")), `expected generated files to be excluded, got: ${JSON.stringify(scannedFrontendPaths)}`);
});

test("CLI frontend and backend roots override configured roots", () => {
  const project = makeTmpProject({
    "awa.config.json": JSON.stringify({ frontend: { roots: ["wrong/frontend"] }, backend: { roots: ["wrong/backend"] } }),
    "src/frontend/App.tsx": `export function App() { fetch("/ok"); return null; }`,
    "src/backend/routes.ts": `import { Hono } from "hono"; const app = new Hono(); app.get("/ok", h);`,
    "wrong/frontend/no.tsx": `fetch("/wrong/frontend");`,
    "wrong/backend/no.ts": `import { Hono } from "hono"; const app = new Hono(); app.get("/wrong/backend", h);`,
  });
  const result = runIn(project, "check", project, "--frontend", "src/frontend", "--backend", "src/backend", "--format", "json");
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.scannedFiles.some((file) => file.path === "src/frontend/App.tsx"));
  assert.ok(parsed.scannedFiles.some((file) => file.path === "src/backend/routes.ts"));
  assert.ok(!parsed.scannedFiles.some((file) => file.path.includes("wrong/")));
});

test("contradictory single-sided modes fail with exit code 2", () => {
  const project = makeTmpProject({
    "src/App.tsx": `fetch("/api/items");`,
    "awa.config.json": JSON.stringify({ frontendOnly: true, backendOnly: true }),
  });
  const result = runIn(project, "check", project, "--format", "json");
  assert.equal(result.status, 2, `expected exit code 2, got ${result.status}: ${result.stdout} ${result.stderr}`);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.status, "failed");
  assert.match(parsed.notes.join(" "), /cannot be used together/);
});

test("configured multiple roots are all scanned", () => {
  const project = makeTmpProject({
    "awa.config.json": JSON.stringify({ frontend: { roots: ["apps/web", "packages/shared"] }, frontendOnly: true }),
    "apps/web/App.tsx": `fetch("/web");`,
    "packages/shared/shared.ts": `fetch("/shared");`,
  });
  const result = runIn(project, "check", project, "--format", "json");
  const parsed = JSON.parse(result.stdout);
  const frontendPaths = parsed.scannedFiles.filter((file) => file.role === "frontend").map((file) => file.path);
  assert.ok(frontendPaths.includes("apps/web/App.tsx"));
  assert.ok(frontendPaths.includes("packages/shared/shared.ts"));
});

test("human output supports ANSI color, standard opt-outs, and clean JSON", () => {
  const coloredHelp = runWithEnv({ FORCE_COLOR: "1" }, "--help");
  assert.equal(coloredHelp.status, 0);
  assert.match(coloredHelp.stdout, /\u001B\[/);

  const coloredCheck = runWithEnv({ FORCE_COLOR: "1" }, "check", "fixtures/end-to-end", "--frontend", "src/frontend", "--backend", "src/backend");
  assert.match(coloredCheck.stdout, /\u001B\[/);

  const disabled = runWithEnv({ FORCE_COLOR: "1", NO_COLOR: "1" }, "--help");
  assert.equal(disabled.status, 0);
  assert.doesNotMatch(disabled.stdout, /\u001B\[/);

  const json = runWithEnv({ FORCE_COLOR: "1" }, "check", "fixtures/end-to-end", "--frontend", "src/frontend", "--backend", "src/backend", "--format", "json");
  assert.doesNotMatch(json.stdout, /\u001B\[/);
  assert.equal(JSON.parse(json.stdout).schemaVersion, 1);
});
