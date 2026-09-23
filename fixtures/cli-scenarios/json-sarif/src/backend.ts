import { Hono } from "hono";
const app = new Hono();
app.get("/exists-wrong-method", (c) => c.json({ ok: true }));
app.get("/orphan", (c) => c.json({ orphan: true }));
export default app;
