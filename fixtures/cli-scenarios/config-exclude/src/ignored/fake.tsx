export async function fakeFetch() {
  return fetch("/should-be-skipped");
}
