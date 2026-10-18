# Project handoff

Read this file before making changes. Update it with every push so the next contributor or LLM can continue without the previous chat.

## Current state (updated 2026-10-19)

**Stillroom slice A is implemented and locally verified. The feature checkpoint was pushed and verified on GitHub at 6d3673d181c1bad47ed9524cb5e1391ff605a2a0. Subsequent documentation commits record this verification.** Continue from branch `codex/stillroom-encrypted-dm` or the portable bundle; read [docs/HANDOFF.md](docs/HANDOFF.md) for exact state, commands, test results and next steps.

Implemented: verified identity cards, authenticated WSS relay, E2EE text/receipts, OS-protected encrypted history/outbox, retry/reconnect/dedup and isolated desktop IPC. Verified: 11/11 protocol tests, two real Electron renderer windows exchanging messages, encrypted storage, Windows packaging and packaged UI smoke. No cross-computer test, production relay, voice/sharing/files/groups, forward secrecy or security audit.

Broad GitHub CLI authorization was blocked by automatic approval review; user declined those permissions and requested local checkpoints. The latest user instruction authorizes pushing the feature branch, but not broad CLI permissions or automatic merges. Ordinary Git fetch did complete; preserve remote main's two starter commits in the portable bundle.

## Historical starter state (superseded)

- Repository: https://github.com/abdoul7/shared-project (private).
- This is a starter repository with `README.md` and `.gitignore`; no application code, dependencies, or tests exist yet.
- The product idea and first feature have not been chosen.
- `AGENTS.md` instructs coding agents to maintain this handoff before every push.
- Issa-14 was invited as a collaborator; acceptance was pending at the last check.
- The original local workspace is `<original local workspace>`. Its Git remote is configured, but local Git authentication is not set up and it has not fetched the GitHub history. Browser sign-in alone did not authenticate command-line Git.

## Next steps

1. After remote verification, clone/switch to codex/stillroom-encrypted-dm; main still contains the old starter.
2. Verify a real second-computer connection through a trusted reachable TLS relay using README instructions.
3. Continue encrypted media slice B after reading SECURITY.md and PROJECT_PLAN.md; update both handoffs at each checkpoint.

## Update history

### 2026-10-19 — Publish checkpoint authorized

- User requested a push, superseding local-only distribution. The verified code checkpoint is 1a711cf2792702c22fceccbe9d6e8763050a22b4; later commits update documentation only.
- Validation remains 11/11 protocol tests plus desktop two-window/build/smoke checks; no code changed for publication.
- Upload verified with git ls-remote: 6d3673d181c1bad47ed9524cb5e1391ff605a2a0 matches local HEAD at verification. Feature and main have unrelated roots; do not automatically merge them.
- Next: verify remote branch, then continue the second-computer connection test.

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


## 2026-10-19 — WIP extension checkpoint

User requested deeper Root messaging/calls/sharing/transfers analysis and a complete working application. Baseline 40de59b02a13d217272ad28ed1f5cfb134b58253 is clean and pushed. Read-only deeper reference investigation is in progress; no new behavior claims yet. Security extension design records authenticated ephemeral controls, direct WebRTC media/data and encrypted resumable chunk transfer before implementation. Controls are being added and independently tested; media/transfer UI and performance checks remain unfinished. Next: integrate authenticated media and transfer controls, test real local desktop peers, record precise evidence/limits and checkpoint again. Never execute reference account actions or commit proprietary packages.


## 2026-10-19 — WIP media and file integration checkpoint

Deeper Root findings now include actual embedded WebRTC implementation and bounded messaging/file contract names; details in ROOT_FINDINGS.md and sanitized evidence. Stillroom now has authenticated E2EE control transport, accepted direct voice calls, microphone selection/mute, explicit native screen/window picker/system-audio option, requested1440p60 versus actual receiver stats, and encrypted resumable16KiB file chunks with explicit destination/integrity/no overwrite. Do not call the whole product finished: private groups/cross-computer/TURN/physical microphone/system-audio verification remain pending.

Checks so far:19 automated tests passed plus1 large opt-in skipped in ordinary run; actual2GiB in-process transfer benchmark separately completed2147483648 bytes in340549ms transfer, peakRSS105254912 bytes (pre-staging-publication variant). Synthetic WebRTC30.033s receiver2560x1440 averaged46.915fps,0dropped,2.952Mbps,RTT1ms:60fps target NOT achieved. Production two-window call/file/own-window sharing test passed196608byte exact SHA and1106x772 static-window capture at2fps; call uses synthetic microphone. Final publication hardening, direct/relay transport counters and final verification are in progress. Performance receipts will be committed after final checks.
