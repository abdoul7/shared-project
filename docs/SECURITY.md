# Security design — slice A, 2026-10-19

Status: design precedes protocol implementation. Experimental software, no independent audit. No claim of production readiness or cross-network verification.

## Threat model

Protect message contents from network observers and an honest-but-curious or compromised relay. Block impersonation, tampering, unauthorized delivery and duplicate rendering. Endpoints, OS account, Chromium/Electron, and the manually verified contact exchange are trusted. Malware under the same Windows user can defeat DPAPI. Denial of service, traffic analysis, compromised endpoints and malicious contacts are not prevented. A relay can delay/drop messages and observe identities, contact edges, public keys, IP addresses, ciphertext sizes and timing.

## Identity and authenticated key agreement

Use maintained libsodium, not custom crypto primitives: Ed25519 signing key pair per local profile; user ID is SHA-256 of the Ed25519 public key. Derive Curve25519 encryption keys using libsodium's supported Ed25519-to-Curve25519 conversion. Exchange public contact cards through an existing authenticated channel and compare the complete fingerprint out of band before explicit approval. Do not discover or replace keys through relay assertions. A changed identity is a different ID; it must be explicitly reverified. No silent key replacement or plaintext fallback.

Use libsodium crypto_box_easy (X25519/XSalsa20-Poly1305) for each independent DM/receipt, with a fresh random 192-bit nonce. This is static identity-key agreement: it authenticates approved peers but DOES NOT provide forward secrecy or post-compromise recovery. A reviewed ratcheting protocol is future required security hardening, not an existing guarantee. Never describe static-key encryption as Signal or MLS.

## Protocol and network paths

1. Desktop -> relay: certificate-validated WSS/TLS. Production requires a trusted public certificate (or explicitly installed private CA), never disabled TLS validation. No ws:// fallback, including development. Relay requires TLS key/cert. Default bind loopback; operator explicitly sets host for remote access.
2. Relay authenticates each client by fresh, single-use random challenge signed with its Ed25519 identity. Bind proof to exact relay URL/scope and server challenge. A session has one identity; reject unauthenticated operations. Signed envelope author must match socket identity.
3. Sender -> peer through relay: signed outer envelope binds version, sender, recipient, message ID, nonce and ciphertext. Inside crypto_box authenticated ciphertext, repeat version, sender, recipient, ID and content kind; validate every field after decryption. Never accept a different destination, duplicate envelope ID with different contents, malformed keys, oversized protocol frames or unsupported version. Text protocol limits are transport safeguards, not attachment limits.
4. Each authenticated client explicitly supplies its approved contact IDs. Relay enforces reciprocal consent on every delivery. Receiver also checks its own pinned contact key before decrypting. The server is not trusted to enforce confidentiality.
5. Recipient -> sender: separate signed, encrypted receipt binding the original message ID. Mark delivered only after recipient has persisted the received message/dedup state and sender has authenticated the receipt. Socket send or relay acceptance alone is not delivery.

## Reliability, replay and storage

Persist outbound ciphertext/identity/history/dedup state atomically through an injected store before transmission; retransmit the identical envelope ID on reconnect. Persist received IDs before receipt. Duplicate valid envelopes may trigger another receipt but never another visible message. Serialize state mutations and persistence. Pending messages must survive process restart. Surface failed/sending/delivered states and retry explicitly. Relay has no offline mailbox in slice A: sender retains pending data until both clients reconnect; relay restart must not lose sender history.

Electron main process owns keys and networking; renderer gets only a minimal validated IPC API and public identity, contacts and decrypted visible history. Node integration off, context isolation on, sandbox on, strict local CSP, no navigation/popups or untrusted remote code. Validate sender frame against the local application document for every IPC call.

Use Electron safeStorage with Windows DPAPI for the complete local snapshot (keys, history, queue). Fail closed if OS encryption is unavailable; Linux basic_text is rejected. Never store plaintext fallback data. Write encrypted temporary snapshot then atomic rename; surface storage failures. Memory holds plaintext while unlocked. No cloud recovery: losing the profile/OS credential loses keys and history; a restored identity must reverify contacts as appropriate. Multi-device identity and recovery are not implemented. No message, file, key, auth token or raw exception payload logging.

## Future slices — design constraints, not implemented controls

### Extension design recorded before implementation (2026-10-19)

Authenticated ephemeral `rtc` and `transfer` controls use existing signed crypto_box envelopes, pinned peer identity and reciprocal relay authorization. Controls have fresh UUIDs, 60-second lifetimes, clock-skew checks and an in-memory bounded replay cache; they never enter message history or durable outbox. Receipt of signaling does not authorize microphone/capture/file access. A sender must be connected and handle backpressure explicitly.

Calls use one direct peer RTCPeerConnection; SDP (including DTLS fingerprints) and ICE candidates travel only inside authenticated E2EE controls. This binds media endpoints to verified contacts. Peer WebRTC DTLS-SRTP/data channels provide E2EE for a direct pair; optional TURN forwards ciphertext and does not terminate peer encryption. No SFU is used. A local explicit outgoing call or accepted incoming call is required before microphone capture. Screen sharing requires a second explicit source-selection/start action; source enumeration alone grants no transmission. On hangup/disconnect, stop every local media track and close channels. Only the trusted local renderer receives media permissions; arbitrary origins receive none. Relay exposure and endpoint IP metadata remain as documented. No automatic unencrypted media fallback.

Files use a separate transfer state machine: bounded encrypted chunks, receiver acceptance and native save selection, backpressure/ACK offsets, resume state protected by OS encryption, authenticated final SHA-256 integrity and exclusive final destination publication. XChaCha20-Poly1305 chunk nonces are random192-bit and bind transfer ID/offset/total. Negotiated transfer keys travel only inside authenticated E2EE offers. Cached partial bytes are encrypted; keys/offsets stay in a separate OS-encrypted transfer snapshot. Direct authenticated WebRTC data channels are preferred; existing E2EE control relay is a slower encrypted fallback. A relay never receives transfer keys or file plaintext. No auto-open or overwrite. Deleting partial data is limited to engine-owned paths. Large-file capacity is constrained by actual filesystem/storage, not subscription or arbitrary product quotas.

These are implementation contracts, not verification claims. Completion, real-device media, cross-network operation and 1440p60 performance must each be established by actual tests. Private groups remain disabled until a reviewed group protocol/membership design is implemented; pairwise primitive selection alone is not a reviewed group protocol.

- Voice/sharing: direct peer WebRTC with DTLS-SRTP; exchange and authenticate session description/fingerprints inside existing E2EE peer envelopes. TURN may relay ciphertext only; SFU use requires additional sender-side E2EE and a reviewed key scheme. Permission and explicit target selection required. Measure receiver 2560x1440/60 performance before claiming success.
- Files: direct encrypted chunk stream, encrypted relay fallback, bounded buffers/backpressure, authenticated chunk index/transfer ID and final integrity verification. Resume/cancel, safe explicit destination, partial files and storage errors mandatory. No arbitrary file-size quota; no completed transfer or tested size claimed yet.
- Groups: adopt reviewed MLS implementation or equivalently reviewed group key protocol before group content. Membership changes rotate epochs; removed members get no future keys. New members receive only post-join history by default. Authorize every message, call and transfer against current epoch. No group API is enabled in slice A.
- Key rotation: no in-place rotation in slice A; create and reverify a new identity. Add reviewed session-key rotation/ratchet, revocation and migration before production use.

## Dependency rationale and references

Electron supplies a Windows desktop shell and OS credential integration; Node and ws supply a small TLS relay. libsodium supplies established signature and encryption primitives. Lock versions and retain upstream licenses. Audit dependency updates and protocol changes.

- https://doc.libsodium.org/public-key_cryptography/authenticated_encryption
- https://doc.libsodium.org/public-key_cryptography/ed25519_to_curve25519
- https://www.electronjs.org/docs/latest/api/safe-storage
- https://www.electronjs.org/docs/latest/tutorial/security

## Verification boundary

Automated two-client TLS tests can establish local protocol behavior; they do not prove security against all adversaries, separate-computer operation, or streaming performance. Record actual results in HANDOFF.md. There is no independent security audit.
