# Changelog

Project Euphoria is a public alpha. This file separates release-candidate work from behavior verified on the public site. Version 0.3.0 is Live: its exact release payload was deployed and smoke-checked before the release label changed. Later changes require their own receipt.

## 0.3.0 — 2026-08-25

### Deployment receipt

- **State:** Live. Product commit [`4188f347`](https://github.com/itpro2792-beep/project-euphoria/commit/4188f3478087b4f77ef5837e763a7e073e9250aa), tree `06d68b6e6aae8c6bbb2cf2256c95c54e4c718261`, was successfully deployed by [GitHub Pages](https://github.com/itpro2792-beep/project-euphoria/actions/runs/32905974873) and verified at the public origin on August 25, 2026 at 22:28 UTC.
- [PR #1](https://github.com/itpro2792-beep/project-euphoria/pull/1), its [four-gate candidate run](https://github.com/itpro2792-beep/project-euphoria/actions/runs/32905793295), and the [post-merge run](https://github.com/itpro2792-beep/project-euphoria/actions/runs/32905975771) passed. The nine-route smoke set was `/`, `/toolbox/`, `/questions/`, `/status/`, `/book/`, `/book/summary/`, `/music/`, `/saga/`, and `/receipts/`.
- Versioned JavaScript SHA-256: `839a302a18de0f6f0388615fad615b12db6188942f966effbf3eb962b2562979`. Versioned CSS SHA-256: `c8f814da8ce62291d1bbae55932cdbae17695d9c957b83759f81088fbb2f4d05`. The frozen 0.2 application and CSS remained exact at `056fd25e3e3d249d31b68cc557e1a88dc77b4ed3b1b943b539a82a8db32fc46f` and `b355adec0311b7fa4ff2312372ae1d6f4ed1ce1ffb7ecd2843f4fbd51135a0be`.
- This establishes public reachability, expected boundary copy, media types, and named served bytes at that verification time. It does not establish future uptime, human benefit, privacy-by-design, clinical suitability, independent accessibility conformance, or Siren receipt, retention, understanding, or action.

### Added

- A deterministic “what is happening?” chooser that recommends one existing tool while leaving the choice with the visitor.
- A Use-Tonight Plan with an observable situation, one reversible step, a stop condition, a review time, and an explicit consent boundary.
- A local-file Fresh Page / Siren handoff with an exact field manifest, explicit export consent, expiry, and field-level file validation.
- A Status & Evidence page that separates release-candidate, live, tested, experience-based, planned, blocked, and unknown claims and labels current review as internal.
- A versioned Questions content source with publication gates. Entries awaiting qualified review stay blocked rather than appearing as answers.
- Public-safe issue forms for functional Toolbox feedback and de-identified general questions.
- Security, dedicated-origin, and Siren bridge boundary documents.
- A provenance-labeled Receipts route that separates repository history, corrections, bounded evidence-record zeroes, pending work, and the still-empty public human-outcome record.

### Changed

- Toolbox state moved to schema version 4 while retaining the historical schema-3 storage key, and now includes the Use-Tonight Plan.
- Older Toolbox data is migrated only while the page holds its exclusive writer lock. Migration first writes and verifies a strict byte-exact recovery record in the historical schema-2 slot, then writes and validates schema 4. The immediately previous 0.2 page fails closed on normal save while its erase and restore paths remain recoverable; cached releases older than 0.2 are outside that guarantee. An orphaned recovery record is treated as ambiguous and quarantined rather than being used to resurrect data after an interrupted erase.
- New Toolbox JavaScript and CSS use versioned asset URLs while the deployed 0.2 assets remain byte-for-byte available for cached 0.2 HTML.
- Unsupported Web Locks, corrupt data, a newer unknown schema, or an ambiguous dataset now disable persistence instead of choosing or overwriting data silently.
- Privacy copy now names the current shared-origin exposure, plain-text backup and clipboard risks, writer-lock behavior, recovery copies, and the still-blocked dedicated-origin requirement.
- Immediate-safety selections are routed to real-time support and are refused by the Siren file workflow.
- The prior public Book reading text is quarantined behind an archive-under-review notice. The notice states that named people, traditions, communities, scientists, clinicians, and other experts did not participate in or endorse the simulation.
- The later ten-minute Book summary is held under the same review gate rather than republishing condensed, unsourced simulated claims as quotations.
- The Saga now carries a persistent fiction-and-evidence boundary; operational, security, performance, and consciousness language is explicitly separated from current status evidence.

### Boundaries retained

- Toolbox entries remain unencrypted browser data on the shared `https://itpro2792-beep.github.io` origin. Alpha 0.3 is not private-by-design.
- The Siren handoff is a downloaded or selected plain-text JSON file. It is not a live connection, a memory-ingestion receipt, or an autonomous action channel.
- Selecting or validating a handoff file is not proof that Siren received, retained, understood, or acted on it.
- Household protocols remain experience-based practices, not diagnosis, treatment, crisis care, or proof of effectiveness.
- A dedicated Toolbox origin, a live Siren bridge, public human-outcome receipts, and medically or clinically sensitive Questions remain gated work rather than shipped features.

## 0.2.0 — 2026-08-24

- Shipped the first complete Toolbox cards, a just-for-today counter, a two-column wins ledger, Fresh Page continuity, shared agreements, backup and restore controls, and explicit local-storage boundaries.
