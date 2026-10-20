# Recall evidence protocol

The Remembrance Engine uses a deterministic lexical rule to decide whether a prior browser-local entry can be quoted. This rule is intentionally narrow. A quote means the query and a stored entry share words; it does not establish that the entry is correct, that the user meant to cite it, or that the software understands the query.

## Decision rule

Only entries that existed **before** the submitted message are candidates. The inspection field uses the same rule without submitting a message, altering the field, or saving its query.

1. Normalize text to Unicode NFKC and lowercase it. Split on everything except Unicode letters and numbers. Drop words shorter than two Unicode code points and the fixed stop-word set in the browser source and independent verifier. Deduplicate the query words and each candidate's words.
2. For each earlier entry, keep the distinct query words it shares, in query order. Require **at least two distinct substantive words in the same entry** before it can be quoted. Separate one-word matches across entries and repeated query words do not add up. If there are only one-word matches, report insufficient evidence without quoting an entry; if there are none, report no evidence.
3. For eligible entries, let `m` be the number of shared words and `c` the number of distinct entry words. Its lexical score is `4m + m/c`. Rank by that score; recency never adds evidence.
4. If distinct eligible texts tie at the top score, abstain. If top-scoring entries contain identical text, select the most recent one. Otherwise select the unique top entry.
5. The simulated coherence gate can still suppress a response. A successful lexical selection is shown in the inspector, but a vetoed response does not cite it.

The rule is a small, inspectable baseline, not semantic search. Two shared words can still be coincidental or misleading; the threshold does not prove relevance or truth. It deliberately misses single-word questions, paraphrases, and spelling variants. The stop-word list is an explicit heuristic. Neither a high field score nor a recent entry overrides missing evidence. The inspector displays a selected entry and its shared words locally; it does not upload or store an inspection query.

## Independent recheck

Download JSON from the app, write a question into a local UTF-8 text file, and run:

```bash
python3 tools/verify_retrieval.py inward-remembrance-state.json < question.txt
```

The standard-library Python verifier reads a v1 export of at most 256 KB, checks the history shape and limits, and prints the status, selected zero-based entry index if any, shared words, counts of one-word and eligible matches, and an exact fractional score. It does not print remembered text or write files. The browser and verifier have separate implementations of the rule. `node tests/state.test.cjs` compares their decisions on synthetic supported, ambiguous, unsupported, repeated-word, and Unicode cases. `python3 tools/challenge_retrieval.py` runs a labeled, deliberately small challenge set of sparse-overlap traps and explicit matches; it checks this rule on those cases, not general-world retrieval accuracy.

The export is ordinary local JSON. Anyone able to edit it can change the apparent history. Agreement between two implementations checks this decision rule on supplied data; it is not a proof of authorship, chronology, factual truth, privacy of the exported file, or general intelligence. Keep exports containing private entries under your control.
