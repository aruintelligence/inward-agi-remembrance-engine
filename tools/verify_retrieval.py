#!/usr/bin/env python3
"""Independently recheck one browser-local lexical recall against an exported snapshot.

The verifier has no browser imports or network access. A matching result establishes
agreement on the stated retrieval rule, not truth or provenance of the entries.
"""

import json
import sys
import unicodedata
from fractions import Fraction
from pathlib import Path

STOP_WORDS = set(
    "a an and are as at be by do did for from how i in is it me my of on or "
    "our say said the this to was we were what when where who why with you your "
    "remember memory field please tell about".split()
)
MAX_BYTES = 256_000


def tokenize(text):
    words = []
    current = []
    for char in unicodedata.normalize("NFKC", text).lower():
        if unicodedata.category(char)[0] in "LN":
            current.append(char)
        elif current:
            words.append("".join(current))
            current = []
    if current:
        words.append("".join(current))
    return [word for word in words if len(word) >= 2 and word not in STOP_WORDS]


def inspect(history, query):
    terms = list(dict.fromkeys(tokenize(query)))
    result = {
        "status": "no-evidence",
        "candidate_count": len(history),
        "supported_count": 0,
        "selected_index": None,
        "matches": [],
        "score": None,
        "ambiguity_count": 0,
    }
    if not history:
        result["status"] = "no-memory"
        return result
    if not terms:
        return result

    ranked = []
    for index, entry in enumerate(history):
        candidate_terms = set(tokenize(entry["text"]))
        matches = [term for term in terms if term in candidate_terms]
        if matches:
            score = 4 * len(matches) + Fraction(len(matches), len(candidate_terms))
            ranked.append((score, index, entry["text"], matches))
    result["supported_count"] = len(ranked)
    if not ranked:
        return result

    ranked.sort(key=lambda candidate: (candidate[0], candidate[1]), reverse=True)
    best = ranked[0]
    tied = [candidate for candidate in ranked if candidate[0] == best[0]]
    result["score"] = str(best[0])
    result["matches"] = best[3]
    result["ambiguity_count"] = len(tied)
    if any(candidate[2] != best[2] for candidate in tied):
        result["status"] = "ambiguous"
    else:
        result["status"] = "supported"
        result["selected_index"] = best[1]
    return result


def read_history(snapshot_path):
    path = Path(snapshot_path)
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("snapshot exceeds the 256 KB verifier limit")
    state = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(state, dict) or type(state.get("schema_version")) is not int or state["schema_version"] != 1:
        raise ValueError("expected a v1 Remembrance Engine snapshot")
    history = state.get("user_history")
    if not isinstance(history, list) or len(history) > 40:
        raise ValueError("expected at most 40 history entries")
    if any(not isinstance(item, dict) or not isinstance(item.get("text"), str) or len(item["text"]) > 2000 for item in history):
        raise ValueError("history entries must contain text of at most 2000 characters")
    return history


def main():
    if len(sys.argv) != 2:
        raise ValueError("usage: python3 tools/verify_retrieval.py exported-state.json < query.txt")
    history = read_history(sys.argv[1])
    query = sys.stdin.read(2002).strip()
    if not query or len(query) > 2000:
        raise ValueError("provide a question of 1–2000 characters on standard input")
    print(json.dumps(inspect(history, query), ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        print(f"Verification failed: {exc}", file=sys.stderr)
        sys.exit(2)
