# @neil-jay/adapter-hono

Hono backend route extractor for [Application Wiring Analyzer](https://github.com/PC-Mender/application-wiring-analyzer).

Extracts Hono route declarations — including `app.route()` router composition across files — using the TypeScript compiler AST.

## Usage

```ts
import { extractHonoProjectRoutes } from "@neil-jay/adapter-hono";

const routes = extractHonoProjectRoutes([
  { fileName: "src/index.ts", sourceText },
]);
```

See the [repository README](https://github.com/PC-Mender/application-wiring-analyzer#readme) for full documentation.

## License

MIT
