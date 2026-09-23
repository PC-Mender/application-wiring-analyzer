import assert from "node:assert/strict";
import test from "node:test";
import { extractHonoProjectRoutes } from "../dist/index.js";

test("resolves imported Hono routers mounted with app.route()", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/server/index.ts", sourceText:`
      import { Hono } from "hono";
      import { users } from "./users";
      const app = new Hono();
      app.get("/health", health);
      app.route("/api/users", users);
    `},
    { fileName:"src/server/users.ts", sourceText:`
      import { Hono } from "hono";
      export const users = new Hono();
      users.get("/", listUsers);
      users.get("/:id", getUser);
      users.delete("/:id", deleteUser);
    `},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.deepEqual(routes.map(r=>[r.method,r.normalizedPath]), [
    ["GET","/health"], ["GET","/api/users"], ["GET","/api/users/:dynamic"], ["DELETE","/api/users/:dynamic"]
  ]);
});

test("resolves default-exported mounted routers", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono"; import admin from "./admin"; const app=new Hono(); app.route("/admin", admin);`},
    { fileName:"src/admin.ts", sourceText:`import { Hono } from "hono"; const admin=new Hono(); admin.get("/stats", stats); export default admin;`},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(routes[0]?.normalizedPath, "/admin/stats");
});

test("resolves mounted router through a barrel named re-export", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono"; import { usersRouter } from "./routes"; const app=new Hono(); app.route("/api/users", usersRouter);`},
    { fileName:"src/routes/index.ts", sourceText:`export { users as usersRouter } from "./users";`},
    { fileName:"src/routes/users.ts", sourceText:`import { Hono } from "hono"; export const users = new Hono(); users.get("/", listUsers); users.get("/:id", getUser);`},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.deepEqual(routes.map(r => [r.method, r.normalizedPath]).sort(), [
    ["GET","/api/users"], ["GET","/api/users/:dynamic"]
  ].sort());
});

test("resolves mounted router through a barrel export-star re-export", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono"; import { posts } from "./routes"; const app=new Hono(); app.route("/blog", posts);`},
    { fileName:"src/routes/index.ts", sourceText:`export * from "./posts";`},
    { fileName:"src/routes/posts.ts", sourceText:`import { Hono } from "hono"; export const posts = new Hono(); posts.get("/", listPosts); posts.delete("/:slug", deletePost);`},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  const pairs = routes.map(r => [r.method, r.normalizedPath]).sort();
  assert.ok(pairs.some(([m,p]) => m === "GET" && p === "/blog"), "GET /blog expected in: " + JSON.stringify(pairs));
  assert.ok(pairs.some(([m,p]) => m === "DELETE" && p === "/blog/:dynamic"), "DELETE /blog/:dynamic expected in: " + JSON.stringify(pairs));
});

test("resolves use-mounted routers with a prefix", () => {
  const { routes } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono"; import { api } from "./api"; const app=new Hono(); app.use("/v1", api);`},
    { fileName:"src/api.ts", sourceText:`import { Hono } from "hono"; export const api=new Hono(); api.get("/users", handler);`},
  ]);
  assert.deepEqual(routes.map(r => [r.method, r.normalizedPath]), [["GET", "/v1/users"]]);
});

test("HEAD and OPTIONS routes pass through project-level extraction with prefix", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono"; import { health } from "./health"; const app=new Hono(); app.route("/internal", health);`},
    { fileName:"src/health.ts", sourceText:`import { Hono } from "hono"; export const health = new Hono(); health.get("/status", statusGet); health.head("/status", statusHead); health.options("/status", statusOptions);`},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  const pairs = routes.map(r => [r.method, r.normalizedPath]).sort();
  assert.ok(pairs.some(([m,p]) => m === "GET" && p === "/internal/status"));
  assert.ok(pairs.some(([m,p]) => m === "HEAD" && p === "/internal/status"));
  assert.ok(pairs.some(([m,p]) => m === "OPTIONS" && p === "/internal/status"));
});

test("mounted router under a basePath instance gets the full prefix", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono"; import { users } from "./users"; const app=new Hono().basePath("/api"); app.route("/users", users);`},
    { fileName:"src/users.ts", sourceText:`import { Hono } from "hono"; export const users = new Hono(); users.get("/:id", getUser);`},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.deepEqual(routes.map(r => [r.method, r.normalizedPath]), [["GET", "/api/users/:dynamic"]]);
});

test("recognizes routers created via subpath imports in project extraction", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`import { Hono } from "hono/tiny"; const app=new Hono(); app.get("/health", h);`},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.deepEqual(routes.map(r => [r.method, r.normalizedPath]), [["GET", "/health"]]);
});

test("unresolved router import counts every distinct (file, localName) edge including unused ones", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/missing-ref.ts", sourceText:`import { nopeRouter } from "./missing";`},
    { fileName:"src/index.ts", sourceText:`
      import { Hono } from "hono";
      import { nopeRouter } from "./missing";
      import { realRouter } from "./real";
      const app = new Hono();
      app.route("/x", nopeRouter);
      app.route("/real", realRouter);
    `},
    { fileName:"src/real.ts", sourceText:`
      import { Hono } from "hono";
      export const realRouter = new Hono();
      realRouter.get("/items", listItems);
    `},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(importResolutionFailures, 2, "expected 2 distinct unresolved import edges: missing-ref.ts#nopeRouter and index.ts#nopeRouter");
  assert.ok(routes.length >= 1);
});

test("exactly one unresolved relative import edge reports importResolutionFailures = 1", () => {
  const { routes, importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`
      import { Hono } from "hono";
      import { nopeRouter } from "./missing";
      import { realRouter } from "./real";
      const app = new Hono();
      app.route("/x", nopeRouter);
      app.route("/real", realRouter);
    `},
    { fileName:"src/real.ts", sourceText:`
      import { Hono } from "hono";
      export const realRouter = new Hono();
      realRouter.get("/items", listItems);
    `},
  ]);
  assert.equal(typeof importResolutionFailures, "number");
  assert.equal(importResolutionFailures, 1, "expected exactly 1 unresolved import edge: index.ts#nopeRouter");
  assert.ok(routes.length >= 1);
});

test("unresolved named router re-export counts one importResolutionFailure", () => {
  const { importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`export { missingRouter } from "./missing";` },
  ]);
  assert.equal(importResolutionFailures, 1);
});

test("missing router export from an existing re-export target counts one failure", () => {
  const { importResolutionFailures } = extractHonoProjectRoutes([
    { fileName:"src/index.ts", sourceText:`export { missingRouter } from "./routers";` },
    { fileName:"src/routers.ts", sourceText:`export const present = 1;` },
  ]);
  assert.equal(importResolutionFailures, 1);
});
