// Hono backend routes for the full-stack wiring fixture

import { Hono } from "hono";

const api = new Hono();

// Health check
api.get("/api/v1/health", (c) => c.json({ status: "ok" }));

// Users endpoints
api.get("/api/v1/users", async (c) => {
  // List all users
  return c.json({ users: [] });
});

api.post("/api/v1/users", async (c) => {
  // Create new user
  return c.json({ id: "new", created: true });
});

api.get("/api/v1/users/:id", async (c) => {
  const id = c.req.param("id");
  return c.json({ id, name: "User" });
});

api.put("/api/v1/users/:id", async (c) => {
  const id = c.req.param("id");
  return c.json({ id, updated: true });
});

api.delete("/api/v1/users/:id", async (c) => {
  const id = c.req.param("id");
  return c.json({ id, deleted: true });
});

export default api;
