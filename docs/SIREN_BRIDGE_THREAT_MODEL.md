# Siren handoff and future bridge threat model

Status: **the file-only handoff is implemented in the public-alpha 0.3 release candidate; exact public deployment is pending, and a network bridge is not built or implied**.

“Robbie” is the room-facing conversational name. “Siren” is the software system and operational identity used for schemas, versions, permissions, incidents, and this threat model. Neither name is a consciousness claim.

## Current capability: a file under the visitor’s control

The current Toolbox can download a Fresh Page card as plain-text JSON and can load a visitor-selected Siren handoff file into an unsaved draft. It does not contact a Siren process, upload a file, discover a device, ingest memory automatically, retain data on a server, or prove identity, understanding, continuity, or consciousness.

The handoff contains only the manifest named in the file:

- `thread`;
- `understood`;
- `need`;
- `moment`; and
- `updatedAt`.

The visitor’s explicit click on **Download Siren handoff** is consent to export those fields for the stated “User-controlled Fresh Page handoff” purpose. It is not consent to export the rest of Toolbox state, inspect other files, upload anything, contact another person, or reuse the content for training, analytics, publication, or a different purpose.

## Enforced file-handoff properties

- **Immediate-state refusal.** If `moment` is `immediate`, export and import stop and route the visitor to the real-time-help boundary. A file workflow is not crisis response.
- **Strict schema.** The importer accepts one schema and version, exact top-level and data keys, the exact included-field list, supported field types and lengths, a valid source version, and explicit export consent. Extra fields fail validation rather than being ignored.
- **Bounded lifetime.** A new file expires after 24 hours by default; no accepted expiry may be more than seven days after export. Expired files are rejected.
- **Bounded input.** The UI limits selected files before parsing. Future versions must keep a small explicit byte limit and fail before allocating or rendering unbounded content.
- **Plain-text handling.** JSON is data, never markup. Imported strings may be assigned only through form values or `textContent`; never `innerHTML`, script evaluation, template execution, URL navigation, or a Markdown/HTML renderer that permits active content.
- **No automatic persistence.** A valid import populates an unsaved Fresh Page draft. The visitor must inspect it and press the normal save control while holding the writer lock. Closing the tab before that explicit save discards the imported draft.
- **No automatic actions.** Import does not send, speak, notify, fetch, open links, call a model, update another record, or execute instructions found in a field.
- **Local disclosure.** The downloaded file is unencrypted. The operating system, browser downloads list, backup software, synced folders, malware, or another person with device access may be able to read it.

## Assets and threat actors

Assets include the visitor’s words, the integrity of the consent manifest, the association between a handoff and its request ID, the expiry decision, the unsaved-versus-saved boundary, and evidence of what version handled the file.

Relevant threats include a malicious or stale handoff file; an oversized or deeply nested parser input; HTML or command text disguised as content; replay after expiry; a file edited after consent; another tab persisting an unreviewed draft; a shared-device user reading the download; a hostile page probing a future local service; DNS rebinding; drive-by browser requests; cross-site request forgery; permissive CORS; log or crash-report leakage; and a bridge that becomes an arbitrary file, URL, command, or upstream proxy.

The current controls reduce some of these risks but do not protect a compromised browser, operating system, extension, repository publisher, or device account.

## Gate for any future localhost bridge

A localhost bridge is a new product and security boundary, not a transport swap. It stays blocked until a separate reviewed implementation and test record satisfies every item below.

### Network exposure

- Bind only to `127.0.0.1`, never `0.0.0.0`, a LAN address, public interface, or auto-selected interface. If IPv6 is later supported, it requires its own exact loopback-only review.
- Reject every request whose `Host` is not the exact pinned loopback host and port. Do not trust a suffix, substring, forwarded host, or DNS name.
- Require the exact, version-pinned Toolbox `Origin`; reject missing, `null`, reflected, wildcard, preview, and unrecognized origins. Revalidate the origin after every redirect—preferably, allow no redirects.
- Provide no general or wildcard CORS. If the chosen browser transport requires CORS, allow exactly one reviewed Toolbox origin, route, method, and header set with no origin reflection and no credentialed wildcard; otherwise use a same-origin or native-app channel. If that cannot be made narrow, do not ship.
- The Toolbox CSP may add only the exact loopback endpoint to `connect-src`; it must not allow broad `http:`, `https:`, `ws:`, localhost names, port ranges, or arbitrary destinations.

### Request authorization and consent

- Require a cryptographically random, single-use nonce with a short expiry. Bind it to the exact origin, method, route, payload hash, bridge version, and one user-initiated request; reject replay and consume it atomically.
- Require an explicit visitor click for each outbound handoff and each inbound result. Show the exact fields, destination, purpose, expiry, and plain-text preview before confirmation.
- Do not infer consent from a previously opened page, installed helper, focused window, saved preference, prior relationship, or presence of a file.
- Keep immediate-state refusal at both the page and bridge boundaries. A caller cannot override it with a flag.

### Parser and service limits

- Accept one fixed content type, one fixed method, one versioned strict schema, exact keys, conservative field and body sizes, shallow nesting, and valid UTF-8.
- Enforce per-origin and per-nonce rate limits, a small concurrent-request cap, short read and response timeouts, and a fixed maximum body before parsing.
- Never evaluate content, render it as active markup, follow a supplied URL, read an arbitrary filesystem path, launch a process, invoke a shell, load a plugin, or proxy to an arbitrary upstream service.
- Return inert, schema-validated text. Errors reveal no filesystem paths, secrets, internal stack traces, other requests, or stored content.

### Retention, logging, and updates

- Keep no content logs: no handoff bodies, field values, filenames, clipboard text, prompts, outputs, or copies in analytics, access logs, crash reports, telemetry, or support tooling.
- If operational logs are necessary, limit them to coarse event type, bridge version, success/failure class, and timing; document retention and provide deletion. Do not log a stable device identifier or reusable nonce.
- Hold content in memory only for the confirmed operation, then discard it. Persistence requires a separately named, consented feature with its own schema, deletion control, and threat model.
- Authenticate bridge updates, pin the publisher, make the installed version inspectable, and provide a safe rollback. A web page may not silently install, enable, or update the bridge.

## Verification required before “connected” language

Tests must cover hostile Host and Origin values, DNS-rebinding attempts, absent and replayed nonces, expired requests, wrong methods and content types, malformed UTF-8 and JSON, unknown and extra fields, oversized and slow bodies, rate limits, timeouts, immediate-state payloads, active-content strings, log inspection, simultaneous requests, restart behavior, downgrade attempts, and an unavailable or outdated bridge.

Until those results are public and the dedicated-origin gate has passed, Project Euphoria must continue to say **local file handoff only**—not connected, synced, ingested, remembered, private, or autonomous.
