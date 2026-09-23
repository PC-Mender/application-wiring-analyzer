export async function loadUser(id: string) {
  return fetch(`/api/users/${id}`);
}

export async function deletePost(id: string) {
  return fetch(`/api/posts/${id}`, { method: "DELETE" });
}

export async function unresolved(resource: string) {
  return fetch(buildEndpoint(resource));
}

declare function buildEndpoint(resource: string): string;
