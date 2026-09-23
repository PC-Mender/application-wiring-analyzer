export async function loadUser(id: string) {
  return fetch(`/api/users/${id}`)
}
