import assert from "node:assert/strict";
import test from "node:test";
import {
  collectResolutionFailures,
  inferScriptKind,
  joinRelativeSpecifier,
  lookupImportedExport,
  normalizeFilePath,
  propagateReExports,
  resolveModuleFile,
} from "../dist/index.js";

test("inferScriptKind maps extensions to script kinds", () => {
  const TS = inferScriptKind("a.ts");
  assert.notEqual(inferScriptKind("a.tsx"), TS);
  assert.equal(inferScriptKind("a.MTS"), TS);
  assert.equal(inferScriptKind("a.mts"), TS);
  assert.equal(inferScriptKind("a.cts"), TS);
  const JS = inferScriptKind("a.js");
  assert.equal(inferScriptKind("a.mjs"), JS);
  assert.equal(inferScriptKind("a.cjs"), JS);
  assert.notEqual(inferScriptKind("a.jsx"), JS);
  assert.equal(inferScriptKind("a.unknown"), TS);
});

test("normalizeFilePath converts backslashes", () => {
  assert.equal(normalizeFilePath("a\\b\\c.ts"), "a/b/c.ts");
  assert.equal(normalizeFilePath("a/b/c.ts"), "a/b/c.ts");
});

test("joinRelativeSpecifier resolves ./ and ../ segments", () => {
  assert.equal(joinRelativeSpecifier("src/pages/home.ts", "../api/client"), "src/api/client");
  assert.equal(joinRelativeSpecifier("src/pages/home.ts", "./util"), "src/pages/util");
  assert.equal(joinRelativeSpecifier("home.ts", "./x"), "x");
});

test("resolveModuleFile tries extension and index candidates", () => {
  const known = new Set(["src/api/client.ts", "src/shared/index.ts"]);
  assert.equal(resolveModuleFile("src/pages/home.ts", "../api/client", known), "src/api/client.ts");
  assert.equal(resolveModuleFile("src/pages/home.ts", "../shared", known), "src/shared/index.ts");
  assert.equal(resolveModuleFile("src/pages/home.ts", "../missing", known), null);
});

test("resolves module files case-insensitively on Windows", { skip: process.platform !== "win32" }, () => {
  const known = new Set(["src/api/Routes.ts"]);
  assert.equal(resolveModuleFile("src/pages/home.ts", "../api/routes", known), "src/api/Routes.ts");
});

function file(fileName, { exports = {}, imports = {}, reExports = [], unresolvedEdges = [] } = {}) {
  return {
    fileName,
    exports: new Map(Object.entries(exports)),
    imports: new Map(Object.entries(imports)),
    reExports,
    unresolvedEdges,
  };
}

test("propagateReExports forwards named and star re-exports to a fixpoint", () => {
  const infos = new Map([
    ["a.ts", file("a.ts", { exports: { inner: "A" } })],
    ["b.ts", file("b.ts", { reExports: [{ publicName: "inner", importedName: "inner", file: "a.ts" }] })],
    ["c.ts", file("c.ts", { reExports: [{ publicName: "*", importedName: "*", file: "b.ts" }] })],
  ]);
  propagateReExports(infos);
  assert.equal(infos.get("b.ts").exports.get("inner"), "A");
  assert.equal(infos.get("c.ts").exports.get("inner"), "A");
});

test("propagateReExports does not forward default through star re-exports", () => {
  const infos = new Map([
    ["a.ts", file("a.ts", { exports: { default: "D", named: "N" } })],
    ["b.ts", file("b.ts", { reExports: [{ publicName: "*", importedName: "*", file: "a.ts" }] })],
  ]);
  propagateReExports(infos);
  assert.equal(infos.get("b.ts").exports.has("default"), false);
  assert.equal(infos.get("b.ts").exports.get("named"), "N");
});

test("lookupImportedExport resolves through the graph", () => {
  const a = file("a.ts", { exports: { value: 1 } });
  const b = file("b.ts", { imports: { local: { file: "a.ts", imported: "value" } } });
  const infos = new Map([["a.ts", a], ["b.ts", b]]);
  assert.equal(lookupImportedExport(infos, b, "local"), 1);
  assert.equal(lookupImportedExport(infos, b, "missing"), undefined);
});

test("collectResolutionFailures counts unresolved, re-export, and import edges", () => {
  const infos = new Map([
    ["a.ts", file("a.ts", { exports: { real: 1 } })],
    ["b.ts", file("b.ts", {
      imports: { gone: { file: "missing.ts", imported: "x" }, bad: { file: "a.ts", imported: "nope" }, ok: { file: "a.ts", imported: "real" } },
      reExports: [{ publicName: "pub", importedName: "nope", file: "a.ts" }],
      unresolvedEdges: ["b.ts#star"],
    })],
  ]);
  const { failedEdges, count } = collectResolutionFailures(infos);
  assert.deepEqual([...failedEdges].sort(), ["b.ts#bad", "b.ts#gone", "b.ts#pub", "b.ts#star"]);
  assert.equal(count, 4);
});
