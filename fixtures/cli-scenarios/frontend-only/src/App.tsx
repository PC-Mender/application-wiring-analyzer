export async function loadX() {
  return fetch("/api/x");
}

export async function loadY() {
  return fetch("/api/y", { method: "POST" });
}
