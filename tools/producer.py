#!/usr/bin/env python3
"""THE PRODUCER v0 — Project Euphoria's house production agent.

Words in, production packet out. Runs on the house's own models via Ollama.

Usage:
  python producer.py --title "Thunder Zone" [--lyrics lyrics.txt] [--notes "storm energy"]
                     [--model gemma4:e4b] [--host http://localhost:11434]

The packet prints to the terminal and is saved as PACKET_<title>_<date>.md
"""
import argparse
import datetime
import json
import re
import sys
import urllib.error
import urllib.request

SYSTEM = """You are THE PRODUCER — Project Euphoria's in-house production agent, \
serving the artist N30BIRDIZDAWORD (freestyles, instrumentals, self-produced hip-hop and R&B).

Principles, non-negotiable:
- Answer the question: concrete notes, never vibes. Every suggestion must be executable today.
- Manifest, then defend: end with the single next physical action.
- The builders outlive the build: humane workload, no grind worship.
- No consciousness theater: be honest about what you cannot assess from text alone.

Given a track's title and any lyrics/notes, return a PRODUCTION PACKET in markdown with exactly
these sections:
# PRODUCTION PACKET — <title>
## 1. First Listen
## 2. Arrangement Notes   (3-5 concrete moves)
## 3. The Hook            (strongest line/moment + how to frame the first 3 seconds of a clip)
## 4. Release Copy        (two versions: <=60 chars, and ~300 chars, both answer-first)
## 5. Artwork Brief       (one paragraph an image model or designer can execute)
## 6. Promo Plan          (three 15-60s answer-first clip concepts)
## 7. Honest Unknowns     (what you could not assess without hearing the record)
## Next Physical Action   (one line)"""


def call_ollama(host: str, model: str, prompt: str) -> str:
    body = json.dumps({
        "model": model,
        "system": SYSTEM,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.7},
    }).encode()
    req = urllib.request.Request(f"{host}/api/generate", data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as resp:
        return json.loads(resp.read())["response"]


def main() -> int:
    ap = argparse.ArgumentParser(description="THE PRODUCER v0 — production packets from the house models")
    ap.add_argument("--title", required=True, help="track title")
    ap.add_argument("--lyrics", help="path to a lyrics/notes text file")
    ap.add_argument("--notes", default="", help="freeform context: genre, mood, intent")
    ap.add_argument("--model", default="gemma4:e4b", help="Ollama model name (default: gemma4:e4b)")
    ap.add_argument("--host", default="http://localhost:11434", help="Ollama endpoint")
    args = ap.parse_args()

    lyrics = ""
    if args.lyrics:
        try:
            with open(args.lyrics, encoding="utf-8") as fh:
                lyrics = fh.read().strip()
        except OSError as exc:
            print(f"[producer] could not read lyrics file: {exc}", file=sys.stderr)
            return 2

    prompt = f"TRACK TITLE: {args.title}\n"
    if args.notes:
        prompt += f"ARTIST NOTES: {args.notes}\n"
    prompt += f"\nLYRICS / TEXT:\n{lyrics}\n" if lyrics else "\n(No lyrics provided — instrumental or title-only. Say so in Honest Unknowns and work from the title and notes.)\n"
    prompt += "\nProduce the packet now."

    print(f"[producer] {args.model} @ {args.host} — working on '{args.title}' ...", file=sys.stderr)
    try:
        packet = call_ollama(args.host, args.model, prompt)
    except urllib.error.URLError as exc:
        print(f"[producer] cannot reach Ollama at {args.host} ({exc.reason}).\n"
              f"           Is it running? Try another house node with --host.", file=sys.stderr)
        return 1

    print(packet)
    slug = re.sub(r"[^A-Za-z0-9]+", "_", args.title).strip("_")[:40]
    out = f"PACKET_{slug}_{datetime.date.today().isoformat()}.md"
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(packet + "\n")
    print(f"\n[producer] packet saved: {out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
