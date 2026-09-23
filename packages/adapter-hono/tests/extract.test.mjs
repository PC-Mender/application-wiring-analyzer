import assert from "node:assert/strict";
import test from "node:test";
import { extractHonoRoutes } from "../dist/extract.js";

test("extracts supported Hono routes", () => {
  const source = `
import { Hono } from 'hono'
const app = new Hono()
app.get('/api/users', listUsers)
app.get('/api/users/:id', getUser)
app.post('/api/users', createUser)
app.put('/api/users/:id', updateUser)
app.patch('/api/users/:id', patchUser)
app.delete('/api/users/:id', deleteUser)
`;
  const routes = extractHonoRoutes(source, { fileName: "src/routes/users.ts" });
  assert.equal(routes.length, 6);
  assert.deepEqual(routes.map(({ method, rawPath, normalizedPath, handler }) => ({ method, rawPath, normalizedPath, handler })), [
    { method: "GET", rawPath: "/api/users", normalizedPath: "/api/users", handler: "listUsers" },
    { method: "GET", rawPath: "/api/users/:id", normalizedPath: "/api/users/:dynamic", handler: "getUser" },
    { method: "POST", rawPath: "/api/users", normalizedPath: "/api/users", handler: "createUser" },
    { method: "PUT", rawPath: "/api/users/:id", normalizedPath: "/api/users/:dynamic", handler: "updateUser" },
    { method: "PATCH", rawPath: "/api/users/:id", normalizedPath: "/api/users/:dynamic", handler: "patchUser" },
    { method: "DELETE", rawPath: "/api/users/:id", normalizedPath: "/api/users/:dynamic", handler: "deleteUser" },
  ]);
  assert.equal(routes[0]?.location.file, "src/routes/users.ts");
  assert.equal(routes[0]?.location.line, 4);
});

test("supports an aliased Hono import and non-app instance name", () => {
  const source = `
import { Hono as HonoApp } from "hono";
const api = new HonoApp();
api.get("/health", (c) => c.text("ok"));
`;
  const routes = extractHonoRoutes(source);
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.handler, "anonymous");
  assert.equal(routes[0]?.rawPath, "/health");
});

test("does not treat arbitrary objects with get/post methods as Hono", () => {
  const source = `
const app = makeSomethingElse();
app.get("/not-hono", handler);
`;
  assert.deepEqual(extractHonoRoutes(source), []);
});

test("resolves static route path constants and concatenation", () => {
  const source = [
    'import { Hono } from "hono";',
    'const app = new Hono();',
    'const prefix = "/api";',
    'app.get(prefix + "/users/:id", handler);',
  ].join("\n");
  const [route] = extractHonoRoutes(source);
  assert.equal(route?.rawPath, "/api/users/:id");
  assert.equal(route?.normalizedPath, "/api/users/:dynamic");
});

test("normalizes route parameters and a trailing slash", () => {
  const source = `
import { Hono } from "hono";
const app = new Hono();
app.get("/api/companies/:companyId/users/:userId/", handler);
`;
  const [route] = extractHonoRoutes(source);
  assert.equal(route?.normalizedPath, "/api/companies/:dynamic/users/:dynamic");
});

test("extracts Hono multi-method on routes", () => {
  const source = `
import { Hono } from "hono";
const app = new Hono();
app.on(["GET", "POST"], "/events", handler);
`;
  const routes = extractHonoRoutes(source);
  assert.deepEqual(routes.map((r) => [r.method, r.rawPath]), [["GET", "/events"], ["POST", "/events"]]);
});

test("extracts CommonJS Hono construction", () => {
  const source = `
const { Hono } = require("hono");
const app = new Hono();
app.get("/health", handler);
`;
  assert.equal(extractHonoRoutes(source).length, 1);
});

test("extracts HEAD and OPTIONS routes", () => {
  const source = `
import { Hono } from "hono";
const app = new Hono();
app.head("/api/health", healthHead);
app.options("/api/cors", corsHandler);
`;
  const routes = extractHonoRoutes(source);
  assert.equal(routes.length, 2);
  assert.deepEqual(
    routes.map((r) => ({ method: r.method, rawPath: r.rawPath, handler: r.handler })),
    [
      { method: "HEAD", rawPath: "/api/health", handler: "healthHead" },
      { method: "OPTIONS", rawPath: "/api/cors", handler: "corsHandler" },
    ],
  );
});

test("extracts Hono routes from .js file", () => {
  const source = `
import { Hono } from 'hono';
const app = new Hono();
app.get('/health', handler);
`;
  const routes = extractHonoRoutes(source, { fileName: "worker/routes.js" });
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.method, "GET");
  assert.equal(routes[0]?.rawPath, "/health");
  assert.equal(routes[0]?.location.file, "worker/routes.js");
});

test("extracts Hono routes from .mjs file", () => {
  const source = `
import { Hono } from 'hono';
const router = new Hono();
router.post('/submit', submitHandler);
`;
  const routes = extractHonoRoutes(source, { fileName: "api/submit.mjs" });
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.method, "POST");
  assert.equal(routes[0]?.rawPath, "/submit");
});

test("extracts routes from a Hono subpath import such as hono/tiny", () => {
  const source = `
import { Hono } from 'hono/tiny';
const app = new Hono();
app.get('/api/a', handler);
`;
  const routes = extractHonoRoutes(source, { fileName: "src/index.ts" });
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.rawPath, "/api/a");
});

test("extracts chained route registrations", () => {
  const source = `
import { Hono } from 'hono';
const app = new Hono();
app.get('/api/a', h1).post('/api/b', h2).delete('/api/c', h3);
`;
  const routes = extractHonoRoutes(source, { fileName: "src/index.ts" });
  assert.deepEqual(
    routes.map((r) => [r.method, r.rawPath]).sort(),
    [["DELETE", "/api/c"], ["GET", "/api/a"], ["POST", "/api/b"]].sort(),
  );
});

test("applies basePath prefix to routes", () => {
  const source = `
import { Hono } from 'hono';
const app = new Hono().basePath('/api');
app.get('/users', handler);
`;
  const routes = extractHonoRoutes(source, { fileName: "src/index.ts" });
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.normalizedPath, "/api/users");
});

test("applies derived basePath from app.basePath()", () => {
  const source = `
import { Hono } from 'hono';
const app = new Hono();
const api = app.basePath('/v1');
api.get('/users', handler);
`;
  const routes = extractHonoRoutes(source, { fileName: "src/index.ts" });
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.normalizedPath, "/v1/users");
});

test("extracts routes chained directly off new Hono()", () => {
  const source = `
import { Hono } from 'hono';
export default new Hono().basePath('/api').get('/ping', handler);
`;
  const routes = extractHonoRoutes(source, { fileName: "src/index.ts" });
  assert.equal(routes.length, 1);
  assert.equal(routes[0]?.normalizedPath, "/api/ping");
});

test("does not treat arbitrary chained objects as Hono", () => {
  const source = `
const client = makeClient();
client.get('/api/a').post('/api/b');
`;
  const routes = extractHonoRoutes(source, { fileName: "src/index.ts" });
  assert.equal(routes.length, 0);
});
