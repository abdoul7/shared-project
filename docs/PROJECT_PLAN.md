# Stillroom project plan

Temporary original product name: Stillroom. Windows first, private direct and group communication. No subscriptions, quality paywalls, purchase flows or artificial account quotas. Hosting costs are operator expenses, never in-product gates.

## Scope reconciliation

The previous starter repo had no application or stack. This request supersedes the placeholder instruction to choose a product idea. Root branding and assets will not enter our implementation. Bots, embedded apps/integrations and communities are removed from scope; do not investigate, scaffold or add them to the backlog. Private groups are conversations, not public servers.

## Ordered acceptance criteria

### A — encrypted direct messaging (in progress)

- Windows desktop shell with isolated IPC, OS-encrypted stable identity/history and explicit verified contact exchange.
- Independent clients use validated WSS and pinned peer identities; relay does not receive plaintext.
- Text states sending/delivered/failed, authenticated receipts, persisted retry queue and durable deduplication.
- Automated real local TLS sockets, unauthorized/tampered/replay/restart/reconnect tests, desktop smoke and Windows build.
- Separate-computer/cross-network manual run with teammate remains a required gate; local tests cannot substitute.

### B — voice and screen sharing (experimental implementation; real-device/cross-PC gates open)

- Explicit calls, microphone selection/mute and consented screen/window capture. System audio where supported.
- Authenticated peer media setup with E2EE content, secure TURN fallback; runtime codec selection and hardware acceleration where available.
- Requested 2560x1440/60 target separate from actual receiver metrics. Adaptive bitrate, obvious indicator and stop controls.
- Sustained receiver test records machines, network, duration, bitrate, frames/drops and latency evidence; no unmeasured performance claim.

### C — encrypted resumable transfers (experimental implementation; desktop large-file/cross-PC gates open)

- Any file type/device-supported size without arbitrary file/daily caps; streaming/chunking with bounded memory, backpressure and call-aware bandwidth scheduling.
- Progress/speed/bytes/ETA, cancel/retry/resume, authenticated chunks and final integrity; explicit safe destination, partial file, no overwrite/traversal or autoexecution.
- Disk/filesystem errors surfaced. Direct encrypted transport plus ciphertext relay fallback, document online/offline requirements.
- Multi-gigabyte tests with measured peak memory, interruptions, cancellation and integrity. Record actual finite tested size.

### D — private groups (not implemented)

- Create/name/invite/leave, membership authorization on every message/file/call.
- Reviewed group key protocol; epoch rotation removes future access for departed participants. New joiners default to post-join content only.
- Tests for membership changes, stale epoch/replay and removed-member rejection.

### E — reliability and delivery (ongoing)

- Packaging, accessibility, regression checks, code signing/update strategy, dependency notices.
- Protocol review and key-lifecycle hardening before production readiness.

## Checkpoint policy

Current network choice: no Tailscale/VPN. User switched to Cloudflare Quick Tunnel after Render required card verification. The repeatable launcher and actual public WSS validation are documented in docs/CLOUDFLARE_RELAY.md and docs/HANDOFF.md. Physical two-PC validation remains open. Render configuration remains an optional undeployed alternative. Provider infrastructure limits are separate from the app's no-artificial-file-cap requirement. Neither 1440p60 nor complete product readiness has been established.

Update docs/HANDOFF.md and root HANDOFF.md after meaningful slices and before every push. Preserve existing changes, use codex/ feature branches, coherent commits and draft PRs; never merge automatically. Do not commit reference packages, secret runtime profiles or personal captures.
