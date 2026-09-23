import { Hono } from "hono"
const app = new Hono()
app.get("/api/users/:id", (c) => c.json({ id: c.req.param("id") }))
app.post("/api/users", (c) => c.json({ ok: true }))
export default app
