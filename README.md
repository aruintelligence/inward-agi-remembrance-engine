# Inward AGI™ · Remembrance Engine™ v11.0

**A single-file, browser-native symbolic remembrance instrument.**

[![Release](https://img.shields.io/github/v/release/aruintelligence/inward-agi-remembrance-engine?style=for-the-badge)](https://github.com/aruintelligence/inward-agi-remembrance-engine/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-16a34a?style=for-the-badge)](LICENSE)
[![Research status](https://img.shields.io/badge/Status-Experimental-f59e0b?style=for-the-badge)](#research-scope)
[![No backend](https://img.shields.io/badge/Runtime-Client--side-0ea5e9?style=for-the-badge)](#implementation)

> **Research scope:** This is an experimental visualization and contemplative software instrument. “AGI,” “memory field,” “coherence,” and “Guardian Veto” are architectural or symbolic terms in this prototype—not evidence of consciousness, autonomous agency, scientific validation, or general intelligence.

## What it is

The Remembrance Engine packages a visual field, a structured browser-local memory ledger, retrieval traces, and threshold-based response behavior into one inspectable HTML file.

It explores a memory-first design question:

> What does an interface feel like when remembered input and visible state continuity are treated as central primitives?

## Implemented behavior

- Browser-local remembrance events that survive reload when storage is available
- A deduplicated memory ledger
- An evidence-aware lexical recall rule that abstains on unrelated or equally supported memories
- A local Recall evidence lab that shows matching words without saving inspection queries
- Visual traces for input, retrieval, and veto states
- A stochastic reaction-diffusion-style field with saturation
- A modeled coherence value derived from internal field state
- Threshold-based contraction called Guardian Veto™
- Client-side operation with no application backend
- JSON export and local erasure controls for saved entries and the field snapshot
- Reviewed JSON restore with complete v1 validation, visible incoming entries, and stale-state protection

These are implemented software behaviors inside the prototype. They are not validated measures of a user’s cognition, wellbeing, spirituality, or identity.

## Run locally

Download [`inward-agi-remembrance-engine-v11.html`](./inward-agi-remembrance-engine-v11.html), then open it in a modern browser.

Or clone the repository:

```bash
git clone https://github.com/aruintelligence/inward-agi-remembrance-engine.git
cd inward-agi-remembrance-engine
open inward-agi-remembrance-engine-v11.html
```

On Windows, double-click the HTML file. Some externally hosted visual dependencies may require a network connection on first load.

## Saved state and inspection

Each interaction saves up to 40 entered remembrance events, the three visible retrieval-ledger labels, and a 720-value field snapshot to this browser's `localStorage`. On reload, the memory and snapshot are restored before the simulation resumes. The chat transcript and animation frames are not saved. If browser storage is blocked or unavailable, the session still works and a JSON copy can still be downloaded. File URL storage behavior varies by browser.

Use **Download JSON** to keep a snapshot, including your entered text. To move it to another browser, choose that file under **Move your memory to this browser**, select **Review selected JSON**, inspect the incoming entries and current-memory count, then choose **Replace local state with this file**. Review makes no changes. Restore replaces this app's local memory, retrieval labels, and field snapshot, then reloads. Download the current browser's state before replacing it if you want to retain both copies. **Erase local state** removes only this app's saved key after confirmation.

The importer accepts only complete v1 exports within 256 KB and the app's documented limits: at most 40 memories, three labels, and exactly 720 finite field values. It refuses malformed or clipped files without a partial restore. A new interaction or a changed saved snapshot in another tab invalidates the review. If browser storage cannot be written, restore refuses to proceed. The app does not upload the selected file or entered text; the Tailwind CDN and Google Fonts are external visual dependencies, and browser extensions or other device users may affect local privacy. The JSON file is editable and unencrypted: reviewing it does not prove who created its contents or make it safe to share.

The modeled coherence score starts near 0.999 on a flat, empty field because it is calculated from low spatial variance. That initial value is not earned by memory or evidence of cognition. A submitted input changes the field before the threshold response rule evaluates the new score.

Run the local regression suite with Node.js and Python 3 available:

```bash
node tests/state.test.cjs
```

It covers reload and retrieval, unsupported and ambiguous recall, independent Python verification, the initial empty-state label, response gating, malformed and blocked storage, export, reviewed restore, stale review, failed write, and erasure. [The retrieval protocol](RETRIEVAL_PROTOCOL.md) states the exact rule and shows how to recheck an exported state without importing browser code.

## Conceptual vocabulary

The prototype draws on the Inward Physics™ research program:

- **Remembrance** — persisted input and retrieved state within the instrument
- **Orientation of Presence** — a modeled directional bias
- **Guardian Veto™** — a threshold rule that contracts simulated activity
- **Coherence** — an internal model variable, not a clinical or scientific measurement

## Implementation

- Single HTML file
- Vanilla JavaScript and Canvas
- Browser-local persistence
- No LLM, training pipeline, or server-side model
- Designed for inspection and experimentation rather than production deployment

## Known limitations

- Browser behavior and storage limits vary
- The dynamics are defined by the implementation rather than independently validated
- Retrieval uses exact normalized word overlap. It can miss paraphrases and should not be interpreted as evidence that a recalled statement is true
- The interface should not be used for consequential medical, psychological, legal, financial, or spiritual decisions
- The repository does not establish comparative “first” claims about the broader AI field

## Related work

- [ĀRU Intelligence public profile](https://github.com/aruintelligence)
- [ĀRU Remembrance Field](https://github.com/aruintelligence/aru-remembrance-field)
- [Inward Mathematics Simulator](https://github.com/aruintelligence/inward-mathematics-simulator)
- [Divine Whisper Ecosystem](https://github.com/aruintelligence/divine-whisper-ecosystem)

## Citation

Citation metadata is provided in [`CITATION.cff`](CITATION.cff).

## License

Released under the [MIT License](LICENSE). Inward AGI™, Remembrance Engine™, Guardian Veto™, and Inward Physics™ may be claimed marks of ĀRU Intelligence Inc.
