# Application Wiring Analyzer (AWA)

Static analysis for verifying HTTP wiring between frontend requests and backend routes in JavaScript and TypeScript applications.

AWA answers a focused question:

> Does a frontend HTTP request have a compatible supported backend route?

## What it detects

- Missing backend routes (`AWA001`)
- HTTP method mismatches (`AWA002`)
- Requests whose URL or method cannot be resolved statically (`AWA003`)
- Backend routes with no detected frontend caller (`AWA004`)

Analysis is AST-based and conservative: AWA reports uncertainty instead of guessing.

## Current support

### Frontend

- Native `fetch()` calls in JavaScript and TypeScript
- React and Next.js project detection
- Cross-file URL constants and simple fetch wrappers
- Dynamic path normalization
- Generic JavaScript/TypeScript fetch analysis when no supported frontend framework is detected

### Backend

- Hono route extraction
- `get`, `post`, `put`, `patch`, `delete`, `head`, and `options` routes
- Hono router mounting through `app.route()` when the route structure is statically resolvable
- Cross-file route and export resolution

Other frameworks may be detected and reported as unsupported, but they do not yet have framework-specific extractors. See the [specification](./docs/SPEC.md) for the current contract and scope.

## Installation

Once published, install the CLI globally:

```bash
npm install --global @neil-jay/cli
```

The command is named `awa`. It analyzes the project path you provide and does not need to be installed inside the target project.

## Usage

### Check wiring in the terminal

```bash
awa check /path/to/project
```

From inside the target project:

```bash
awa check .
```

AWA detects frontend and backend roots automatically. For an unusual layout, provide explicit roots:

```bash
awa check . --frontend src/frontend --backend src/api
```

Show all warning details instead of the default summary:

```bash
awa check . --show-warnings
```

Generate machine-readable output for CI:

```bash
awa check . --format json
awa check . --format sarif > awa.sarif.json
```

### Open the visual explorer

```bash
awa ui /path/to/project
```

The default local address is `http://127.0.0.1:4177`. Configure the port or host with:

```bash
awa ui . --port 5000
awa ui . --port 5000 --host 0.0.0.0
```

Running `awa .` is shorthand for `awa ui .`.

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Analysis completed without error-level diagnostics; warnings are allowed |
| `1` | One or more wiring errors were found |
| `2` | Analyzer, configuration, argument, or internal failure |
| `3` | Analysis is partial or unsupported and strict incomplete mode is enabled |

Use `--strict-incomplete` or `strictIncomplete: true` when incomplete analysis should fail CI.

## Configuration

AWA reads `awa.config.json` from the target project root. Use `--config <path>` for another location.

```json
{
  "frontend": { "roots": ["apps/web/src"], "adapter": "fetch" },
  "backend": { "roots": ["apps/api/src"], "adapter": "hono" },
  "exclude": ["**/*.test.*", "**/fixtures/**", "**/dist/**"],
  "frontendOnly": false,
  "backendOnly": false,
  "strictIncomplete": false
}
```

Configuration supports explicit frontend/backend roots, adapter pins, exclude globs, single-sided analysis, and strict incomplete handling. See [CLI and configuration details](./docs/CLI.md).

## Diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| **AWA001** | Error | No matching backend route exists |
| **AWA002** | Error | The backend path exists, but the HTTP method differs |
| **AWA003** | Warning | The frontend URL or HTTP method could not be resolved statically |
| **AWA004** | Warning | No supported frontend caller was detected for a backend route |

## Repository

AWA is an npm monorepo containing six packages:

```text
packages/
├── core/                    # Wiring model, normalization, matching, diagnostics
├── analyzer-typescript/     # Shared AST and module-graph utilities
├── adapter-fetch/           # Fetch/HTTP frontend extractor
├── adapter-hono/            # Hono backend route extractor
├── framework-detector/      # Language, framework, and topology detection
└── cli/                     # CLI and visual explorer
```

The core package remains framework-independent. Packages publish compiled `dist/` output and are versioned together with Changesets.

## Development

```bash
npm install
npm run build
npm test
npm run check:fixture
```

For contributor workflow, adapter development, fixture testing, and release procedures, see [CONTRIBUTING.md](./CONTRIBUTING.md) and [development details](./docs/DEVELOPMENT.md).

## Documentation

- [Implementation specification](./docs/SPEC.md)
- [CLI and configuration reference](./docs/CLI.md)
- [Development and testing](./docs/DEVELOPMENT.md)
- [Security policy](./SECURITY.md)
- [Contributing guide](./CONTRIBUTING.md)

## License

MIT License. See [LICENSE](./LICENSE).
