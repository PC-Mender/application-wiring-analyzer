# Contributing to Application Wiring Analyzer

Thank you for your interest in contributing to AWA! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're building a community where everyone feels welcome.

## Getting Started

### Prerequisites
- Node.js 22+
- npm 10+
- TypeScript familiarity

### Setup

```bash
git clone https://github.com/PC-Mender/application-wiring-analyzer.git
cd application-wiring-analyzer
npm install
npm run build
```

### Running Tests

```bash
# Run all tests
npm test

# Build only
npm run build

# Run the clean end-to-end smoke check
npm run check:fixture

# Inspect the diagnostic fixture (this intentionally exits with code 1)
node packages/cli/dist/bin/awa.js check fixtures/end-to-end --frontend src/frontend --backend src/backend
```

## Development Workflow

1. **Fork** the repository
2. **Create a branch** for your feature: `git checkout -b feature/your-feature`
3. **Make changes** following the code style below
4. **Add tests** for new functionality
5. **Run tests**: `npm test`
6. **Commit** with clear messages
7. **Push** to your fork
8. **Open a PR** with a description of your changes

## Project Structure

```
packages/
├── core/                  # Core wiring matching engine
├── analyzer-typescript/   # Shared TypeScript AST & module-graph utilities
├── adapter-fetch/         # Fetch/HTTP extraction
├── adapter-hono/          # Hono backend route extraction
├── framework-detector/    # Language/framework auto-detection
└── cli/                   # Command-line interface and dashboard
```

Each package is independently:
- Typed with TypeScript
- Tested with Node.js test runner
- Built with `npm run build`
- Exported as ESM

## Adding a New Framework Adapter

To support a new framework (e.g., Express, Vue, Svelte):

### 1. Create the adapter package

```bash
mkdir packages/adapter-{framework}
```

### 2. Create package structure

```
packages/adapter-{framework}/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Exports main extraction function
│   ├── extract.ts        # Single-file extraction
│   └── project.ts        # Project-level extraction (if needed)
└── tests/
    └── extract.test.mjs  # Test suite
```

### 3. Implement the extractor

For a **frontend** adapter:
```typescript
// src/index.ts
export interface FrontendRequest {
  method: HttpMethod;
  rawUrl: string;
  normalizedPath?: string;
  location: SourceLocation;
}

export function extractProjectRequests(
  files: Array<{ fileName: string; sourceText: string }>
): FrontendRequest[] {
  // Scan files, extract requests, return array
}
```

For a **backend** adapter:
```typescript
// src/index.ts
export interface BackendRoute {
  method: HttpMethod;
  rawPath: string;
  normalizedPath?: string;
  handler?: string;
  location: SourceLocation;
}

export function extractProjectRoutes(
  files: Array<{ fileName: string; sourceText: string }>
): BackendRoute[] {
  // Scan files, extract routes, return array
}
```

### 4. Add tests

```javascript
// tests/extract.test.mjs
import { test } from "node:test";
import assert from "node:assert";
import { extractProjectRequests } from "../dist/index.js";

test("extracts requests", () => {
  const result = extractProjectRequests([{
    fileName: "app.ts",
    sourceText: "/* your test code */"
  }]);
  
  assert.deepStrictEqual(result, [/* expected */]);
});
```

### 5. Update the CLI

In `packages/cli/src/index.ts`, add detection and calling:
```typescript
import { extractProjectRequests as extractMyFramework } from "@neil-jay/adapter-{framework}";

// In analyzeProject():
if (frontendFramework === "MyFramework") {
  frontendRequests = extractMyFramework(frontendProjectFiles);
}
```

### 6. Update framework detector

Add detection markers to `packages/framework-detector/src/index.ts`.

## Code Style

- **TypeScript**: Strict mode, explicit types
- **Imports**: ESM with `.js` extensions
- **Formatting**: Follow existing patterns in the codebase
- **Comments**: Add comments for complex logic
- **Testing**: Test edge cases and error conditions

### Example

```typescript
// Good: Explicit types, clear logic, tested edge cases
export function normalizePath(input: string): string | undefined {
  if (!input.startsWith("/")) return undefined;
  // Handle trailing slashes and query strings
  const clean = input.split("?")[0].replace(/\/$/, "");
  return clean || "/";
}

// Avoid: Implicit types, unclear intent
function normalize(x) {
  return x.replace(/\/$/, "");
}
```

## Commit Messages

Use clear, descriptive commit messages:

```
fix: resolve wrapper parameter aliasing in React adapter
feat: add Express backend route extractor
docs: update README with Express adapter usage
test: add edge case tests for dynamic path normalization
```

## Filing Issues

Before opening an issue, check if it's already reported. When filing:

- **Title**: Clear, specific problem
- **Description**: Steps to reproduce (if applicable)
- **Expected vs actual**: What should happen vs what does
- **Environment**: Node version, OS, npm version

Example:
```
Title: Dynamic route parameters not matched across method overloads

Description: When a backend has both GET /api/users/:id and POST /api/users/:id,
the wiring analyzer only matches the first one.

Expected: Both routes should be available for matching.

Actual: POST requests to /api/users/:id show AWA001 (no matching route).
```

## PR Guidelines

- **Scope**: One feature/fix per PR
- **Tests**: Include tests for new functionality
- **Documentation**: Update `README.md`, `docs/CLI.md`, or `docs/SPEC.md` when behavior changes
- **CI**: Ensure all tests pass before submitting
- **Description**: Explain what and why, not just what

## Performance Considerations

- Keep individual file AST operations fast (O(n) preferred)
- Avoid quadratic algorithms in project-level analysis
- Cache computed results when analyzing many files

## Debugging

### Run CLI with logging

```bash
NODE_DEBUG=* npm run check:fixture 2>&1 | grep -i "awa"
```

### Debug a single test

```bash
node --inspect-brk packages/core/tests/match.test.mjs
# Then open chrome://inspect in Chrome
```

### Inspect generated code

```bash
cat packages/core/dist/index.js | head -50
```

## Release Process

Releases are automated with [Changesets](https://github.com/changesets/changesets). All `@neil-jay/*` packages are versioned together in a fixed group.

1. **Add a changeset** with your PR when it changes published behavior:
   ```bash
   npm run changeset
   ```
   This creates a markdown file in `.changeset/` describing the change (patch/minor/major).
2. **Merge to `main`** — the Release workflow opens (or updates) a `chore: version packages` PR that accumulates pending changesets.
3. **Merge the Version Packages PR** — versions bump, changelogs generate, all packages publish to npm in dependency order with provenance, and GitHub releases are created.

Maintainers need the `NPM_TOKEN` secret configured in the repository for publishing.

## Questions?

- **Discussions**: Start a GitHub discussion for design questions
- **Issues**: Use issues for bug reports and feature requests
- **Documentation**: See README.md, docs/CLI.md, docs/DEVELOPMENT.md, and docs/SPEC.md

Thank you for contributing to AWA!
