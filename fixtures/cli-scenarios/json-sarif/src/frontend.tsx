export async function wrongMethod() {
  return fetch("/exists-wrong-method", { method: "DELETE" });
}

export async function missingRoute() {
  return fetch("/missing");
}

export async function dynamicUrl() {
  return fetch(someUnknownVar + "/dyn");
}
