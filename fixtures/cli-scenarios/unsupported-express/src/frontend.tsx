export async function loadUsers() {
  return fetch("/users");
}

export async function createUser() {
  return fetch("/users", { method: "POST", body: "{}" });
}
