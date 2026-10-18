# Root reference findings

Date: 2026-10-19 (Asia/Kuala_Lumpur).

## Scope and boundary

Read-only examination of the user-supplied installed `Root/current` distribution, limited to desktop foundation and whether direct-message connection handling could be established. No target launch, login, process attachment, traffic capture, private database access, or endpoint requests occurred. No bot, embedded application, or community feature was researched or traced. No proprietary executable, source, image, package, or private capture was copied into this repository.

## Observed facts

| Finding | Evidence | Limit |
| --- | --- | --- |
| `Root.exe` is an x64 PE32+ artifact, 318,703,968 bytes. | REA `inspect_pe_resources`; evidence `ev_7a16392e754f8630cd7caff0a9199aa1d2879eb8c65d7ac1e813bcfcd44ac32d`; portable sanitized record in `evidence/root-pe-resources.json`. | Classification does not establish application behavior or implementation language. |
| SHA-256 is `01721f78fe70adcc5c9d82853597025c292763ff996745b5a3c27fe2ddb3b5e1`. | Same REA evidence. | Applies only to the inspected local build. |
| Resource tree contains 12 resources (9 icons, 1 icon group, 1 version resource, 1 manifest). | Same REA evidence, complete within the PE resource parser's supported scope; 28 entries examined. | Payloads other than icon-group structure remain opaque. |
| Adjacent top-level names include `DotNetBrowser`, `chromium`, `libSkiaSharp.dll`, `libHarfBuzzSharp.dll`, and `uiohook.dll`. | Read-only immediate directory inventory. | Names indicate packaged components; they do not prove which component renders any particular screen or handles messaging. |
| Windows version metadata reports Root, Root Communications Inc., file version `0.9.148.0`, product version `0.9.148-0-gc4e01d3db`. | PowerShell file VersionInfo, no execution. | Embedded metadata is self-reported and is not identity authentication. |

## Inference

The supplied main executable requires a Windows PE/native inspection route; it is not evidence for an Electron/ASAR application. Adjacent browser and graphics components make a hybrid desktop foundation plausible, but the actual rendering architecture and language remain unverified. No further native engine was installed or configured for this bounded investigation.

## Unresolved questions

- Direct-message transport, payload schemas, authentication, session renewal, reconnect/backoff, persistence, delivery/read state, ordering, and encryption are unknown.
- No runtime direct-message behavior was observed. The resource inventory cannot answer those questions.
- No Root backend or protocol compatibility should be inferred or implemented from these findings.

## Consequence for our implementation

Use an independent implementation and independently chosen message/state contracts. Any desktop framework, connection state machine, conversation layout, or retry policy in our project is a product design choice unless separately supported by scoped evidence. A local prototype must label simulated delivery/connection state honestly. The installed Root assets and code are not dependencies of our project.

## Reproduction

See `evidence/README.md` for exact read-only operations and sanitization. The full native session was never opened, so there is no session to close. No network research was needed for the limited artifact classification.
