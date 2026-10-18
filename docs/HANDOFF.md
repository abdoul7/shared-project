# Continuation checkpoint — 2026-10-19

## Start here

Stillroom is an original Windows-first private desktop communication application. Slice A is implemented and locally verified; the full product is unfinished. Read AGENTS.md, PROJECT_PLAN.md, SECURITY.md and ROOT_FINDINGS.md first. Supplied requirements supersede the starter plan. Excluded systems are removed from scope.

## Git and distribution

- Repository: https://github.com/abdoul7/shared-project (private).
- Feature branch: codex/stillroom-encrypted-dm.
- Verified implementation checkpoint: 1a711cf2792702c22fceccbe9d6e8763050a22b4. Later documentation-only commits may record this identity; resolve the final bundle tip with git rev-parse HEAD.
- Initial local implementation checkpoint: a0c433c (resolve full SHA with git log); later verification/handoff commits follow. Current checkpoint: `git rev-parse HEAD` (a file cannot contain its own commit hash).
- Remote main at last fetch: 49354749837a88308e487bab68d08401785a595f; previous: c62946fa8e4c9b45020caf89ff1eb87591cb8318. Remote tree contains only .gitignore, README, AGENTS and HANDOFF. Browser showed zero open and zero closed PRs. No other application work found.
- Local checkout initially had no history; first source checkpoint was saved before Git fetch completed. Both local checkpoint history and remote starter history are preserved as separate refs in the portable bundle after comparison of all four starter files. They have unrelated roots and have NOT been merged; the user instructed no automatic merges. Future integration requires an explicitly authorized history reconciliation. No remote history is rewritten.
- USER INSTRUCTION: KEEP CHECKPOINTS LOCAL. No implementation push, remote feature branch or PR exists. Automatic approval review rejected GitHub CLI's broad account permissions; user declined them. Do not retry authorization or publish without new instructions. Ordinary Git fetch later completed, which does not authorize publishing.
- Portable source/history bundle: `.local/Stillroom-checkpoint.bundle`, generated from all refs after final local checkpoint. Verify: `git bundle verify .local/Stillroom-checkpoint.bundle`. No npm dependencies, reference package, profiles or packaged executable included.

To continue from a manually transferred bundle on another computer:

```powershell
git clone -b codex/stillroom-encrypted-dm .\Stillroom-checkpoint.bundle Stillroom
cd Stillroom
git remote set-url origin https://github.com/abdoul7/shared-project.git
npm ci
```

Owner transfers the bundle through their chosen private channel. GitHub's starter does not contain this implementation. Do not send credentials or OS-encrypted profiles to the teammate.

## Completed behavior

- Original Electron interface; no reference code/branding/assets. Contact sidebar, explicit full-fingerprint verification, composer and message states.
- Stable Ed25519 profile identity; libsodium-supported Curve25519 conversion for crypto_box encryption. Manual out-of-band card verification pins peers. New key means new ID and re-verification.
- Certificate-validated WSS relay, fresh signed challenge authentication, signed routing envelopes, reciprocal contacts for every delivery, independently pinned receiver authorization.
- E2EE text and receipts; receiver persists dedup/history before acknowledgment, sender marks delivered only after authenticated peer receipt. Invalid signature/ciphertext/headers rejected.
- Durable encrypted outbox, identical-envelope retries, duplicate/conflicting IDs handled, automatic reconnect/backoff, relay heartbeat, bounded socket buffers and rotating retry batches. Failed means delivery unconfirmed/retryable, not proof of non-delivery.
- Windows safeStorage/DPAPI encrypts identity/history/outbox. Atomic rename and committed-memory updates after save, serialized IPC actions, per-profile instance lock. No plaintext fallback or content logging.
- Sandboxed renderer, context isolation, Node disabled, local CSP, validated minimal IPC, denied remote navigation/popups/permissions.
- Unsigned Windows folder package retaining Chromium and dependency notices. Distribute the entire folder; no installer/signed updater yet.

## Exact verification results

Environment: Windows x64, Node 24.21.0, Electron 44.9.0, libsodium-wrappers 0.8.4, ws 8.22.0, @electron/packager 20.3.0; locked in package-lock.json.

| Command/check | Actual result |
| --- | --- |
| npm install; npm install --save-dev --save-exact @electron/packager@20.3.0 | Installed; patched packager removed six initial build dependency advisories. Audit reported zero advisories. |
| node node_modules/electron/install.js | Official Electron runtime installed after initial package lacked binary. |
| npm run check | 10 JavaScript files syntax checked. |
| npm test | 11/11 passed, about 11.1s; real local TLS sockets. Covers independent stores/restart, peer receipts, retries/dedup, reciprocal authorization, untrusted TLS/plaintext rejection, tamper, store failure rollback/recovery, auth replay, reconnect, timeout/retry receipt, backlog fairness, duplicate-ready/stale socket rejection. |
| npm run test:desktop-pair | Two actual Electron BrowserWindows/profiles used renderer contact import/composer and production IPC. Each sent/received and persisted 2 history entries, 1 outgoing delivered receipt; rejected unverified contacts/ws://; no probe plaintext in encrypted snapshot. |
| electron desktop/main.js --smoke under fresh STILLROOM_PROFILE | OS encrypted round-trip and identity checks true. |
| electron desktop/main.js --smoke-ui under fresh profile | DOM/bridge present, process undefined in renderer, sandbox/contextIsolation true, nodeIntegration false; screenshot visually inspected. |
| npm run build | Succeeded: dist/Stillroom-win32-x64/Stillroom.exe and resources/app.asar. |
| Packaged Stillroom.exe --smoke-ui under fresh profile | Exit 0; actual packaged renderer/bridge/isolation checks passed after unlocking OS storage. |

Sanitized portable receipts: verification/desktop-pair.json and verification/packaged-smoke.json. Original probe outputs/screenshots stay ignored in .local/. Two-window controlled local automation is not two physical computers or cross-network validation. No security audit implied.

## Setup and local trial

```powershell
npm ci
.\scripts\dev-relay.ps1
```

In separate terminals set `$env:STILLROOM_PROFILE='alice'` / `'bob'`, then `npm start`. For both connection dialogs use wss://localhost:8443/ and select test/fixtures/localhost-cert.pem as private CA. Exchange public cards through an authenticated channel, compare entire fingerprints and explicitly add each other. Both approvals required. Select contact and send. Full commands in README.

Shared localhost TLS fixture/key is PUBLIC TEST DATA, never deploy remotely. Real identities are separately generated. Profiles live under %APPDATA%/Stillroom/<profile>/snapshot.enc, outside Git. Test profiles contain only generated identities/probe text. No messages sent to real reference accounts.

## Different computers and network services

No production relay deployed. Operator must supply reachable DNS/IP, inbound TCP port, trusted TLS certificate/key and always-running Node service. Configure RELAY_TLS_CERT, RELAY_TLS_KEY, RELAY_HOST, RELAY_PORT, RELAY_PUBLIC_URL (README has exact commands without secrets). Both clients use identical public WSS URL and system trust or authenticated private CA. Never disable TLS checks.

Second developer: obtain source bundle while local-only direction holds, run npm ci/npm start on Windows, verify public cards, connect to that relay. Both parties need overlapping online time: relay has no offline mailbox; sender retains pending ciphertext until delivery. Operator compute/bandwidth/future TURN costs are infrastructure expenses, not product tiers.

Runtime variable: STILLROOM_PROFILE. Test-only: STILLROOM_SMOKE, STILLROOM_SMOKE_OUTPUT, STILLROOM_SMOKE_SCREENSHOT, STILLROOM_PAIR_DIRECTORY, STILLROOM_PAIR_ROLE, STILLROOM_PAIR_URL, STILLROOM_PAIR_CA. Never commit generated private profiles or secrets.

## Security and unfinished behavior

- No forward secrecy/post-compromise recovery, reviewed ratchet, revocation/recovery or multi-device identity. Never call slice A Signal/MLS or audited/production ready. Key change requires re-verification. DPAPI does not protect against malicious code under the same OS user.
- Complete encrypted snapshots/history/outbox/dedup grow in memory and write time. Replace with encrypted transactional bounded-access storage before heavy use. Atomic rename is not proof of power-loss/crash durability. Store-fault tests do not simulate power loss.
- Relay sees metadata and can deny/delay delivery. Admission/DoS hardening incomplete. Frame/rate/buffer bounds are transport defenses, not product tiers.
- Voice, microphone controls, screen/window/system audio capture, media metrics/adaptation, file transfers and private groups are NOT implemented. No placeholders imply otherwise.
- Streaming measurements: NONE; 1440p60 unverified. File sizes tested: NONE; no multi-gigabyte/resume/memory checks. Membership/history/epoch tests await group implementation.
- Cross-computer/cross-network verification, manual accessibility, signed packaging/update workflow and independent protocol/security review remain outstanding.

## Reference evidence and decisions

Root reference is the supplied local Windows installation only. REA inspected PE resources/identity. Portable sanitized findings/reproduction are ROOT_FINDINGS.md and evidence/. DM/voice/transfer protocols and private backend remain unknown. No reference account/settings changed. Our Electron stack, UI and protocol are original decisions, not recovered behavior.

## Next three actions

1. Transfer local Git bundle privately if continuing elsewhere; verify branch and npm ci. Keep checkpoints local until user changes direction.
2. Arrange trusted reachable relay; run/record real two-computer messaging, reconnect and restart tests. Fix failures before claiming cross-computer readiness.
3. Continue slice B: authenticated peer session setup plus E2EE voice/sharing, then sustained receiver-side 1440p60 measurements. Preserve all file/group/security acceptance criteria in PROJECT_PLAN.md.
