# @neil-jay/core

Core wiring analysis and matching engine for [Application Wiring Analyzer](https://github.com/PC-Mender/application-wiring-analyzer).

Matches extracted frontend HTTP requests against backend routes and emits deterministic diagnostics (`AWA001`–`AWA004`).

## Usage

```ts
import { analyzeWiring } from "@neil-jay/core";

const result = analyzeWiring(frontendRequests, backendRoutes);
// result.matches, result.diagnostics
```

See the [repository README](https://github.com/PC-Mender/application-wiring-analyzer#readme) for full documentation.

## License

MIT
