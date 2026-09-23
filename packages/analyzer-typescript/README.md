# @neil-jay/analyzer-typescript

Shared TypeScript AST and module-graph utilities used by AWA's framework adapters.

This package contains language-level helpers that are framework-agnostic:

- `inferScriptKind(fileName)` — pick the `ts.ScriptKind` for a source file name
- `normalizeFilePath`, `joinRelativeSpecifier`, `resolveModuleFile` — deterministic relative module resolution across an in-memory file set
- `hasExportModifier` — detect the `export` modifier on a declaration
- `propagateReExports`, `collectResolutionFailures`, `lookupImportedExport` — small fixpoint machinery for resolving barrel re-exports and imports across a set of parsed files (`ModuleGraphFile`, `ReExportEdge`)

It intentionally has no dependency on any frontend or backend framework; adapters such as `@neil-jay/adapter-fetch` and `@neil-jay/adapter-hono` build on top of it.
