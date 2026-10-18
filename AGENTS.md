# Collaboration instructions

- Read `HANDOFF.md` before starting work to understand the current state and next steps.
- Before every push, update `HANDOFF.md` in the same commit as the changes being shared. This includes pushes made through the GitHub web interface.
- Keep the current-state section accurate and add a dated update, newest first, describing the changes, files affected, validation performed, known issues, and concrete next steps.
- Distinguish completed work from planned work. Record checks that were not run and blockers honestly. Never claim a push succeeded until verified.
- Do not put passwords, tokens, private contact details, or other secrets in the handoff.
- Preserve useful previous updates so another LLM can continue without access to chat history.

## Stillroom scope and continuation

- Read `docs/HANDOFF.md`, `docs/PROJECT_PLAN.md` and `docs/SECURITY.md` before changing the protocol. Root `HANDOFF.md` is the short entry point.
- Build an original Windows-first private communication app. Bots, embedded apps/integrations and communities are excluded: do not investigate, scaffold or add backlog work for them. Do not copy Root code/branding/assets.
- No subscriptions, premium quality gates, purchase flows or artificial account/file quotas. Document operator infrastructure costs separately.
- Slice order: encrypted two-client DMs; voice/sharing with measured receiver performance; encrypted resumable large transfers; private groups with membership/key changes; delivery hardening. Do not claim later slices exist.
- Use maintained cryptographic primitives, validate TLS, fail closed and keep private keys in OS-protected storage. Never log content or secrets. Static-key slice A lacks forward secrecy; do not describe it as audited/production ready.
- Keep source evidence sanitized and portable; never commit proprietary reference packages, runtime profiles or real secrets. The checked-in localhost TLS fixture is public test-only and must never be deployed remotely.
- Commands: `npm ci`, `npm run check`, `npm test`, `npm run smoke:desktop`, `npm run smoke:ui`, `npm run test:desktop-pair`, `npm run build`; local relay: `scripts/dev-relay.ps1`. See README for exact Windows setup and external-network prerequisites.
- Tests needing actual local TLS sockets and native Electron may need a normal desktop execution context. Never disable TLS validation or sandboxing to bypass a failing check.
- Current user instruction (2026-10-19): push the verified feature checkpoint to the shared repository. This supersedes the earlier local-only instruction. Never force-push or automatically merge histories/PRs. Broad GitHub CLI authorization remains declined; use existing authorized Git credentials. Update both handoffs before each push.
