import { Hono } from "hono";
import { users } from "./routes/users";
const app = new Hono();
app.get("/health", (c) => c.text("ok"));
app.route("/api/users", users);
export default app;
