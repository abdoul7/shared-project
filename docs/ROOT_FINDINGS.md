# Root reference findings

Date: 2026-10-19 (Asia/Kuala_Lumpur).

## Scope and boundary

Read-only examination of the user-supplied installed `Root/current` distribution, extended to messaging, voice, screen sharing and file attachments. No target launch, login, process attachment, traffic capture, private database access, or endpoint requests occurred. Excluded features were not researched or traced. A narrowly selected embedded WebRTC JavaScript resource was materialized under ignored `.local/reference-private/` for inert inspection; no proprietary source/assets are tracked or used by Stillroom.

## Observed facts

| Finding | Evidence | Limit |
| --- | --- | --- |
| `Root.exe` is an x64 PE32+ artifact, 318,703,968 bytes. | REA `inspect_pe_resources`; evidence `ev_7a16392e754f8630cd7caff0a9199aa1d2879eb8c65d7ac1e813bcfcd44ac32d`; portable sanitized record in `evidence/root-pe-resources.json`. | Classification does not establish application behavior or implementation language. |
| SHA-256 is `01721f78fe70adcc5c9d82853597025c292763ff996745b5a3c27fe2ddb3b5e1`. | Same REA evidence. | Applies only to the inspected local build. |
| Resource tree contains 12 resources (9 icons, 1 icon group, 1 version resource, 1 manifest). | Same REA evidence, complete within the PE resource parser's supported scope; 28 entries examined. | Payloads other than icon-group structure remain opaque. |
| Adjacent top-level names include `DotNetBrowser`, `chromium`, `libSkiaSharp.dll`, `libHarfBuzzSharp.dll`, and `uiohook.dll`. | Read-only immediate directory inventory. | Names indicate packaged components; they do not prove which component renders any particular screen or handles messaging. |
| Windows version metadata reports Root, Root Communications Inc., file version `0.9.148.0`, product version `0.9.148-0-gc4e01d3db`. | PowerShell file VersionInfo, no execution. | Embedded metadata is self-reported and is not identity authentication. |

## Deeper investigation: shipped behavior evidence

This is a focused static analysis, not a complete Root reverse engineering or a live two-client test. The important improvement over the first pass is reading actual embedded media implementation, rather than inferring behavior only from PE metadata. Byte offsets below use the exact executable hash above. Selected source offsets and hashes are recorded in `evidence/root-communication-static.json`; no source bodies are included.

### Voice and screen sharing — partially answered

- Root's executable contains an embedded HTML entry titled Root WebRTC and references to its WebRTC JavaScript/CSS resources. A complete-looking JavaScript module occupies bytes `[134945675,139363107)`, SHA-256 `a8a562f322845e193770e61bbb2281fe1cde4e0891cfe1b70f49a52114d6f82c`. These are byte-selection boundaries, not a recovered native resource table.
- Custom media code calls browser `getDisplayMedia`, selects a video track, inspects captured audio, and supports separate screen constraints. Native loopback audio can replace/fill browser-captured audio; the code waits for a C# capture track when it is not immediately available. Thus Windows system audio capture is explicitly handled as a distinct path, with a declined/failure condition.
- Custom microphone code calls `getUserMedia`, combines audio constraints, uses echo cancellation and browser noise suppression when its optional effects path is unavailable, and gates a track for push-to-talk. Device permission and output routing (`setSinkId`) code is present. Presence of an optional effects SDK is not a recommendation to reuse that SDK.
- Shipped code includes both a legacy direct `RTCPeerConnection` path with ICE credentials and a relay-only fallback after repeated transport faults, and a LiveKit adapter path. Backend selection examines a preferred backend, probes v2 and otherwise follows v1 session creation. **Which backend this account/build actually uses remains unknown.** Merely finding LiveKit dependency code would not establish adoption; here custom adapter invocation/selection code provides the stronger static link.
- Custom screen publisher changes encoding bitrate, frame rate and degradation preference through sender `getParameters`/`setParameters`; screen capture distinguishes presentation/text and motion modes. These are adaptation controls, not measured quality guarantees.
- Custom diagnostics gather inbound/outbound RTP, candidate/transport and connection statistics; separate LiveKit publisher/subscriber snapshots exist. Disconnect clears publications, subscriptions, watchdog timers, speaking state, bindings and stats. This supports explicit lifecycle cleanup and measurement as useful independent Stillroom requirements.

No receiver FPS, actual codec negotiation, audio latency, retransmission, remote network resilience, native capture permissions or real system audio was measured in Root.

### Messaging — partially answered

Selected native-readable names identify separate direct-message service/repository contracts and packet families for creation, edits, deletion, reactions, pins, typing indicators and view time. Other names identify ring/decline, draft creation, retry-message creation and pending attachments. These show explicit product/protocol concepts in the shipped build; they do **not** recover method bodies, ordering guarantees, persistence implementation or prove those paths execute. The direct-message WebRTC packet family separately names attach/detach, device status, transport and data channel state. Message text transport and media signaling should not be conflated.

### File attachments — partially answered, transfer guarantees unresolved

Names identify `FileUploadRepository`, `FileUploadService`, pending message attachments, upload progress, `UploadFileAsync`, file download request/response and multipart form data. Some nearby download classes belong to browser/image caching; those are not evidence for message file transfer. These bounded observations support an attachment workflow with progress, but do **not** establish peer-to-peer transfer, encrypted attachment content, chunk sizing, resume, maximum tested size, range requests or end-to-end verification. Stillroom's resumable encrypted transfer design must be independent and separately tested.

## Tool results and limits

- REA `inspect_managed_artifact` rejected the 318,703,968-byte executable because its eager snapshot limit is 134,217,728 bytes. No repeated identical call or engine install followed. Manual PE directory inspection found x64 machine `0x8664` and zero CLI directory RVA/size. Ordinary managed CIL recovery is not established; native/AOT-like packaging is plausible, not proven solely by names.
- REA JavaScript analysis of the selected inert module retained parent evidence `ev_7a72565ec10992617232234d9987b31de8ac0682533216ad05ebb6c2756ba918` (summary `ev_332bb463ccdcec8547b9e77383aaf6bc8367fd86d30bfa0ad6f54af247d99fa3`). Its worker exhausted the configured 1 GiB heap: zero parsed modules/findings, explicit partial coverage. Therefore **no semantic graph conclusions are claimed from that result**. The concrete media observations above instead come from bounded manual source contexts, recorded with original source offsets.
- No native decompiler engine was available/configured for this pass. No claims of original C# recovery, backend recovery, E2EE or protocol compatibility are made.

## Inference

The supplied main executable requires a Windows PE/native inspection route; it is not evidence for an Electron/ASAR application. Avalonia domain/UI names plus the actual browser media module and native bridge names support a hybrid desktop/browser media design. Exact native call sites remain unverified. No further native engine was installed or configured.

## Unresolved questions

- Direct-message payload schemas, authentication, session renewal, persistence, ordering, cryptographic guarantees and actual delivery semantics remain unknown despite the richer named packet inventory.
- No runtime communication behavior was observed. Static source cannot establish measured receiver performance or cross-machine functionality.
- No Root backend or protocol compatibility should be inferred or implemented from these findings.

## Consequence for our implementation

Use an independent implementation and independently chosen message/state contracts. Any desktop framework, connection state machine, conversation layout, or retry policy in our project is a product design choice unless separately supported by scoped evidence. A local prototype must label simulated delivery/connection state honestly. The installed Root assets and code are not dependencies of our project.

## Reproduction

See `evidence/README.md` for exact read-only operations and sanitization. The full native session was never opened, so there is no session to close. No network research was needed for the limited artifact classification.

For the deeper pass, first verify the exact executable SHA-256, then select the module's recorded byte range into an ignored local directory. Read the selected module as UTF-8 without evaluating it. Each source-context entry in `evidence/root-communication-static.json` records a literal, its character offset within that UTF-8 text, the corresponding original executable byte offset and SHA-256 of the bounded context (100 preceding characters through 700 characters after the literal start). Native-readable name entries instead record their first ASCII byte occurrence and have name-only confidence. Re-run REA on a selected source only if its resource blocker has actually changed; the failed broad graph is not useful behavioral evidence.
