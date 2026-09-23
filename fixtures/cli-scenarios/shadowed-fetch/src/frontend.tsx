import { fetch } from "./custom-client";

function example(fetch: any) {
  fetch("/param-shadowed");
}

const fetch = () => undefined;
fetch("/const-shadowed");

fetch("/import-shadowed");

export { example };
