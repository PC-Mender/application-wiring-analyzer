import assert from "node:assert/strict";
import test from "node:test";
import { extractReactProjectRequests } from "../dist/project.js";

const file = (fileName, sourceText) => ({ fileName, sourceText });

test("resolves an imported endpoint constant", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `export const USERS_API = "/api/users";`),
    file("src/pages/users.tsx", `
      import { USERS_API } from "../api/client";
      fetch(USERS_API);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  const fromPage = requests.find((r) => r.location.file === "src/pages/users.tsx");
  assert.equal(fromPage?.normalizedPath, "/api/users");
  assert.equal(fromPage?.method, "GET");
});

test("resolves an imported fetch wrapper and its method", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `
      export function apiDelete(path) {
        return fetch(path, { method: "DELETE" });
      }
    `),
    file("src/pages/users.tsx", `
      import { apiDelete } from "../api/client";
      apiDelete("/api/users/1");
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  const call = requests.find((r) => r.location.file === "src/pages/users.tsx");
  assert.equal(call?.method, "DELETE");
  assert.equal(call?.normalizedPath, "/api/users/1");
  // The implementation fetch() inside the wrapper file is not reported as a request.
  assert.equal(requests.filter((r) => r.location.file === "src/api/client.ts").length, 0);
});

test("resolves imported wrappers whose URL parameter is not first", () => {
  const { requests } = extractReactProjectRequests([
    file("src/api/client.ts", `export function request(options, path) { return fetch(path, options); }`),
    file("src/pages/users.tsx", `
      import { request } from "../api/client";
      request({ method: "POST" }, "/api/users");
    `),
  ]);
  const call = requests.find((r) => r.location.file === "src/pages/users.tsx");
  assert.equal(call?.normalizedPath, "/api/users");
  assert.equal(call?.method, null);
});

test("resolves aliased named imports", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `export function apiGet(path) { return fetch(path); }`),
    file("src/pages/users.tsx", `
      import { apiGet as getUsers } from "../api/client";
      getUsers("/api/users");
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("follows wrappers through a barrel named re-export", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `export function apiPost(path) { return fetch(path, { method: "POST" }); }`),
    file("src/api/index.ts", `export { apiPost } from "./client";`),
    file("src/pages/users.tsx", `
      import { apiPost } from "../api";
      apiPost("/api/users");
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.method, "POST");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("follows constants through an export-star barrel", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/endpoints.ts", `export const USERS_API = "/api/users";`),
    file("src/api/index.ts", `export * from "./endpoints";`),
    file("src/pages/users.tsx", `
      import { USERS_API } from "../api/index";
      fetch(USERS_API);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("resolves default-exported wrappers", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `
      function apiGet(path) { return fetch(path); }
      export default apiGet;
    `),
    file("src/pages/users.tsx", `
      import apiGet from "../api/client";
      apiGet("/api/users");
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("resolves constants exported via an export clause", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/endpoints.ts", `
      const USERS_API = "/api/users";
      export { USERS_API };
    `),
    file("src/pages/users.tsx", `
      import { USERS_API } from "../api/endpoints";
      fetch(USERS_API);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("resolves relative imports without a file extension", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/client.ts", `export const API = "/api/users";`),
    file("src/app.tsx", `
      import { API } from "./client";
      fetch(API);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("resolves directory imports to index files", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/index.ts", `export const API = "/api/users";`),
    file("src/app.tsx", `
      import { API } from "./api";
      fetch(API);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("ignores imports from packages and unknown modules", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/app.tsx", `
      import React from "react";
      import { MISSING } from "./does-not-exist";
      fetch("/api/users");
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("combines an imported constant and an imported wrapper in one call", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `
      export const USERS_API = "/api/users";
      export function apiDelete(path) { return fetch(path, { method: "DELETE" }); }
    `),
    file("src/pages/users.tsx", `
      import { USERS_API, apiDelete } from "../api/client";
      apiDelete(\`\${USERS_API}/\${id}\`);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  const call = requests.find((r) => r.location.file === "src/pages/users.tsx");
  assert.equal(call?.method, "DELETE");
  assert.equal(call?.normalizedPath, "/api/users/:dynamic");
});

test("keeps the wrapper method when the URL cannot be resolved", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/client.ts", `export function apiPost(path) { return fetch(path, { method: "POST" }); }`),
    file("src/pages/users.tsx", `
      import { apiPost } from "../api/client";
      apiPost(buildEndpoint(id));
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  const call = requests.find((r) => r.location.file === "src/pages/users.tsx");
  assert.equal(call?.method, "POST");
  assert.equal(call?.normalizedPath, null);
});

test("does not mistake ordinary imported functions for fetch wrappers", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/utils/format.ts", `
      export function format(path) { return path.trim().toLowerCase(); }
    `),
    file("src/pages/users.tsx", `
      import { format } from "../utils/format";
      format("/api/users");
      fetch("/api/users");
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.rawUrl, '"/api/users"');
});

test("unresolved import from unknown module counts exactly one importResolutionFailure", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/app.tsx", `
      import { MISSING_CONST } from "./does-not-exist";
      console.log(MISSING_CONST);
      fetch("/api/users");
    `),
    file("src/unrelated.ts", `export const x = 1;`),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.equal(importResolutionFailures, 1);
});

test("shadowed fetch wrapper imported through project pipeline still reports skippedShadowedFetch >= 1", () => {
  const { requests, skippedShadowedFetch, importResolutionFailures } = extractReactProjectRequests([
    file("src/api/wrapper.ts", `
      export function wrapper(fetch) { fetch('/x'); }
    `),
    file("src/app.tsx", `
      import { wrapper } from "./api/wrapper";
      wrapper(globalThis.fetch);
    `),
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(typeof skippedShadowedFetch, "number");
  assert.ok(skippedShadowedFetch >= 1);
});

test("unresolved named re-export counts one importResolutionFailure", () => {
  const { importResolutionFailures } = extractReactProjectRequests([
    file("src/index.ts", `export { MISSING } from "./missing";`),
  ]);
  assert.equal(importResolutionFailures, 1);
});

test("missing export from an existing re-export target counts one failure", () => {
  const { importResolutionFailures } = extractReactProjectRequests([
    file("src/index.ts", `export { MISSING } from "./values";`),
    file("src/values.ts", `export const PRESENT = "/api/present";`),
  ]);
  assert.equal(importResolutionFailures, 1);
});
