#!/usr/bin/env python3
"""Run labeled lexical recall examples with the independent standard-library verifier.

These hand-constructed cases probe a narrow rule. Passing them is not a claim
about semantic understanding, factual correctness, or real-world accuracy.
"""

import json
from collections import Counter
from pathlib import Path

from verify_retrieval import inspect


def main():
    path = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "recall-challenges.json"
    cases = json.loads(path.read_text(encoding="utf-8"))
    counts = Counter()
    seen = set()
    for case in cases:
        name = case["id"]
        if name in seen or not case["history"] or not case["query"]:
            raise ValueError(f"duplicate or empty challenge: {name}")
        seen.add(name)
        result = inspect([{"text": text} for text in case["history"]], case["query"])
        actual = (result["status"], result["selected_index"])
        expected = (case["expected_status"], case["expected_index"])
        if actual != expected:
            raise AssertionError(f"{name}: expected {expected}, observed {actual}")
        counts[case["kind"]] += 1
    print(f"Controlled recall challenges: {len(cases)}/{len(cases)} passed")
    for kind in sorted(counts):
        print(f"  {kind}: {counts[kind]}/{counts[kind]}")
    print("Scope: constructed lexical examples; no measured real-world accuracy")


if __name__ == "__main__":
    main()
