import { USERS_API, apiDelete } from "../api/client";

export async function loadUsers() {
  return fetch(USERS_API);
}

export async function removeUser(id: string) {
  return apiDelete(`${USERS_API}/${id}`);
}
