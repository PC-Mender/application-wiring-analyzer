# Development

## Prerequisites

- Node.js 22 or later
- npm 10 or later
- TypeScript familiarity

## Setup and verification

```bash
npm install
npm run build
npm test
npm run check:fixture
```

Useful commands:

```bash
npm run clean
node packages/core/tests/match.test.mjs
node packages/cli/dist/bin/awa.js check fixtures/smoke-pass --frontend src/frontend --backend src/backend
```

`npm test` builds the project and runs the Node.js test suites across the packages. The suite covers AST extraction, project-level module resolution, Hono route composition, matching, diagnostics, CLI behavior, JSON/SARIF output, and fixture scenarios.

## Repository structure

```text
packages/
├── core/                    # Wiring model, normalization, matching, diagnostics
├── analyzer-typescript/     # Shared AST and module-graph utilities
├── adapter-fetch/           # Fetch/HTTP frontend extraction
├── adapter-hono/            # Hono backend route extraction
├── framework-detector/      # Language/framework/topology detection
└── cli/                     # CLI, reporting, and visual explorer
```

Fixtures are organized by purpose:

```text
fixtures/
├── cli-scenarios/           # CLI status, format, exclusion, and edge-case scenarios
├── end-to-end/              # CLI diagnostic and error-reporting scenarios
├── smoke-pass/              # Clean CLI smoke fixture expected to pass
├── fetch-requests/          # Native fetch extraction patterns
├── fullstack-wiring/        # Cross-file frontend/backend wiring patterns
├── hono-cross-file-wiring/  # Hono mounted-router extraction
└── hono-routes/             # Direct Hono route extraction
```

## Adding an adapter

1. Create `packages/adapter-{framework}/` with a package manifest, TypeScript project, source, and tests.
2. Reuse the shared `@neil-jay/core` models and `@neil-jay/analyzer-typescript` utilities.
3. Implement project-level extraction when cross-file imports or route composition require it.
4. Add framework detection markers in `packages/framework-detector/src/index.ts`.
5. Register the adapter and supported framework in the CLI analysis flow.
6. Add fixtures and regression tests for supported syntax and unsupported/ambiguous cases.
7. Include the package in the Changesets fixed group and CI package verification list.

Adapters must be conservative. They should return unresolved metadata rather than guess when a URL, method, route, or import cannot be established statically.

## Code conventions

- TypeScript strict mode
- ESM imports with `.js` extensions in source
- Shared core types for requests, routes, locations, and diagnostics
- Node.js test runner for package tests
- No framework-specific imports in `@neil-jay/core`
- Add regression tests for behavior changes

## Release process

Releases use Changesets. All `@neil-jay/*` packages are versioned together in a fixed group.

1. Add a changeset for a publishable change:

   ```bash
   npm run changeset
   ```

2. Merge the change to `main`.
3. The release workflow opens or updates a `Version Packages` pull request.
4. Merge that pull request to update versions and changelogs.
5. The workflow builds, tests, publishes packages in dependency order, creates provenance attestations, and creates GitHub releases.

The GitHub Actions release workflow requires the repository's `NPM_TOKEN` secret.

## Current scope and roadmap

The current release focuses on fetch-based JavaScript/TypeScript frontend analysis and Hono backend analysis. Database analysis, GraphQL, runtime tracing, IDE integrations, and additional framework adapters remain outside the current implementation contract.

Potential future work includes Express/Fastify/NestJS adapters, REST API versioning, a dedicated GitHub Action wrapper, IDE extensions, and visualization exports.
