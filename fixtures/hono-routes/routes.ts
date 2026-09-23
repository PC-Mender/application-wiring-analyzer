import { Hono } from "hono";

const app = new Hono();

app.get("/api/users", listUsers);
app.get("/api/users/:id", getUser);
app.post("/api/users", createUser);
app.delete("/api/users/:id", deleteUser);

export default app;
