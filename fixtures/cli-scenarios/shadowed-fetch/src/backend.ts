import { Hono } from "hono";
const app = new Hono();
app.get("/param-shadowed", (c) => c.json({ ok: true }));
app.get("/const-shadowed", (c) => c.json({ ok: true }));
app.get("/import-shadowed", (c) => c.json({ ok: true }));
export default app;
