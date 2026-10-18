# Continuation checkpoint — 2026-10-19

## Start here

Stillroom is an original Windows-first private desktop communication application. The full product is unfinished. Read AGENTS.md, PROJECT_PLAN.md, SECURITY.md and ROOT_FINDINGS.md first. Supplied requirements supersede the starter plan. Excluded systems are removed from scope. The CURRENT section below supersedes conflicting historical slice/status descriptions later in this document.

## CURRENT — continuation on 2026-10-18 (America/Toronto)

### Second-PC validation of 093b439 — 2026-10-19

This section supersedes the line below that says the latest source was not rerun or rebuilt. On a different physical PC (AMD Ryzen 7 8700F, Windows 10.0.26300, Node 24.21.0, Electron 44.9.0), Git was installed via winget and the branch was fast-forwarded from 4dfa6c3 to 093b439 without a merge or force.

- Passed: `npm ci` (0 vulnerabilities), `npm run check` (29 files), `npm test` (39 passed, 0 failed, 1 opt-in skipped, about 12.4s), `npm run smoke:desktop`, `npm run test:desktop-pair`, strict `npm run test:features`, `npm run build`, packaged `Stillroom.exe --smoke-ui` in a fresh profile, and `node scripts/features-pair.mjs --packaged`. The strict feature runs used own-window native sharing (receiver 1104x740), a synthetic microphone, an exact 196608-byte file over 14 direct / 0 relay frames, hangup, report export and system-trust reset. Receipt: verification/checkpoint-093b439-validation.json.
- Pitfall: stale packaged Stillroom.exe instances from an earlier session locked `dist`, so the first build failed EBUSY. A packaged run against that stale build timed out; it is invalid and not a regression. Check for running `dist` executables before building.
- Local only: older uncommitted WIP (Docker Compose relay deploy draft, v0.2.0 bump, file data-channel `priority:'very-low'`) sits in `git stash@{0}` on this PC. It is unpushed and unverified, and is not part of the checkpoint.
- Not run: rtc/native/duplex fps probes, the 2GiB benchmark, two physical PCs, real microphones/system audio, TURN. The duplex 1440p60 goal is still unmet. This PC has no Cloudflare tunnel runtime file; the tunnel ran on the other PC.

### Latest source checkpoint — user requested immediate push (2026-10-18)

The user explicitly requested stopping tests and pushing the latest source so their friend can continue. No further tests or rebuild were run after that request. The owned duplex probe had already ended when its process was checked; no matching live probe process remained.

- Pending source now adds cancellable outgoing microphone preparation, release on peer-connection construction failure, guards against late outgoing offers affecting the next call, and visible media interruption/route-failure status. Live statistics display direct versus TURN routing. End call dismisses retained failure status.
- Added native --duplex --motion probe options: both peers capture the same explicitly owned synthetic scrolling/tiled window, exercising simultaneous encode/decode. This is not independent desktops or two physical PCs.
- Before the stop request, 11 focused lifecycle tests passed. The full suite and packaged executable were NOT rerun/rebuilt after these latest source edits. The previous ZIP and build receipts correspond to f80d2ad, not this checkpoint; friend should pull the branch and run npm ci / npm start or build locally.
- The already-finished simultaneous motion probe transported 2560x1440 both directions, but missed the strict >=59.9fps gate: rolling averages 59.638900 and 59.584796fps over about a minute, zero reported drops/freezes, about 10.44/10.73Mbps. This used the preceding lifecycle implementation, before the final cancellable-microphone changes. Receipt: verification/streaming-duplex-motion.json. Do not represent the earlier easier sequential results as proof of simultaneous complex-content 60fps.
- Next contributor: inspect current rtc lifecycle changes, then validate the current source/build when authorized to resume testing. Real two-PC network/media verification remains absent; friend was unavailable. TURN is not provisioned, and encryption limitations in SECURITY.md remain. Do not mark the 1440p60 goal complete.

### Streaming build update — 2026-10-18 (America/Toronto)

This section supersedes the older native-capture failure and frame-rate results below. The friend is unavailable now; the user explicitly requested continued improvements and a prepared test build. Two-physical-PC validation remains open. The active 1440p60 goal is not complete.

- Fixed a real reverse-direction media bug: the answerer now uses the three transceivers established by the remote offer, rather than creating unused local senders before applying it. Both peers can send microphone/video on negotiated tracks. Acceptance interrupted by hangup cannot modify the next call. Two new lifecycle regression tests cover negotiated slot selection and late acceptance.
- Added rolling full-minute receiver measurements, actual decoded/encoded counters, codec/encoder/decoder, candidate types (no IP addresses), bitrate, loss/drop/freeze and encode/decode diagnostics. Duplicate cached stats are excluded. Target requires stable 2560x1440, average >=59.9fps, zero reported drops/freezes over >=60s; do not substitute an instantaneous label.
- Added Save stream report, retained after hangup. Export uses a native save dialog, bounded JSON and no identities, keys, SDP, message content or IPs. Reports contain measurement timestamps and are plaintext performance data chosen by the user.
- Default public Cloudflare STUN aids NAT discovery; explicit existing [] remains respected. STUN sees client IPs and is not TURN. Added Use system certificate authorities for existing private-CA profiles without replacing identity/history; applies on Connect.
- Fixed strict native picker test by showing only its owned test window and selecting its exact media-source ID. Production-window smoke now verifies sharing/stop, report export after hangup, certificate reset, accepted call/mute and exact 196608-byte direct transfer. Two independent Electron clients pass; synthetic microphone only.
- Native probe now captures only a separately owned fullscreen 2560x1440 animation, warms up 10s, measures 65s, and supports --reverse plus --require-target. The source now requests 120Hz animation to avoid underfeeding a separate 60fps capture clock. It is a stable background with moving rectangle and frame counter; not arbitrary games or high-entropy content. It replaces a flashing full-background stress pattern. Full-frame flashing baseline measured 59.8448fps over 60s without drops/freezes; do not imply the new easier source proves every workload.
- Final native local results: caller to answerer 59.936859fps over rolling 60.947471s; answerer to caller 59.991388fps over rolling 60.058620s. Stable 2560x1440, zero reported drops/freezes in both. Full 65s averages were 59.949153 and 59.992001fps. Both strict exits were 0. Receipts: verification/streaming-native-forward.json and streaming-native-reverse.json. The earlier 60Hz source narrowly failed forward at 59.896433 rolling fps; preserved in streaming-native-60hz-source.json. These are same-host direct UDP tests on Ryzen 7 9800X3D/1440p240 display using VP8 software encoding, with synthetic microphone data, not two PCs or arbitrary content.
- Final Windows build, packaged startup isolation and node scripts/features-pair.mjs --packaged passed. The latter verifies the actual executable with two distinct test profiles, own-window capture, report save and certificate reset. Local distributable: .local/Stillroom-stream-test-20261018.zip. ZIP inventory: 73 entries, executable, app.asar and upstream licenses present; no private .local/profiles/.git paths. verification/streaming-build.json records archive size/SHA-256 and app.asar digest. The ZIP is ignored and not uploaded by Git; the friend can build the pushed source or receive the whole ZIP manually.
- Validation: npm test 35 passed, 0 failed, 1 opt-in large-file test skipped; npm run check 29 JavaScript files. The prior 2GiB engine test was not repeated because transfers did not change. See verification/streaming-*.json for portable receipts.
- Follow docs/STREAMING_TEST.md when both PCs are available. Test caller sharing, then answerer sharing, real microphones, optional system audio, stop/hangup and reconnect; collect receiver reports on both PCs. If direct NAT traversal fails, TURN remains unconfigured and must be addressed using actual network evidence. No payment, VPN, firewall change or security-audit claim.

### Latest network setup — Cloudflare

The user approved the Free Render deploy but Render required a payment card; none was submitted and no Render service exists. User selected Cloudflare instead. An official, SHA-256-verified cloudflared 2026.10.1 connector is in ignored `.local/tools/cloudflared.exe`. `npm run relay:cloudflare` is the repeatable host launcher. See docs/CLOUDFLARE_RELAY.md.

The Quick Tunnel and loopback-only Node relay were started on this PC. Current address, start time and exact owned PIDs are in `.local/cloudflare-relay.json` (local runtime data, not committed). Check status/processes before starting another copy. Public WSS validation passed with normal system certificate trust and two synthetic clients exchanging peer-confirmed encrypted messages in both directions; portable receipt is verification/cloudflare-transport.json. This traversed the real Cloudflare endpoint from one PC, not two physical computers. The friend needs only the same current WSS URL and mutually verified public cards, not a connector/VPN. No media-connectivity claim follows from this result.

Keep the host awake. The address changes on connector restart. Render instructions/config remain as an alternative, not the chosen route. No payment, Cloudflare account, persistent tunnel/domain or firewall modifications occurred. Stillroom's static-key and unfinished-group limitations are unchanged.

- Resumed the friend's pushed WIP `4dfa6c3` by clean fast-forward on `codex/stillroom-encrypted-dm`. Earlier dates use the original contributor's timezone. No history reconciliation or merge with main occurred.
- Inherited experimental direct voice, screen selection/system-audio option, real receiver statistics, authenticated control envelopes and resumable encrypted 16KiB file transfers. Private groups still do not exist.
- Fixed local capture stopping immediately on hangup, even while signalling stalls. Stop-sharing releases tracks before asynchronous sender operations. Failed attachment and late microphone/capture completion cannot retain capture or attach it to another call. Five focused regression tests cover these cases.
- Corrected the feature harness: own-window capture failure now fails the strict feature test. `npm run test:features:no-sharing` is explicitly a partial verification, not a native-sharing pass.
- User explicitly declined Tailscale. Prepared `render.yaml`, `server/hosted-relay.js` and docs/HOSTED_RELAY.md for a Free Render service. Nothing has been deployed and no account, repository authorization, payment or firewall settings were changed. Managed ingress terminates public TLS and forwards to the internal HTTP server; clients still require WSS and peer envelopes remain E2EE. Ordinary relay mode still requires its own TLS certificate. Two new tests verify configuration guards and two-client delivery through a local simulated TLS ingress.

### Current verification and limits

- `npm run check`: 24 JavaScript files checked.
- `npm test`: 28 passed, 0 failed, 1 skipped (opt-in large benchmark), about 12 seconds. Includes the five media lifecycle and two managed-TLS ingress tests.
- `npm run test:features:no-sharing`: two actual isolated Electron test clients; accepted call, mute/unmute, hangup, 196608-byte exact file and 14 direct frames on each side. Screen sharing explicitly skipped. Synthetic microphone only.
- `node scripts/features-pair.mjs --relay-only`: 196608-byte exact file; each side recorded 14 relay frames and zero direct frames, no active call.
- `npm run test:features`: FAILED because its own test window was unavailable to the capture picker; this execution context cannot establish native sharing. No personal screen capture was substituted. The old harness would have falsely passed this condition.
- `npm run test:rtc`: synthetic animated canvas and fake audio over same-host direct WebRTC, 30.128s, receiver 2560x1440, average 51.7127fps, 0 reported dropped frames, about 3.63Mbps, sampled RTT 5ms. 60fps NOT achieved; not physical-device/native/cross-PC evidence.
- `npm run build`: passed. Packaged `Stillroom.exe --smoke-ui` in a fresh test profile: passed, sandbox/context isolation true, Node integration false. This checks startup/isolation, not all packaged feature flows.
- Latest opt-in 2GiB benchmark PASSED using the current staged-publication transfer engine: 2147483648 bytes, final SHA-256 matched, 349205ms measured transfer/publication time, sampled peak process RSS 105590784 bytes (about 101MiB), 16384-byte chunks. This is an in-process engine benchmark, not a desktop/network speed result; sampled RSS is not proof of a hard memory ceiling. Command: set `STILLROOM_LARGE_TRANSFER=2147483648`, then `node --test --test-name-pattern="multi GiB" test/transfers.test.js`.
- Portable sanitized receipts: `verification/continuation-*.json`. Ignored `.local/` holds raw per-run artifacts. Real profiles, credentials and local source packages remain outside Git.

### Setup and next actions

Use `npm ci` (and Electron's install script if binary missing); `scripts/dev-relay.ps1` starts the loopback-only local TLS test service. For real remote testing, use docs/CLOUDFLARE_RELAY.md and the current WSS URL in ignored .local/cloudflare-relay.json. Do not install Tailscale. Do not use the shared localhost certificate remotely.

1. Current route is the running Cloudflare Quick Tunnel. Use its current runtime URL for two-PC testing; no cloud hosting account is needed. Render remains undeployed behind its card-verification requirement. Both desktops must be online; there is no server mailbox.
2. Perform real two-PC messaging and media tests. Native owned-window capture now passes; preserve exact owned-source selection in automated tests and use explicit user selection for real sharing. Configure separate TURN only if direct connectivity requires it.
3. Continue measured media reliability and file throughput, then reviewed group-key/membership design. Static-key DM/control forward secrecy, encrypted snapshot scalability, safe publication on non-hard-link filesystems, identity recovery and independent security review remain open.

Exact checkpoint identity is `git rev-parse HEAD`; push results must be verified against the remote. Refresh this section before every new push. Later historical notes below are retained for provenance, not current instructions.

## Git and distribution

- Repository: https://github.com/abdoul7/shared-project (private).
- Feature branch: codex/stillroom-encrypted-dm.
- Verified implementation checkpoint: 1a711cf2792702c22fceccbe9d6e8763050a22b4. Later documentation-only commits may record this identity; resolve the final bundle tip with git rev-parse HEAD.
- Initial local implementation checkpoint: a0c433c (resolve full SHA with git log); later verification/handoff commits follow. Current checkpoint: `git rev-parse HEAD` (a file cannot contain its own commit hash).
- Remote main at last fetch: 49354749837a88308e487bab68d08401785a595f; previous: c62946fa8e4c9b45020caf89ff1eb87591cb8318. Remote tree contains only .gitignore, README, AGENTS and HANDOFF. Browser showed zero open and zero closed PRs. No other application work found.
- Local checkout initially had no history; first source checkpoint was saved before Git fetch completed. Both local checkpoint history and remote starter history are preserved as separate refs in the portable bundle after comparison of all four starter files. They have unrelated roots and have NOT been merged; the user instructed no automatic merges. Future integration requires an explicitly authorized history reconciliation. No remote history is rewritten.
- CURRENT USER INSTRUCTION: PUSH THE FEATURE CHECKPOINT. The earlier local-only direction is superseded; upload succeeded and git ls-remote verified 6d3673d181c1bad47ed9524cb5e1391ff605a2a0. This later documentation checkpoint records that result. Historical state: The previous local-only checkpoint had no remote branch. The feature branch now exists; no PR exists because main and feature have no common ancestor. Automatic approval review rejected GitHub CLI's broad account permissions; user declined them. Do not retry broad CLI authorization. The current user instruction authorizes a feature-branch push using existing Git credentials. Ordinary Git fetch later completed, which does not authorize publishing.
- Portable source/history bundle: `.local/Stillroom-checkpoint.bundle`, generated from the feature branch and remote main refs after final local checkpoint (excluding internal tool snapshot refs). Verify: `git bundle verify .local/Stillroom-checkpoint.bundle`. No npm dependencies, reference package, profiles or packaged executable included.

To continue from a manually transferred bundle on another computer:

```powershell
git clone -b codex/stillroom-encrypted-dm .\Stillroom-checkpoint.bundle Stillroom
cd Stillroom
git remote set-url origin https://github.com/abdoul7/shared-project.git
npm ci
```

Upload has been verified; clone the codex/stillroom-encrypted-dm feature branch; main remains the starter. Do not send credentials or OS-encrypted profiles to the teammate.

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

Second developer: obtain the verified remote feature branch (or local source bundle if upload fails), run npm ci/npm start on Windows, verify public cards, connect to that relay. Both parties need overlapping online time: relay has no offline mailbox; sender retains pending ciphertext until delivery. Operator compute/bandwidth/future TURN costs are infrastructure expenses, not product tiers.

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

1. Verify upload of codex/stillroom-encrypted-dm, then clone that branch and npm ci. Do not use main for the implementation. Do not merge histories automatically.
2. Arrange trusted reachable relay; run/record real two-computer messaging, reconnect and restart tests. Fix failures before claiming cross-computer readiness.
3. Continue slice B: authenticated peer session setup plus E2EE voice/sharing, then sustained receiver-side 1440p60 measurements. Preserve all file/group/security acceptance criteria in PROJECT_PLAN.md.


## 2026-10-19 — WIP extension checkpoint

User requested deeper Root messaging/calls/sharing/transfers analysis and a complete working application. Baseline 40de59b02a13d217272ad28ed1f5cfb134b58253 is clean and pushed. Read-only deeper reference investigation is in progress; no new behavior claims yet. Security extension design records authenticated ephemeral controls, direct WebRTC media/data and encrypted resumable chunk transfer before implementation. Controls are being added and independently tested; media/transfer UI and performance checks remain unfinished. Next: integrate authenticated media and transfer controls, test real local desktop peers, record precise evidence/limits and checkpoint again. Never execute reference account actions or commit proprietary packages.


## 2026-10-19 — WIP media and file integration checkpoint

Deeper Root findings now include actual embedded WebRTC implementation and bounded messaging/file contract names; details in ROOT_FINDINGS.md and sanitized evidence. Stillroom now has authenticated E2EE control transport, accepted direct voice calls, microphone selection/mute, explicit native screen/window picker/system-audio option, requested1440p60 versus actual receiver stats, and encrypted resumable16KiB file chunks with explicit destination/integrity/no overwrite. Do not call the whole product finished: private groups/cross-computer/TURN/physical microphone/system-audio verification remain pending.

Checks so far:19 automated tests passed plus1 large opt-in skipped in ordinary run; actual2GiB in-process transfer benchmark separately completed2147483648 bytes in340549ms transfer, peakRSS105254912 bytes (pre-staging-publication variant). Synthetic WebRTC30.033s receiver2560x1440 averaged46.915fps,0dropped,2.952Mbps,RTT1ms:60fps target NOT achieved. Production two-window call/file/own-window sharing test passed196608byte exact SHA and1106x772 static-window capture at2fps; call uses synthetic microphone. Final publication hardening, direct/relay transport counters and final verification are in progress. Performance receipts will be committed after final checks.
