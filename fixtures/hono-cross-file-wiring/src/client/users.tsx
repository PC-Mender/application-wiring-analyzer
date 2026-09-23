export async function loadUser(id: string) {
  return fetch(`/api/users/${id}`);
}
export async function removeUser(id: string) {
  return fetch(`/api/users/${id}`, { method: "DELETE" });
}
