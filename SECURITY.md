# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

Only the latest published release line receives security fixes.

## Intended Threat Model

AWA is a local developer and CI tool. Its normal operation is to read the project directory supplied by the operator, parse source and metadata as text, and serve the visual explorer on `127.0.0.1:4177`. The analyzer does not execute analyzed project code or make application network requests.

The following behaviors are intentional and are not security concerns within this supported local workflow:

- The default visual explorer does not require authentication because it binds to the local loopback interface.
- Analysis reads files beneath the selected project root; this is the tool's primary purpose.
- There is no need for a fixed file-count or file-size limit when analyzing a trusted local project. Very large repositories may use more memory or CPU as expected for static analysis.
- The `--host` option can intentionally bind the explorer beyond loopback for operator-controlled environments. Anyone doing so is responsible for providing network-level access control; the explorer is not an authenticated multi-user service.

For safety, configured scan roots and symlink targets are constrained to the selected project root. A path or symlink that resolves outside that root is not analyzed. A repository configuration cannot use AWA to make the scanner read arbitrary files outside the selected project.

These assumptions do not apply when exposing the explorer to an untrusted network or when automatically analyzing untrusted repositories. Such deployments should use network isolation and an appropriate resource policy.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately using
[GitHub's private vulnerability reporting](https://github.com/PC-Mender/application-wiring-analyzer/security/advisories/new)
(Security → Advisories → "Report a vulnerability").

When reporting, please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept, if available
- Affected version(s)

We will acknowledge your report as soon as possible, investigate, and coordinate
a fix and disclosure timeline with you. We ask that you do not disclose the issue
publicly until a fix has been released.
