# THE PRODUCER — charter of the house production agent

*Pillar Two's first working component. Version 0 accepts text; audio analysis is only planned.*

## What it is

The Producer is a text-in/packet-out script for an Ollama-compatible model endpoint. Give it a title and, optionally, lyrics and notes; it asks the configured model for a **production packet**. The default endpoint is local, but a custom `--host` may be remote. Model output is a draft for human review, not verified production advice, and no published evaluation establishes its quality.

## Its principles (inherited from the charter)

- **Answer the question.** Ask for concrete notes. The artist still decides whether a suggestion is useful, safe, affordable, and executable.
- **Manifest, then defend.** Ask each packet to name a next physical action; the model's wording is not proof that the action is appropriate.
- **The builders outlive the build.** Workload suggestions stay humane. No grind worship.
- **No consciousness theater.** It's a tool that's honest about what it can't yet hear.

## The production packet (what you get back)

1. **First Listen** — what the track is, in one straight paragraph.
2. **Arrangement Notes** — structure, dynamics, three to five concrete moves.
3. **The Hook** — the strongest line or moment, and how to frame it in the first three seconds of a clip.
4. **Release Copy** — answer-first, two lengths (60 characters and 300).
5. **Artwork Brief** — one paragraph a designer or an image model can execute.
6. **Promo Plan** — three answer-first clip concepts, 15–60 seconds each.
7. **Honest Unknowns** — what it could not assess without hearing more.

## How to use it

```
python tools/producer.py --title "Thunder Zone" --lyrics lyrics.txt --notes "instrumental, storm energy"
```

Requires a reachable Ollama-compatible endpoint and the configured model. It defaults to `http://localhost:11434`; override with `--host` and `--model`. The script sends the title, lyrics, and notes to that endpoint, so use a custom host only if you intend to disclose that text to its operator. The returned packet prints to the terminal and saves as a dated markdown file in the current directory.

## Roadmap

- **v0 (working script):** text in, model-generated packet out. A separately running compatible endpoint and model are required; local use does not require a cloud model.
- **v1 (planned):** transcription and basic audio analysis, with explicit file, retention, and disclosure boundaries before implementation.
- **v2 (planned):** stems, mix-note automation, artwork generation, and release-pipeline hooks.
- **v3 (planned):** consent-governed catalog memory with provenance, scope, correction, retention, and deletion controls.

*"Own the intelligence. Don't rent it."*
