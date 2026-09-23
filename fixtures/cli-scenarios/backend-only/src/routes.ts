import { Hono } from "hono";
const app = new Hono();
app.get("/api/items", (c) => c.json({ items: [] }));
app.post("/api/items", (c) => c.json({ ok: true }));
export default app;
