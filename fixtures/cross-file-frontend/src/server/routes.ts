import { Hono } from "hono";
const app = new Hono();
app.get("/api/users", (c) => c.json([]));
app.delete("/api/users/:id", (c) => c.json({ ok: true }));
export default app;
