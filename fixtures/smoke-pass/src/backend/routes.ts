import { Hono } from "hono"

const app = new Hono()
app.get("/api/users/:id", (c) => c.json({ id: c.req.param("id") }))

export default app
