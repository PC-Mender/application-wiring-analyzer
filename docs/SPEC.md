# Application Wiring Analyzer (AWA)

## v0.1 Specification

**Status:** Current v0.1 implementation specification  
**Scope:** Static verification of frontend-to-backend HTTP wiring in JavaScript and TypeScript applications.

## 1. Purpose

Application Wiring Analyzer statically analyzes frontend HTTP requests and supported backend routes, currently providing deep extraction for fetch-based JavaScript/TypeScript frontends and Hono backends.

The v0.1 question is deliberately narrow:

> When the frontend makes an HTTP request, does a compatible supported backend route exist?

AWA is not an application dependency visualizer, database analyzer, runtime tracer, security scanner, or AI code reviewer in v0.1. It can detect and report unsupported languages and frameworks, but detection does not imply that a deep wiring extractor is available.

## 2. Supported Stack

### Source languages
The analyzer discovers languages from source-file extensions and project metadata. Deep JavaScript/TypeScript extraction currently covers:

- JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs`
- TypeScript: `.ts`, `.tsx`, `.mts`, `.cts`

Other detected languages and formats may be reported as project topology, but they do not have a deep wiring extractor in v0.1.

### Frontend
- React and Next.js projects are recognized as supported frontend frameworks.
- Native `fetch()` calls are extracted from JavaScript and TypeScript source.
- When no supported frontend framework is detected, AWA can run a generic best-effort fetch/HTTP-request search on JavaScript/TypeScript files.

Framework detection may also identify Vue, Nuxt, Svelte, SvelteKit, Angular, Solid, Astro, Remix, and other frameworks. Detection alone does not mean that a framework-specific extractor is available.

### Backend
- Hono is the supported backend extractor in v0.1.
- Route declarations using `get`, `post`, `put`, `patch`, `delete`, `head`, and `options` are supported.
- Hono routers mounted with `app.route()` are supported where the route structure can be resolved statically.

The Hono application variable does not have to be named `app`; identification is based on syntax, imports, and statically resolved symbols where practical.

## 3. Explicit Non-Goals for v0.1

The following are intentionally deferred:

- Drizzle
- D1/database schema analysis
- PostgreSQL/MySQL/SQLite analysis
- ORM relationships
- Axios
- GraphQL
- WebSockets
- Express/Fastify/NestJS
- Next.js-specific server routing
- Runtime tracing
- OpenTelemetry
- Browser/network capture
- Authentication/authorization correctness
- Request/response body contract verification
- Advanced UI visualization beyond the current visual explorer
- AI-generated findings
- Full arbitrary JavaScript semantics beyond the supported static patterns

These exclusions are features of the scope, not missing requirements.

## 4. Core Analysis Pipeline

```text
JavaScript / TypeScript source
        |
        v
 TypeScript AST
        |
   +----+----+
   |         |
   v         v
fetch()    Hono route
extractor   extractor
   |         |
   +----+----+
        |
        v
  URL normalizer
        |
        v
     Matcher
        |
        v
   Diagnostics
```

The implementation MUST use AST/symbol analysis as its primary mechanism. Regex may be used only for small, explicitly bounded normalization tasks; it must not be the primary source parser.

## 5. Internal Model

### 5.1 SourceLocation

```ts
interface SourceLocation {
  file: string;
  line: number;
  column: number;
}
```

### 5.2 FrontendRequest

```ts
interface FrontendRequest {
  kind: "frontend-request";
  method: HttpMethod | null;
  rawUrl: string;
  normalizedPath: string | null;
  location: SourceLocation;
}
```

### 5.3 BackendRoute

```ts
interface BackendRoute {
  kind: "backend-route";
  method: HttpMethod;
  rawPath: string;
  normalizedPath: string | null;
  handler?: string;
  location: SourceLocation;
}
```

### 5.4 HTTP methods

```ts
type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";
```

## 6. Frontend `fetch()` Extraction

AWA MUST detect at minimum:

```ts
fetch("/api/users")
```

```ts
fetch("/api/users", { method: "POST" })
```

```ts
fetch(`/api/users/${id}`)
```

```ts
await fetch(`/api/users/${userId}`, {
  method: "DELETE",
})
```

Rules:

1. If `method` is absent, method is `GET`.
2. HTTP method comparison is case-insensitive and normalized to uppercase. If a method is present but cannot be statically resolved to a supported method, it is recorded as `null` and is eligible for `AWA003`.
3. String literals and template literals with statically recognizable path structure are supported.
4. Template substitutions are represented as dynamic path segments.
5. Calls whose target URL cannot be statically reduced to a useful route pattern are recorded as unresolved rather than guessed.

Example:

```ts
fetch(`/api/users/${id}`)
```

normalizes to a structural pattern equivalent to:

```text
/api/users/:dynamic
```

Parameter *names* do not need to match. Segment position and route structure do.

## 7. Hono Route Extraction

AWA MUST detect:

```ts
app.get("/api/users", handler)
app.post("/api/users", createUser)
app.put("/api/users/:id", updateUser)
app.patch("/api/users/:id", patchUser)
app.delete("/api/users/:id", deleteUser)
app.head("/api/users/:id", headUser)
app.options("/api/users/:id", optionsUser)
```

For every route, extract:

- HTTP method
- raw route path
- normalized path
- handler name where statically identifiable
- source filename
- line
- column

Anonymous handlers are valid:

```ts
app.get("/api/users/:id", async (c) => {
  // ...
})
```

The handler may be represented as `anonymous` or omitted.

## 8. Route Normalization

Normalization exists to compare frontend URLs with backend route patterns.

These MUST match:

```text
Frontend: /api/users/${id}
Backend:  /api/users/:id
```

These MUST also match structurally:

```text
Frontend: /api/companies/${companyId}/users/${userId}
Backend:  /api/companies/:companyId/users/:userId
```

These MUST NOT match:

```text
Frontend: /api/users/${id}/settings
Backend:  /api/users/:id
```

AWA normalizes a single trailing slash, so `/api/users` and `/api/users/` compare equally.

Query strings MUST NOT determine route matching:

```text
/api/users?page=2
```

matches backend route:

```text
/api/users
```

AWA should preserve query information for future analysis but ignore it for v0.1 route existence checks.

## 9. Matching Algorithm

For each resolved frontend request:

1. Find backend routes with the same normalized path structure.
2. If none exist, emit `AWA001`.
3. If path structure exists but the requested HTTP method does not, emit `AWA002`.
4. If method and path both match, mark the frontend request as wired.
5. After frontend analysis, backend routes with no detected frontend caller MAY emit `AWA004` as a warning.

A backend route without a detected frontend caller is not necessarily an error because routes may serve mobile apps, external clients, scheduled jobs, tests, or other consumers.

## 10. Diagnostics

### AWA001 — ROUTE_NOT_FOUND

**Severity:** Error

A statically resolved frontend request has no structurally matching backend route.

Example:

```text
AWA001 ROUTE_NOT_FOUND

src/pages/Invoices.tsx:42
GET /api/invoices/:dynamic

No matching Hono route was found.
```

### AWA002 — METHOD_MISMATCH

**Severity:** Error

The route path exists, but not for the HTTP method used by the frontend.

Example:

```text
AWA002 METHOD_MISMATCH

Frontend
src/api/users.ts:18
DELETE /api/users/:dynamic

Backend
src/routes/users.ts:31
GET /api/users/:id

Route matched, but HTTP method differs.
```

### AWA003 — UNRESOLVED_REQUEST

**Severity:** Warning

AWA found a `fetch()` call but could not statically determine a useful URL pattern or HTTP method.

Example:

```ts
fetch(buildEndpoint(resource, operation), options)
```

AWA MUST NOT pretend this request is correctly wired.

### AWA004 — NO_DETECTED_CALLER

**Severity:** Warning

A Hono route has no detected frontend `fetch()` caller.

The wording MUST avoid calling the route "unused" because AWA cannot prove that in v0.1.

## 11. Exit Codes

The implemented behavior is:

- `0` — analysis completed without wiring errors; warnings alone do not fail the command
- `1` — one or more wiring errors were found
- `2` — analyzer, configuration, argument, or internal failure
- `3` — partial or unsupported analysis when `--strict-incomplete` is enabled

Without `--strict-incomplete`, partial or unsupported analysis is reported but does not by itself produce a non-zero exit code. This makes AWA suitable for both advisory and strict CI workflows.

## 12. CLI

The product/project name is **Application Wiring Analyzer (AWA)**. The published CLI executable is `awa`.

The implemented commands are:

```text
awa [project]
awa ui [project]
awa explore [project]
awa check [project]
```

`awa`, `ui`, and `explore` open the visual explorer. `check` runs terminal/CI verification and prints diagnostics.

The main options are:

- `--frontend <dir>` and `--backend <dir>` to override detected roots;
- `--format human|json|sarif` for output format selection;
- `--config <path>` to load an `awa.config.json` file;
- repeatable `--exclude <glob>` patterns;
- `--frontend-only` or `--backend-only` for single-sided analysis;
- `--strict-incomplete` to fail CI on partial or unsupported analysis;
- `--show-warnings` to print individual warning details.

The `trace` command is not implemented.

## 13. Illustrative `check` Output

The exact terminal styling and counts vary by project. A representative report is:

```text
Application Wiring Analyzer — Check

ANALYSIS COMPLETE

Scanning JavaScript/TypeScript project...

Frontend requests     42
Hono routes           39
Matched               37
Errors                  3
Warnings                2

ERROR AWA001
src/pages/Profile.tsx:38
GET /api/profile/:dynamic
No matching Hono route was found.

ERROR AWA002
src/api/users.ts:71
DELETE /api/users/:dynamic
Matching route exists as GET, not DELETE.

WARNING AWA004
src/routes/internal.ts:14
POST /api/internal/rebuild
No frontend caller was detected.

3 errors, 2 warnings
```

## 14. Repository Structure

```text
application-wiring-analyzer/
├── packages/
│   ├── analyzer-typescript/
│   ├── core/
│   ├── adapter-fetch/
│   ├── adapter-hono/
│   ├── framework-detector/
│   └── cli/
├── fixtures/
│   ├── cli-scenarios/
│   └── end-to-end/
├── docs/
│   └── SPEC.md
├── .github/workflows/
├── .changeset/
├── README.md
└── package.json
```

The core package MUST NOT import React or Hono-specific code.

## 15. Implementation Milestones

The following milestones describe the v0.1 implementation sequence. Milestones 1–5 are implemented; milestone 6 remains ongoing maintenance and hardening.

### Milestone 1 — Hono extractor

Given TypeScript source containing Hono routes, produce structured `BackendRoute` records with accurate source locations.

Acceptance cases include:

```ts
app.get("/api/users", listUsers)
app.get("/api/users/:id", getUser)
app.post("/api/users", createUser)
app.delete("/api/users/:id", deleteUser)
```

### Milestone 2 — React/native fetch extractor

Produce structured `FrontendRequest` records from supported `fetch()` syntax.

### Milestone 3 — Normalizer and matcher

Correctly match static and dynamic route structures and distinguish method mismatches.

### Milestone 4 — Diagnostics

Implement `AWA001` through `AWA004` with source locations and deterministic messages.

### Milestone 5 — CLI

Run analysis against a project and return CI-compatible exit codes.

### Milestone 6 — Hardening

Add fixture projects, edge cases, documentation, performance tests, and false-positive/false-negative regression tests.

## 16. v0.1 Acceptance Test

Given:

```ts
// frontend
fetch(`/api/users/${id}`)

fetch(`/api/posts/${id}`, {
  method: "DELETE",
})

fetch("/api/missing")
```

and:

```ts
// backend
app.get("/api/users/:id", getUser)
app.get("/api/posts/:id", getPost)
app.post("/api/admin", adminHandler)
```

AWA MUST determine:

```text
GET /api/users/:dynamic
  -> GET /api/users/:id
  -> MATCH

DELETE /api/posts/:dynamic
  -> GET /api/posts/:id
  -> AWA002 METHOD_MISMATCH

GET /api/missing
  -> no route
  -> AWA001 ROUTE_NOT_FOUND

POST /api/admin
  -> no detected frontend caller
  -> AWA004 NO_DETECTED_CALLER
```

This acceptance test defines the central v0.1 wiring-verification contract and is covered by the repository's fixture and CLI tests.

## 17. Deferred Database Phase

Database analysis begins only after frontend-to-Hono matching is reliable.

The first database adapter is expected to be Drizzle, with eventual analysis shaped approximately as:

```text
React request
    -> Hono route
    -> handler/function
    -> Drizzle query
    -> table
    -> column
    -> relation
```

This is intentionally outside the v0.1 implementation contract.

## 18. Design Principles

1. **Deterministic before intelligent.** Correctness findings must not depend on an LLM.
2. **Evidence with every diagnostic.** Show file and source location wherever possible.
3. **Do not overclaim.** "No detected caller" is valid; "unused endpoint" is not proven.
4. **Adapters over framework coupling.** Core analysis remains framework-independent.
5. **Small first release.** Fetch-based JavaScript/TypeScript -> Hono route verification must be excellent before adding databases or more framework-specific extractors.
6. **CI-first.** Human-readable, JSON, and SARIF output share stable diagnostic codes and source locations.


## Language and framework discovery

Language detection is a separate first-class phase from framework detection. AWA must infer languages from source files before selecting analysis adapters. Initial deep wiring support covers JavaScript and TypeScript syntax, including JS/JSX/MJS/CJS and TS/TSX/MTS/CTS. Other languages/frameworks may be discovered and reported even when no deep adapter exists yet; absence of an adapter must never be presented as a successful wiring analysis.
