# @neil-jay/framework-detector

Language, framework, and topology detection for [Application Wiring Analyzer](https://github.com/PC-Mender/application-wiring-analyzer).

Scores frontend/backend candidates from `package.json` dependencies, config files, npm scripts, and source imports — no configuration required.

## Usage

```ts
import { discoverProjectTopology } from "@neil-jay/framework-detector";

const topology = discoverProjectTopology(files);
// topology.languages, topology.frontends, topology.backends
```

See the [repository README](https://github.com/PC-Mender/application-wiring-analyzer#readme) for full documentation.

## License

MIT
