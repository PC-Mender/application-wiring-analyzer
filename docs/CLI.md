# CLI and Configuration

The published executable is `awa`, provided by `@neil-jay/cli`.

## Commands

```text
awa [project]
awa ui [project]
awa explore [project]
awa check [project]
```

- `awa`, `ui`, and `explore` open the visual explorer.
- `check` runs terminal and CI verification.
- When no project is supplied, AWA analyzes the current directory.

## `check`

```bash
awa check /path/to/project
awa check .
```

### Options

| Option | Description |
| --- | --- |
| `--frontend <dir>` | Override the detected frontend root |
| `--backend <dir>` | Override the detected backend root |
| `--format human\|json\|sarif` | Select output format; human is the default |
| `--config <path>` | Read configuration from a custom path |
| `--exclude <glob>` | Add an exclude pattern; repeatable |
| `--frontend-only` | Skip backend analysis |
| `--backend-only` | Skip frontend analysis |
| `--strict-incomplete` | Return exit code `3` for partial or unsupported analysis |
| `--show-warnings` | Print individual warning details |
| `--verbose` | Alias for `--show-warnings` |

## `ui` and `explore`

Start the local visual explorer:

```bash
awa ui /path/to/project
awa explore /path/to/project
```

The default address is `http://127.0.0.1:4177`. The visual explorer is intentionally a local, unauthenticated developer interface; it is not a multi-user service.

```bash
awa ui . --port 5000
awa ui . --port 5000 --host 0.0.0.0
```

`--host 0.0.0.0` is an explicit operator choice to make the explorer reachable beyond the local machine. Use it only on a trusted network or behind access controls. The default loopback binding does not expose the analysis to other machines.

Running `awa .` is shorthand for `awa ui .`.

## Configuration

AWA reads `awa.config.json` from the project root. Use `--config <path>` to select another file.

```json
{
  "frontend": {
    "roots": ["apps/web/src"],
    "adapter": "fetch"
  },
  "backend": {
    "roots": ["apps/api/src"],
    "adapter": "hono"
  },
  "exclude": ["**/*.test.*", "**/fixtures/**", "**/dist/**"],
  "adapters": {
    "frontend": "fetch",
    "backend": "hono"
  },
  "frontendOnly": false,
  "backendOnly": false,
  "strictIncomplete": false
}
```

- `frontend.roots` and `backend.roots` define explicit scan roots beneath the selected project root. CLI root flags take precedence. Paths that escape the project root are rejected; symlink targets outside the project root are not analyzed.
- `frontend.adapter` and `backend.adapter` pin an adapter for that side.
- `adapters.frontend` and `adapters.backend` are top-level aliases for adapter pins. Per-side pins take precedence.
- `exclude` contains project-root-relative glob patterns.
- `frontendOnly` and `backendOnly` enable single-sided analysis. Both cannot be enabled together.
- `strictIncomplete` makes partial or unsupported analysis return exit code `3`.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Completed without error-level diagnostics |
| `1` | One or more wiring errors were found |
| `2` | Analyzer, configuration, argument, or internal failure |
| `3` | Partial or unsupported analysis in strict incomplete mode |

Warnings alone do not cause a non-zero exit code.

## Output formats

Human output prints errors individually and summarizes warnings unless `--show-warnings` is used.

JSON output includes `schemaVersion`, project status, side metadata, scanned files, matches, diagnostics, summary counts, notes, and `exitCode`.

SARIF output uses SARIF `2.1.0` and maps AWA diagnostic codes to SARIF rules for code-scanning workflows.
