// Frontend component that uses various API patterns

import { USERS_ENDPOINT, apiGet, apiPost, apiDelete } from "../api/client";

export async function loadAllUsers() {
  // Direct constant
  return apiGet(USERS_ENDPOINT);
}

export async function createUser(name: string, email: string) {
  // Using wrapper with method
  return apiPost(USERS_ENDPOINT);
}

export async function deleteUser(userId: string) {
  // Using wrapper with nested aliasing
  return apiDelete(`${USERS_ENDPOINT}/${userId}`);
}

export async function updateUser(userId: string, data: any) {
  // Direct fetch call
  return fetch(`/api/v1/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function getHealthStatus() {
  // Direct fetch with dynamic path
  const status = "health";
  return fetch(`/api/v1/${status}`);
}
