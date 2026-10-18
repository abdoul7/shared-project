# Project handoff

Read this file before making changes. Update it with every push so the next contributor or LLM can continue without the previous chat.

## Current state (updated 2026-10-19)

**Stillroom slice A is implemented and locally verified. GitHub still has only the starter documentation. The user explicitly chose local checkpoints only.** Continue from branch `codex/stillroom-encrypted-dm` or the portable bundle; read [docs/HANDOFF.md](docs/HANDOFF.md) for exact state, commands, test results and next steps.

Implemented: verified identity cards, authenticated WSS relay, E2EE text/receipts, OS-protected encrypted history/outbox, retry/reconnect/dedup and isolated desktop IPC. Verified: 11/11 protocol tests, two real Electron renderer windows exchanging messages, encrypted storage, Windows packaging and packaged UI smoke. No cross-computer test, production relay, voice/sharing/files/groups, forward secrecy or security audit.

Broad GitHub CLI authorization was blocked by automatic approval review; user declined those permissions and requested local checkpoints. Do not retry authorization, push or create a PR without new instructions. Ordinary Git fetch did complete; preserve remote main's two starter commits in the portable bundle.

## Historical starter state (superseded)

- Repository: https://github.com/abdoul7/shared-project (private).
- This is a starter repository with `README.md` and `.gitignore`; no application code, dependencies, or tests exist yet.
- The product idea and first feature have not been chosen.
- `AGENTS.md` instructs coding agents to maintain this handoff before every push.
- Issa-14 was invited as a collaborator; acceptance was pending at the last check.
- The original local workspace is `<original local workspace>`. Its Git remote is configured, but local Git authentication is not set up and it has not fetched the GitHub history. Browser sign-in alone did not authenticate command-line Git.

## Next steps

1. Use the local branch or privately transferred Git bundle, not GitHub's old starter.
2. Verify a real second-computer connection through a trusted reachable TLS relay using README instructions.
3. Continue encrypted media slice B after reading SECURITY.md and PROJECT_PLAN.md; update both handoffs at each checkpoint.

## Update history

### 2026-10-19 — Verified encrypted desktop messaging slice

- Added `core/`, `server/`, `desktop/`, `test/`, `scripts/`, pinned package/lockfile and plan/security/reference/continuation documents.
- 11 real-local-TLS tests passed; two actual Electron windows passed verified-contact/composer/send/receipt/encrypted-history checks. Syntax, build, OS storage and packaged UI checks passed; npm audit reported zero advisories after packager update.
- No forward secrecy/ratchet; whole snapshots/history grow in memory. No cross-network test/deployed relay. Voice, sharing, transfers and groups remain unimplemented, with no streaming measurements or tested transfer sizes.
- Local checkpoints only by user instruction. Detailed commit/bundle continuation and next actions: docs/HANDOFF.md.

### 2026-10-19 — Add persistent LLM handoff

- Changes: added this handoff and `AGENTS.md` so future agents know to read and maintain it with every push.
- Files: `HANDOFF.md`, `AGENTS.md`.
- Validation: checked the starter README and ignore rules and confirmed there is no application to test. No automated tests were run for this documentation change.
- Known issues: command-line Git still needs authentication in the original workspace. Repository contains documentation only.
- Next: agree on the project goal, then implement the first feature on a branch.

## Format for future updates

Use a dated heading and include: changes and their purpose; relevant files; validation and results; known issues or unfinished work; and concrete next steps. Keep the current-state and next-steps sections synchronized with the latest update.
