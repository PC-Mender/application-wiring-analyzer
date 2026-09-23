# @neil-jay/cli

Command-line interface for [Application Wiring Analyzer](https://github.com/PC-Mender/application-wiring-analyzer) — static verification of HTTP wiring between frontend and backend layers in TypeScript projects.

## Install

For normal use, install the published CLI globally:

```bash
npm install -g @neil-jay/cli
```

For local repository development, run `npm install` and `npm run build` from the monorepo root, then use `npx awa ...` or `node packages/cli/dist/bin/awa.js ...`. The CLI works on Windows, macOS, and Linux.

## Usage

```bash
# CI-friendly wiring check (exit 1 on errors)
awa check /path/to/project
awa check . --frontend src/frontend --backend src/api
awa check --show-warnings

# From the repository after npm install && npm run build
npx awa check /path/to/project
npx awa ui /path/to/project

# Visual dashboard
awa /path/to/project
awa ui . --port 5000

# JSON and SARIF output for CI
awa check . --format json
awa check . --format sarif > awa.sarif.json
# Config, excludes, single-sided analyses
awa check . --config ./awa.json
awa check . --exclude '**/*.test.*' --exclude '**/fixtures/**'
awa check . --frontend-only
awa check . --backend-only
awa check . --strict-incomplete
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Completed with no error-level diagnostics; warnings allowed |
| `1`  | Completed with one or more error-level diagnostics |
| `2`  | Internal / configuration / argument failure |
| `3`  | Analysis incomplete (`partial` or `unsupported`) AND the user opted in via `--strict-incomplete` or `strictIncomplete: true` in config |

Persistent options live in `awa.config.json` at the project root; see the [repository README](https://github.com/PC-Mender/application-wiring-analyzer#readme) for the full schema.

## Diagnostics

| Code | Severity | Meaning |
|------|----------|---------|
| `AWA001` | Error | Frontend calls a route that doesn't exist on the backend |
| `AWA002` | Error | Path matches but HTTP method differs |
| `AWA003` | Warning | Request URL/method can't be statically resolved |
| `AWA004` | Warning | Backend route has no detected frontend caller |

See the [repository README](https://github.com/PC-Mender/application-wiring-analyzer#readme) for full documentation.

## License

MIT
