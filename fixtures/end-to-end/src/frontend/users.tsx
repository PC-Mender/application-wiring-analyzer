export async function loadUser(id: string) {
  return fetch(`/api/users/${id}`)
}

export async function deleteUser(id: string) {
  return fetch(`/api/users/${id}`, { method: "DELETE" })
}

export async function loadMissing() {
  return fetch("/api/missing")
}
