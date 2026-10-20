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

- Browser-local remembrance events that survive reload when storage is available, with an optional encrypted vault and passphrase rotation
- A deduplicated memory ledger
- An evidence-aware lexical recall rule that requires two distinct shared substantive words in one earlier entry and abstains on sparse or equally supported memories
- A local Recall evidence lab that shows matching words without saving inspection queries
- A reviewed control for removing an individual saved memory
- A visible 40-memory capacity guard that preserves a new draft instead of silently discarding the oldest memory
- Visual traces for input, retrieval, and veto states
- A stochastic reaction-diffusion-style field with saturation
- A modeled coherence value derived from internal field state
- Threshold-based contraction called Guardian Veto™
- Client-side operation with no application backend
- Unencrypted JSON export, optional passphrase-encrypted portable copy, and local erasure controls
- Reviewed JSON restore with complete v1 validation, visible incoming entries, and stale-state protection
- A selective merge that shows current and incoming sources, detects exact duplicates, and blocks over-capacity plans
- Bundled styles and a restrictive Content Security Policy; the app loads no remote runtime assets

These are implemented software behaviors inside the prototype. They are not validated measures of a user’s cognition, wellbeing, spirituality, or identity.

## Run locally

Download [`inward-agi-remembrance-engine-v11.html`](./inward-agi-remembrance-engine-v11.html), then open it in a modern browser.

Or clone the repository:

```bash
git clone https://github.com/aruintelligence/inward-agi-remembrance-engine.git
cd inward-agi-remembrance-engine
open inward-agi-remembrance-engine-v11.html
```

On Windows, double-click the HTML file. The committed HTML includes its styles and scripts, so it can open without a network connection. Web Crypto availability for encrypted transfers and the vault depends on the browser's secure-context rules for local files. If your browser disables it for `file:` pages, serve the directory locally with `python3 -m http.server 8000` and open `http://localhost:8000/inward-agi-remembrance-engine-v11.html`.

## Saved state and inspection

Each interaction saves up to 40 entered remembrance events, the three visible retrieval-ledger labels, and a 720-value field snapshot to this browser's `localStorage`. On reload, unencrypted state is restored before the simulation resumes; a vault stays locked until its passphrase is entered. The chat transcript and animation frames are not saved. If storage is unavailable on a fresh session, interaction still works and a JSON copy can be downloaded. An existing vault cannot be opened until its saved value is accessible. File URL storage behavior varies by browser.

Use **Download unencrypted JSON** to keep a readable snapshot, including your entered text. For a portable copy protected by a passphrase, enter and confirm a unique passphrase of 16–1024 characters and choose **Download encrypted JSON**. Keep the passphrase separately: this app cannot recover it. The passphrase fields are cleared after each attempt. A downloaded copy is separate from this browser's saved state.

To encrypt this browser's future saves, first keep an encrypted download elsewhere, then use **Encrypt browser state** with a long, unique vault passphrase. This opt-in step atomically replaces this app's plaintext `localStorage` value with an authenticated encrypted envelope. **Lock browser vault** waits for pending saves, clears the app's loaded memory, and requires the passphrase on the next unlock or reload. A wrong passphrase or damaged vault is never replaced with a plaintext save. A saved value changed by another tab is preserved instead of silently overwritten. You can still choose an explicitly labeled unencrypted download while unlocked. If the passphrase is lost, the app cannot recover the vault; **Erase this browser's vault** deletes its saved value after confirmation. Earlier unencrypted downloads and device backups are unaffected by enabling the vault.

To change the current browser vault passphrase while it is unlocked, open **Change browser vault passphrase**, enter the current passphrase and a different new one twice, then choose **Change vault passphrase**. The app waits for pending encrypted saves, checks the current passphrase against the saved vault, and replaces that complete encrypted value with a new salt, key, and IV in one browser storage write. A wrong current passphrase, blocked write, or changed saved value leaves the earlier vault intact. After success, the old passphrase cannot open this browser's new saved value; other open tabs must unlock the changed vault. Previously downloaded copies and device backups remain separate and may still require the old passphrase. Keep a new encrypted backup after rotating.

To move either file to another browser, choose it under **Move your memory to this browser**, enter the passphrase if encrypted, select **Review selected JSON**, inspect the incoming entries and current-memory count, then choose **Replace local state with this file**. Review makes no changes. Restore replaces this app's local memory, retrieval labels, and field snapshot, then reloads. Download the current browser's state before replacing it if you want to retain both copies. **Erase local state** removes only this app's saved key after confirmation. The app waits for a pending encrypted save, checks that the saved value still matches this session, removes the key, and checks that the key is absent before reloading. A blocked or ineffective deletion stays on the page and reports that erasure was not confirmed. If another tab changed the saved value, reload and review it before trying again. This check is limited to this browser's app key; downloaded files, other open tabs, and device backups can retain copies.

To combine memory histories instead, use **Select current**, **Select incoming**, or the checkboxes, then **Merge selected memories**. The page lists every distinct text-and-timestamp pair with its source. An exact pair in both copies appears once; the same text with a different timestamp remains a separate event. A plan above 40 selected memories cannot be saved, and unchecked events are counted as excluded. Merge keeps the current browser's field and retrieval labels as captured when you reviewed the file; it adds only the selected history entries, sorted by their recorded timestamps. Those timestamps are editable and depend on device clocks, so the order is a display convention, not proof of when an event happened. The import file and existing browser state remain untouched until the final save. A successful save reloads the app; it does not create an undo copy, so download your current state before committing if you may need it later.

To remove one entry, open **Review and remove saved memories**, select its **Review removal** button, read the exact text, then choose **Remove this saved entry**. The app refuses a stale review or a failed storage write; the in-memory session is not changed until the new complete snapshot is saved. It removes that entry, clears any matching retrieval label, resets the visual field, and clears the old chat and inspection panel while preserving an unsent draft. If the browser vault is active, the replacement snapshot remains encrypted with a fresh IV. This has no undo. Download a backup first if you may need the entry later. Other open tabs, previously downloaded files, browser history, and device backups can retain copies; reload other tabs before relying on their displayed history.

The page warns when five or fewer of its 40 memory spaces remain. When all 40 are in use, **Send to Remembrance** refuses a new entry without changing the saved state, field, chat, or text in the input. Choose **Manage memories** beside the composer, review and remove an entry, then submit the waiting draft. This cap also applies inside an unlocked vault. The app does not silently evict an older memory.

The importer accepts complete v1 state exports within 256 KB, directly or inside an encrypted envelope of at most 512 KB, and the app's documented limits: at most 40 memories, three labels, and exactly 720 finite field values. It refuses malformed or clipped files without a partial restore. A new interaction or a changed saved snapshot in another tab invalidates the review, including during decryption. If browser storage cannot be written, restore refuses to proceed. When the vault is unlocked, an approved replacement or merge is saved as encrypted browser state. The app does not upload the selected file or entered text and does not load remote scripts, fonts, or styles. Browser extensions or other device users may affect local privacy. Review does not prove who created a file or whether its contents are true.

Encrypted exports use the `aru-remembrance-encrypted-v1` envelope. It records the format, 600,000 PBKDF2-HMAC-SHA-256 iterations, a random 16-byte salt, a random 12-byte IV, and AES-256-GCM ciphertext with a 128-bit authentication tag. The format string is authenticated as associated data. A new salt and IV are generated for every export; decryption rejects a wrong passphrase or modified ciphertext before showing any review. The envelope metadata and file size remain visible. A weak or reused passphrase is vulnerable to offline guessing by anyone who obtains the file. This is a portable-copy protection feature, not a claim of verified sender identity or whole-device encryption.

The browser vault uses the distinct `aru-remembrance-vault-v1` format with the same cryptographic primitives. It derives a non-extractable session key on unlock, reuses its salt and key for that session, and generates a fresh random IV for every encrypted save. The passphrase is not stored in the saved value. The vault protects the browser's saved value while locked; it cannot protect an unlocked page, browser extensions, malware, a compromised browser, or copies already made by the operating system. JavaScript encryption is asynchronous: wait until the storage status says the encrypted save finished before closing the page. A browser or device killed without a normal unload can lose the latest unsaved change. Keep a separate encrypted export for recovery.

The modeled coherence score starts near 0.999 on a flat, empty field because it is calculated from low spatial variance. That initial value is not earned by memory or evidence of cognition. A submitted input changes the field before the threshold response rule evaluates the new score.

Run the local regression suite with Node.js 22 and Python 3 available:

```bash
node tests/state.test.cjs
```

It covers reload and retrieval, sparse and ambiguous recall, independent Python verification, the initial empty-state label, response gating, malformed and blocked storage, both export formats, vault migration, locking and passphrase rotation, independent decryption, wrong passphrases, tampering, encrypted restore and merge, reviewed individual removal, full-capacity input refusal, deduplication, stale review, failed write, and confirmed or refused erasure. [The retrieval protocol](RETRIEVAL_PROTOCOL.md) states the exact rule and shows how to recheck an unencrypted exported state without importing browser code. Run `python3 tools/challenge_retrieval.py` to check the labeled sparse-overlap and positive examples; the challenge set does not measure performance on real user questions.

To rebuild the committed stylesheet after editing classes, install the pinned build dependency and check the result:

```bash
npm ci --ignore-scripts
npm run build:styles
npm test
```

The build uses Tailwind only at development time. CI repeats the build and fails if the generated HTML differs from the committed file.

The browser regression opens the committed HTML on a local server in headless Chromium. It exercises real Web Crypto and `localStorage`, lock, unlock and passphrase rotation, an encrypted download, reviewed removal in both vault and plaintext modes, full-capacity draft preservation, blocked and successful erasure, and reviewed restore in a separate browser context. To run it locally after `npm ci`:

```bash
npx playwright install --with-deps --only-shell chromium
npm run test:browser
```

CI runs both the Node suite and this browser test. The browser test rejects unexpected remote requests and uncaught page errors.

## Conceptual vocabulary

The prototype draws on the Inward Physics™ research program:

- **Remembrance** — persisted input and retrieved state within the instrument
- **Orientation of Presence** — a modeled directional bias
- **Guardian Veto™** — a threshold rule that contracts simulated activity
- **Coherence** — an internal model variable, not a clinical or scientific measurement

## Implementation

- Single HTML runtime file with bundled CSS and JavaScript
- Vanilla JavaScript and Canvas
- Browser-local persistence
- No LLM, training pipeline, or server-side model
- Designed for inspection and experimentation rather than production deployment

## Known limitations

- Browser behavior and storage limits vary
- The dynamics are defined by the implementation rather than independently validated
- Retrieval uses exact normalized word overlap and requires two distinct shared substantive words in one entry. It withholds single-word questions and can miss paraphrases. Even two shared words can be coincidental; a quote is not evidence that the statement is true
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
