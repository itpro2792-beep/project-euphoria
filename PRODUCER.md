# THE PRODUCER — charter of the house production agent

*Pillar Two's first worker. Version 0: works with words. Hearing comes next.*

## What it is

The Producer is Project Euphoria's in-house production agent — the first living piece of the studio-on-a-desk. Hand it a track (title, lyrics, notes) and it returns a **production packet**: concrete, actionable, answer-first. It runs on the house's own local models — sovereign, offline, no rented intelligence required — and it serves one artist first: the Second Architect.

## Its principles (inherited from the charter)

- **Answer the question.** Concrete notes, never vibes. Every suggestion executable today.
- **Manifest, then defend.** A packet isn't done until it names the next physical action.
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

Requires a local Ollama endpoint (the house has several). Defaults to `http://localhost:11434` and a mid-size house model; override with `--host` and `--model`. The packet prints to the terminal and saves as a dated markdown file.

## Roadmap

- **v0 (now):** words in, packet out — local models, zero cloud dependency.
- **v1:** ears — transcription and basic audio analysis, so the packet starts from the actual recording.
- **v2:** hands — stems, mix-note automation, artwork generation, release-pipeline hooks.
- **v3:** memory — the Producer remembers the catalog, the artist's taste, and every packet it ever wrote, through the house memory plane.

*"Own the intelligence. Don't rent it."*
