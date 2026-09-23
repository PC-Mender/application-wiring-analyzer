import { Hono } from "hono";
const app = new Hono();
app.get("/known", (c) => c.json({ ok: true }));
export default app;
