export const USERS_API = "/api/users";
export function apiDelete(path: string) {
  return fetch(path, { method: "DELETE" });
}
