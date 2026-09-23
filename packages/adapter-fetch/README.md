# @neil-jay/adapter-fetch

Frontend request extractor for [Application Wiring Analyzer](https://github.com/PC-Mender/application-wiring-analyzer).

Extracts native `fetch()` calls — including simple wrapper functions, URL constants, and cross-file imports — from TypeScript/React source using the TypeScript compiler AST.

## Usage

```ts
import { extractReactProjectRequests } from "@neil-jay/adapter-fetch";

const requests = extractReactProjectRequests([
  { fileName: "src/app.tsx", sourceText },
]);
```

See the [repository README](https://github.com/PC-Mender/application-wiring-analyzer#readme) for full documentation.

## License

MIT
