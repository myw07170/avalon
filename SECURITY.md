# Security Policy

## Supported versions

Avalon has not published a versioned release yet. Security fixes are made only on the current `main` branch.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| Older commits or forks | No |

## Report a vulnerability

Do not open a public issue, discussion, or pull request for a suspected vulnerability.

Use GitHub's private vulnerability reporting instead:

1. Open this repository's **Security** tab.
2. Choose **Advisories**.
3. Select **Report a vulnerability**.

Include enough information to reproduce and assess the issue:

- the affected commit, route, component, or configuration;
- the impact and who can trigger it;
- minimal reproduction steps or a proof of concept;
- any known mitigation;
- whether secrets, provider responses, or private game state were exposed.

Keep API keys, access tokens, personal data, and complete private transcripts out of the report where possible. Replace secrets with redacted examples.

The maintainer will assess the report privately and coordinate remediation and disclosure with the reporter. Response or resolution times are not guaranteed.

## What counts as a security issue

Examples include:

- exposure of `LLM_API_KEY` or another server-only secret to the browser, logs, responses, or image layers;
- a way to bypass expected API boundaries or cause unauthorized, unbounded provider usage;
- injection or malformed input that crosses a trust boundary and changes server behavior;
- disclosure of hidden `GameState` data through `PlayerView`, AI prompts, UI components, or API responses;
- dependency vulnerabilities that are exploitable in this application.

Ordinary rule disagreements, balance suggestions, UI defects, and poor model output are not security vulnerabilities. They may be reported through the normal public issue tracker as long as they contain no secrets or hidden data.
