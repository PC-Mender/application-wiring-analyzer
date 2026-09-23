import assert from "node:assert/strict";
import test from "node:test";
import { analyzeWiring } from "../dist/match.js";

const loc = (file, line = 1) => ({ file, line, column: 1 });
const frontend = (method, normalizedPath, rawUrl = '"/api/users"') => ({
  kind: "frontend-request", method, rawUrl, normalizedPath, location: loc("src/page.tsx")
});
const backend = (method, normalizedPath, rawPath = "/api/users") => ({
  kind: "backend-route", method, rawPath, normalizedPath, handler: "handler", location: loc("src/routes.ts")
});

test("matches frontend request to backend route", () => {
  const f = frontend("GET", "/api/users/:dynamic");
  const b = backend("GET", "/api/users/:dynamic", "/api/users/:id");
  const result = analyzeWiring([f], [b]);
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.matches[0].backend, b);
});

test("AWA001 reports a missing backend route", () => {
  const result = analyzeWiring([frontend("GET", "/api/missing")], []);
  assert.equal(result.matches.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, "AWA001");
  assert.equal(result.diagnostics[0].severity, "error");
});

test("AWA002 reports method mismatch without also reporting AWA004", () => {
  const result = analyzeWiring(
    [frontend("DELETE", "/api/users/:dynamic")],
    [backend("GET", "/api/users/:dynamic", "/api/users/:id")],
  );
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["AWA002"]);
  assert.match(result.diagnostics[0].message, /Backend methods: GET/);
});

test("AWA003 reports unresolved frontend URL", () => {
  const result = analyzeWiring([frontend("GET", null, "buildEndpoint(id)")], []);
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["AWA003"]);
});

test("AWA003 reports unresolved frontend method", () => {
  const result = analyzeWiring([frontend(null, "/api/users")], []);
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["AWA003"]);
});

test("AWA004 says no detected frontend caller for unmatched backend route", () => {
  const result = analyzeWiring([], [backend("POST", "/api/users")]);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, "AWA004");
  assert.equal(result.diagnostics[0].severity, "warning");
  assert.match(result.diagnostics[0].message, /no detected frontend caller/);
});

test("one backend route can match multiple frontend callers", () => {
  const b = backend("GET", "/api/users");
  const result = analyzeWiring(
    [frontend("GET", "/api/users"), { ...frontend("GET", "/api/users"), location: loc("src/admin.tsx") }],
    [b],
  );
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.diagnostics, []);
});

test("unresolved frontend request does not suppress AWA004", () => {
  const result = analyzeWiring(
    [frontend("GET", null, "buildEndpoint(id)")],
    [backend("GET", "/api/users")],
  );
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["AWA003", "AWA004"]);
});

test("AWA004 fires for unmatched method on same path where another method has caller", () => {
  const f = frontend("GET", "/api/users");
  const bGet = backend("GET", "/api/users");
  const bPost = backend("POST", "/api/users");
  const result = analyzeWiring([f], [bGet, bPost]);
  assert.equal(result.matches.length, 1);
  const codes = result.diagnostics.map((d) => d.code);
  assert.ok(codes.includes("AWA004"), "POST /api/users should get AWA004: " + codes.join(","));
  const postAwa004 = result.diagnostics.find(
    (d) => d.code === "AWA004" && d.backend && d.backend.method === "POST",
  );
  assert.ok(postAwa004, "AWA004 must target the POST route specifically");
});

test("AWA004 only suppresses the backend route represented by AWA002", () => {
  const result = analyzeWiring(
    [frontend("POST", "/api/users")],
    [backend("GET", "/api/users"), backend("DELETE", "/api/users")],
  );
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["AWA002", "AWA004"]);
  assert.equal(result.diagnostics[1].backend?.method, "DELETE");
});

test("AWA004 still suppressed for method-mismatch case (AWA002 already reported)", () => {
  const result = analyzeWiring(
    [frontend("DELETE", "/api/users/:dynamic")],
    [backend("GET", "/api/users/:dynamic", "/api/users/:id")],
  );
  assert.deepEqual(result.diagnostics.map((d) => d.code), ["AWA002"]);
});

test("AWA004 fires for HEAD route with no frontend caller even if GET is matched on same path", () => {
  const f = frontend("GET", "/api/health");
  const bGet = backend("GET", "/api/health");
  const bHead = backend("HEAD", "/api/health");
  const result = analyzeWiring([f], [bGet, bHead]);
  const codes = result.diagnostics.map((d) => d.code);
  const headAwa004 = result.diagnostics.find(
    (d) => d.code === "AWA004" && d.backend && d.backend.method === "HEAD",
  );
  assert.ok(headAwa004, "HEAD /api/health should get AWA004");
});
