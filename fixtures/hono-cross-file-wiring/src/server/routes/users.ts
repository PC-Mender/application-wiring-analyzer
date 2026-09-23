import { Hono } from "hono";
export const users = new Hono();
users.get("/", listUsers);
users.get("/:id", getUser);
users.delete("/:id", deleteUser);
