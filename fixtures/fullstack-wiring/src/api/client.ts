// Real-world API client with various patterns

export const API_BASE = "/api/v1";
export const API_TIMEOUT = 5000;

// Simple constant
export const USERS_ENDPOINT = `${API_BASE}/users`;

// Wrapper with parameter aliasing
export function apiGet(path: string) {
  const url = path;
  return fetch(url);
}

// Wrapper with method
export function apiPost(path: string) {
  const endpoint = path;
  return fetch(endpoint, { method: "POST" });
}

// Wrapper with nested aliasing
export function apiDelete(resourcePath: string) {
  const url = resourcePath;
  const finalUrl = url;
  return fetch(finalUrl, { method: "DELETE" });
}

// Wrapper factory
export function makeApiCall(method: "GET" | "POST" | "PUT" | "DELETE") {
  return (path: string) => fetch(path, { method });
}

// Re-export
export { apiGet as get };
