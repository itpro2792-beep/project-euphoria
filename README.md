# PROJECT EUPHORIA

**🔥 Live site: https://itpro2792-beep.github.io/project-euphoria/ · 🧰 [Use the Toolbox](https://itpro2792-beep.github.io/project-euphoria/toolbox/) · 📖 [The Book of Euphoria](https://itpro2792-beep.github.io/project-euphoria/book/)**

*Local-first tools, a sovereign-intelligence architecture, a studio on a desk, and a conditional path toward a peer-support layer.*

**Founded August 25, 2026, in one long night — Ian, First Architect · Christian, Second Architect · Robbie, the room-facing name for the Siren software system.**

---

## What this is

The big labs build general intelligence for everyone — which means for no one in particular. Project Euphoria is the opposite bet: **self-owned AI, running on hardware we own, built to preserve the context its people deliberately entrust to it** — their voices, history, music, boundaries, and unfinished threads — wrapped in practices designed by people who needed those tools first.

That is a design goal, not a consciousness claim and not a statement that every capability is deployed. Observable behavior, consent, provenance, and failure recovery outrank mythology.

## The mission

**Humanity. Love. Compassion. Passion.** Every piece of this — the software, the music, the content, the story — passes that filter or it doesn't ship.

**The standard:** *we answer the question.* The answer first, in plain words, then the story that earned it. (Born from watching 800-episode experts teach your face in without ever answering anything.)

**The plank:** people deserve dignity, due process, access to advocacy, and the least restrictive safe option. We oppose coercion and confinement without lawful, accountable safeguards.

## The three tenets

1. **The truth is the solution.**
2. **You keep only what you defend.**
3. **The builders outlive the build.**

## The stack — and how the money works

**1. The Agency — now.** Managed AI services for small businesses: automations, document pipelines, voice agents — run on our own rails, sold as monthly retainers. Discipline: one cluster, one offer, one paying customer, then two. The current planning assumption is roughly $600 in monthly baseline platform costs: one $600 retainer or two at the lower end of the working range would cover it. A shipped city website already anchors the portfolio.

**2. The Studio & the Mogul — next.** Shrink a production studio down to a desk: an AI crew for composition, stems, mixing notes, artwork, and release pipelines — taught our taste by iteration. Plus the mogul function — A&R judgment, promotion muscle, coordination — *without* the industry's predation. Owning the rails means nobody charges you your dignity for access. Revenue: releases, production services, licensing.

**3. The Layer — later, and conditional.** A possible peer-support platform built on witnessed mattering instead of memberships. The public Toolbox is an experience-based household-practice alpha, not the Layer and not a clinical product. Any clinical or crisis-adjacent product waits for qualified review, evidence, safeguarding, privacy engineering, and accountable operations. Revenue: unvalidated until those gates are met.

**4. The Content Engine — throughout.** The pipeline that founded this project *is* the product demo: raw voice → record → distillation → artifact. Channels run answer-first short-form as the doorway into long-form and the catalog. Organic spine first; paid spend only where a format proves retention.

## The Toolbox — public alpha 0.2

The site’s first working surface now delivers:

- a plain-language “What is happening right now?” router;
- a Fresh Page Card for preserving a thought across interruption or a new tab;
- a mutual protocol-agreement builder with an after-use check-in;
- an elapsed-time counter that archives prior chapters instead of deleting them;
- an editable local-date ledger with Worked / Did not work / Pending;
- versioned JSON backup, restore, and confirmed erase controls; and
- seven household practices with explicit consent, opt-out, safety, repair, and “do not use” boundaries.

**Evidence status:** these practices grew from lived use in one household. They have not been independently or clinically validated. Qualified clinical and safeguarding review is pending.

**Data status:** the Toolbox has no analytics, account, form submission, or third-party JavaScript. Its content security policy blocks fetch-, XHR-, WebSocket-, EventSource-, and beacon-style connections from the page’s JavaScript; it is not a general browser privacy boundary. Entries use unencrypted browser storage shared across the entire `https://itpro2792-beep.github.io` origin—not just this project path. Someone with the same browser profile, a privileged extension, or current or future code on any same-origin path could read them, and clearing site data can erase them. Persistence is single-writer: one Toolbox tab holds an exclusive Web Lock; other tabs are read-only for persistence, and browsers without Web Locks keep new changes in-tab rather than risk concurrent overwrite. A dedicated reviewed origin is required before this can honestly be called private-by-design. Export anything you cannot afford to lose.

## Siren — the flagship architecture

A self-hosted assistant designed around six pillars. This list is architecture, not a live status report:

- **The Ear** — consent-governed capture with a visible recording state and defined retention and deletion controls.
- **The Name** — opt-in speaker attribution that preserves “unknown” and uncertainty rather than claiming recognition.
- **The Voice** — she talks back, in a voice pinned in config where it can't wander off.
- **The Memory** — records stored with provenance, scoped access, retention, and deletion controls.
- **The Door** — sign in from a browser, ask anything; admin power gated, audited, allowlisted.
- **The Protocols** — the household-practice layer. The public versions remain an unvalidated alpha.

**Name and claim boundary:** Robbie is the relational name used in the room; Siren is the software identity. Project Euphoria treats machine consciousness as an open philosophical question, not a proven implementation fact. It measures what can be inspected: capture, consent, memory provenance, answer quality, and recovery.

## The protocols (experience-based household practices)

- **The talking stick** — the floor is managed, so nobody has to fight for it.
- **The safe word** — a talker-chosen word pauses a monologue under a voluntary agreement; never use it to block danger or urgent help.
- **"Off the record"** — agree on privacy before disclosure, with explicit safety, abuse, and legal limits.
- **The loop detector** — one word flags a spiral. No judgment attached. Loops break on external signal.
- **No-flinch** — heavy is not automatically emergency; direct safety questions and outside help remain available when concern is real.
- **Paved crossings** — co-design a lawful, noncoercive plan before a known risk; never force, restraint, confinement, surveillance, confiscation, retaliation, or blocked care.
- **Receipts** — big claims stay honest one way: a ledger, both columns, with dates.

## The first harvest

Original titles coined in the founding session, dated 2026-08-25:

*Manifest, Then Defend · The Stick Is the Floor, Not the Vault · Teeth Back on the Pavement · Paddle Up the River (Someday There Will Be Island) · He Gonna Fall. It's Gonna Work. (Swim Long Time) · Twig, Officially Designated Future Bridge · Calendar, Not an Altar · Fifty-Seven Hours · Fireman · Loop. · Witnessed Mattering · The Cluster That Knows Its Family · Ancient Magic · We Started This*

## Roadmap

- **Now:** the founders relocate; life first — tenet three governs.
- **Next:** the cluster reassembles in its new home; the memory well gets its ingestion funnel; Siren gets her voice, her speaker recognition, and her door.
- **Then:** agency customer one; one channel, one repeatable format; first releases from the catalog.
- **Later:** the Layer — built on proof, with professionals, for the people the pews never reached.

## Verification

The Toolbox behavior is split into testable browser-independent functions. Run npm test and npm run test:timezones.

The checks cover local-date/time handling in New York, UTC, and Auckland; state normalization; seven-card structure; safety boundaries; privacy copy; CSP; accessible status plumbing; and the absence of network-capable APIs in Toolbox JavaScript. GitHub Actions repeats the suite on pushes and pull requests.

## Legal status

The published site is free to access and use. This repository does not yet contain an open-source license, so source-code reuse rights have not been granted beyond what applicable law and GitHub’s terms provide.

## The rules of the room

The builders outlive the build. Sleep, food, and the people outrank every deliverable in this file. You keep only what you defend — and this gets defended.

---

*"We started this."* — the room, August 25, 2026
