import assert from "node:assert/strict";
import test from "node:test";
import { extractFetchRequests } from "../dist/extract.js";

const extract = (sourceText, options = {}) =>
  extractFetchRequests(sourceText, { fileName: "src/users.tsx", ...options }).requests;

test("extracts GET fetch with a static path", () => {
  const [request] = extract(`fetch("/api/users")`);
  assert.deepEqual(
    { method: request?.method, rawUrl: request?.rawUrl, normalizedPath: request?.normalizedPath },
    { method: "GET", rawUrl: '"/api/users"', normalizedPath: "/api/users" },
  );
  assert.equal(request?.location.file, "src/users.tsx");
  assert.equal(request?.location.line, 1);
});

test("defaults to GET when options are omitted", () => {
  const [request] = extract(`fetch("/api/users")`);
  assert.equal(request?.method, "GET");
});

test("extracts explicit HTTP methods from literal options", () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    const [request] = extract(`fetch("/api/users", { method: "${method}" })`);
    assert.equal(request?.method, method, `expected ${method}`);
  }
});

test("normalizes lowercase method strings", () => {
  const [request] = extract(`fetch("/api/users", { method: "post" })`);
  assert.equal(request?.method, "POST");
});

test("resolves method from a const options object", () => {
  const [request] = extract(`
    const opts = { method: "PUT" };
    fetch("/api/users", opts);
  `);
  assert.equal(request?.method, "PUT");
  assert.equal(request?.normalizedPath, "/api/users");
});

test("method is null when it is not a string literal", () => {
  const [request] = extract(`fetch("/api/users", { method: getMethod() })`);
  assert.equal(request?.method, null);
});

test("method is null for a shorthand method property", () => {
  const [request] = extract(`fetch("/api/users", { method })`);
  assert.equal(request?.method, null);
});

test("method is null for an unknown method literal", () => {
  const [request] = extract(`fetch("/api/users", { method: "FOO" })`);
  assert.equal(request?.method, null);
});

test("resolves methods through shorthand properties and known spreads", () => {
  const [request] = extract(`
    const method = "POST";
    const defaults = { credentials: "include" };
    fetch("/api/users", { ...defaults, method });
  `);
  assert.equal(request?.method, "POST");
});

test("allows an explicit method to override an unknown earlier spread", () => {
  const [request] = extract(`fetch("/api/users", { ...options, method: "PUT" })`);
  assert.equal(request?.method, "PUT");
});

test("resolves computed method property names when statically known", () => {
  const [request] = extract(`
    const methodKey = "method";
    fetch("/api/users", { [methodKey]: "PATCH" });
  `);
  assert.equal(request?.method, "PATCH");
});

test("method is null when an unknown spread follows the method property", () => {
  const [request] = extract(`fetch("/api/users", { method: "POST", ...rest })`);
  assert.equal(request?.method, null);
});

test("method is null when options are only a spread", () => {
  const [request] = extract(`fetch("/api/users", { ...opts })`);
  assert.equal(request?.method, null);
});

test("resolves binary URL concatenation with an unresolved dynamic segment", () => {
  const [request] = extract('fetch("/api/" + id + "/posts")');
  assert.equal(request?.normalizedPath, "/api/:dynamic/posts");
});

test("resolves stable let URL literals", () => {
  const [request] = extract('let base = "/api/v1"; fetch(base + "/users")');
  assert.equal(request?.normalizedPath, "/api/v1/users");
});

test("normalizes template literal dynamic segments to :dynamic", () => {
  const [request] = extract("fetch(`/api/users/${id}`)");
  assert.equal(request?.normalizedPath, "/api/users/:dynamic");
});

test("keeps static suffixes after dynamic template segments", () => {
  const [request] = extract("fetch(`/api/users/${id}/posts`)");
  assert.equal(request?.normalizedPath, "/api/users/:dynamic/posts");
});

test("resolves static const values inside template expressions", () => {
  const [request] = extract(`
    const VERSION = "v1";
    fetch(\`/api/\${VERSION}/users\`);
  `);
  assert.equal(request?.normalizedPath, "/api/v1/users");
});

test("returns null path when a template starts with an unresolved expression", () => {
  const [request] = extract("fetch(`${base}/api/users`)");
  assert.equal(request?.normalizedPath, null);
});

test("strips query strings from paths", () => {
  const [request] = extract(`fetch("/api/users?page=2&limit=10")`);
  assert.equal(request?.normalizedPath, "/api/users");
});

test("strips hash fragments from paths", () => {
  const [request] = extract(`fetch("/api/users#section")`);
  assert.equal(request?.normalizedPath, "/api/users");
});

test("removes trailing slashes", () => {
  const [request] = extract(`fetch("/api/users/")`);
  assert.equal(request?.normalizedPath, "/api/users");
});

test("extracts the pathname from an absolute URL", () => {
  const [request] = extract(`fetch("https://api.example.com/v1/users")`);
  assert.equal(request?.normalizedPath, "/v1/users");
});

test("reduces static URL constructors passed to fetch", () => {
  const requests = extract(`
    fetch(new URL("/api/users", "https://example.com"));
    fetch(new URL("/api/orders", "https://example.com").toString());
    fetch(new URL("https://example.com/api/items").href);
  `);
  assert.deepEqual(requests.map((request) => request.normalizedPath), ["/api/users", "/api/orders", "/api/items"]);
});

test("extracts the pathname and drops the query from an absolute URL", () => {
  const [request] = extract(`fetch("https://api.example.com/v1/users?active=1")`);
  assert.equal(request?.normalizedPath, "/v1/users");
});

test("returns null path for non-URL strings without a leading slash", () => {
  const [request] = extract(`fetch("api/users")`);
  assert.equal(request?.normalizedPath, null);
});

test("resolves top-level const URL aliases", () => {
  const [request] = extract(`
    const url = "/api/users";
    fetch(url);
  `);
  assert.equal(request?.normalizedPath, "/api/users");
});

test("resolves transitive const aliases", () => {
  const [request] = extract(`
    const base = "/api/users";
    const alias = base;
    fetch(alias);
  `);
  assert.equal(request?.normalizedPath, "/api/users");
});

test("resolves stable let bindings", () => {
  const [request] = extract(`
    let url = "/api/users";
    fetch(url);
  `);
  assert.equal(request?.normalizedPath, "/api/users");
});

test("recognizes Fetch API global member calls", () => {
  const requests = extract(`window.fetch("/window"); globalThis.fetch("/global"); self.fetch("/self")`);
  assert.deepEqual(requests.map((request) => request.normalizedPath), ["/window", "/global", "/self"]);
});

test("ignores arbitrary client.fetch() member calls", () => {
  const requests = extract(`client.fetch("/api/users")`);
  assert.equal(requests.length, 0);
});

test("does not treat a locally shadowed global receiver as native", () => {
  const result = extractFetchRequests(`function example(window) { window.fetch("/not-native") }`, { fileName: "src/users.tsx" });
  assert.equal(result.requests.length, 0);
  assert.ok(result.skippedShadowedFetch >= 1);
});

test("ignores non-fetch member calls like api.get()", () => {
  const requests = extract(`api.get("/api/users")`);
  assert.equal(requests.length, 0);
});

test("resolves calls to local wrapper functions", () => {
  const requests = extract(`
    function apiGet(path) { return fetch(path); }
    apiGet("/api/users");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "GET");
  assert.equal(requests[0]?.normalizedPath, "/api/users");
  // The call site is reported, not the fetch() inside the wrapper.
  assert.equal(requests[0]?.location.line, 3);
});

test("propagates the HTTP method from local wrappers", () => {
  const requests = extract(`
    function apiDelete(path) { return fetch(path, { method: "DELETE" }); }
    apiDelete("/api/users/1");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "DELETE");
});

test("recognizes wrappers that alias the parameter", () => {
  const requests = extract(`
    function apiGet(path) {
      const url = path;
      return fetch(url);
    }
    apiGet("/api/users");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("recognizes wrappers with transitive parameter aliases", () => {
  const requests = extract(`
    function apiDelete(resourcePath) {
      const url = resourcePath;
      const finalUrl = url;
      return fetch(finalUrl, { method: "DELETE" });
    }
    apiDelete("/api/users/1");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "DELETE");
});

test("recognizes wrappers whose URL parameter is not first", () => {
  const requests = extract(`
    function requestWithOptions(options, path) { return fetch(path, options); }
    requestWithOptions({ method: "PATCH" }, "/api/users");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.normalizedPath, "/api/users");
  assert.equal(requests[0]?.method, null);
});

test("recognizes arrow-function wrappers", () => {
  const requests = extract(`
    const apiGet = (path) => fetch(path);
    apiGet("/api/users");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("recognizes function-expression wrappers", () => {
  const requests = extract(`
    const apiPost = function (path) { return fetch(path, { method: "POST" }); };
    apiPost("/api/users");
  `);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "POST");
});

test("does not treat functions that ignore their parameter as wrappers", () => {
  const requests = extract(`
    function helper(path) { return fetch("/internal/health"); }
    helper("/api/users");
  `);
  // The static fetch inside helper() is a real request; helper() itself is not a wrapper.
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.normalizedPath, "/internal/health");
});

test("records unresolved dynamic URLs instead of guessing", () => {
  const [request] = extract(`fetch(buildEndpoint(id))`);
  assert.equal(request?.normalizedPath, null);
  assert.equal(request?.method, "GET");
  assert.equal(request?.rawUrl, "buildEndpoint(id)");
});

test("supports externally provided constants", () => {
  const requests = extract(`fetch(USERS_API)`, {
    externalConstants: new Map([["USERS_API", "/api/users"]]),
  });
  assert.equal(requests[0]?.normalizedPath, "/api/users");
});

test("supports externally provided wrappers", () => {
  const requests = extract(`apiDelete("/api/users/1")`, {
    externalWrappers: new Map([["apiDelete", "DELETE"]]),
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.method, "DELETE");
});

test("captures all requests in a file with correct locations", () => {
  const requests = extract(`
    fetch("/api/users");
    fetch("/api/orders", { method: "POST" });
  `);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.location.line, 2);
  assert.equal(requests[1]?.location.line, 3);
  assert.equal(requests[1]?.method, "POST");
});

test("extracts fetch calls inside JSX expressions in .jsx files", () => {
  const requests = extract(
    `export function App({ id }) {
      return (
        <div className="x">
          <button onClick={() => fetch(\`/api/users/\${id}\`, { method: "DELETE" })}>del</button>
          <Widget data={fetch("/api/widget")} />
        </div>
      );
    }`,
    { fileName: "src/app.jsx" },
  );
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.method, "DELETE");
  assert.equal(requests[0]?.normalizedPath, "/api/users/:dynamic");
  assert.equal(requests[1]?.method, "GET");
  assert.equal(requests[1]?.normalizedPath, "/api/widget");
});

test("fetch parameter shadowing skips call and counts", () => {
  const result = extractFetchRequests("function example(fetch) { fetch('/not-http') }", { fileName: "src/users.tsx" });
  assert.equal(result.requests.length, 0);
  assert.ok(result.skippedShadowedFetch >= 1);
});

test("function declarations shadow the global fetch binding", () => {
  const result = extractFetchRequests("function fetch() {} fetch('/not-http')", { fileName: "src/users.tsx" });
  assert.equal(result.requests.length, 0);
  assert.ok(result.skippedShadowedFetch >= 1);
});

test("catch bindings do not shadow fetch outside the catch scope", () => {
  const result = extractFetchRequests(`
    try { throw new Error(); } catch (fetch) { fetch('/not-http'); }
    fetch('/api/users');
  `, { fileName: "src/users.tsx" });
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0]?.normalizedPath, "/api/users");
  assert.ok(result.skippedShadowedFetch >= 1);
});

test("local const fetch shadowing skips call", () => {
  const result = extractFetchRequests("const fetch = () => {}; fetch('/x')", { fileName: "src/users.tsx" });
  assert.equal(result.requests.length, 0);
  assert.ok(result.skippedShadowedFetch >= 1);
});

test("imported named fetch shadowing skips call", () => {
  const result = extractFetchRequests('import { fetch } from "./custom-client";\nfetch("/api/x")', { fileName: "src/users.tsx" });
  assert.equal(result.requests.length, 0);
  assert.ok(result.skippedShadowedFetch >= 1);
});
