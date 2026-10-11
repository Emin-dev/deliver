# Deliver

A bounded, local-first technical review desk for a video handoff. The reusable requirements engine is Rust, compiled to WebAssembly. The static UI is plain HTML/CSS with a small JavaScript adapter for browser file, media, download, and Web Crypto APIs. No frontend framework, application server, account, database, analytics, paid service, or runtime dependency.

## Try the demo

[Open the Deliver demo](https://project-e257o.vercel.app/) and choose **Try a sample**. No account or setup is needed; the bundled clip is generated, silent test media.

1. Keep **HD review copy · v1** selected and inspect the measured checks and technical unknowns.
2. Leave any human QC you have not actually performed as **Not reviewed**. A silent sample cannot establish audio intelligibility.
3. Choose **Export JSON report** and inspect it locally. The report includes the policy/version, selected-byte fingerprint and unknowns; it does not certify final delivery.

Work stays in this tab and clears on reload. Export before leaving. To serve the bundle locally or change the code, see [Build and run](#build-and-run).

## Feedback and small fixes

[Search or open an issue](https://github.com/Emin-dev/deliver/issues) with your browser/version, exact steps, expected result and actual result. Use synthetic examples only; do not post client media, full real-world exports, private notes, secrets or security exploit details in public issues.

For a small code or documentation fix, explain the change and include the relevant [build and test](#build-and-run) results, including anything you could not run. Rebuild generated WASM with the documented script when changing the Rust engine, and preserve sample provenance and license notices.

## What works

1. Choose one local MP4/WebM file (or the bundled, generated silent test clip).
2. Select one of three versioned illustrative requirement sets, or enter custom requirements and a version.
3. Check file size, conservative container signature, browser-reported display dimensions, duration, and a SHA-256 fingerprint of the selected bytes. Every rule verdict is computed by the actual Rust/WASM library.
4. Review failures and unknowns. If the browser cannot read media metadata, the dimensions and duration remain unknown; available file/header/hash checks still run.
5. Complete separate self-reported human QC rows and optional notes.
6. Download a JSON evidence record containing the complete policy snapshot and version, the selected-byte digest, measured values, source/limitations of each check, unresolved unknowns, and human QC.

The fixture is **real video**, generated specifically for this demo. Selecting it follows the same inspection path as a local file. Its known source specifications are not injected into the browser's measurements or used to fabricate unsupported checks.

## Honest scope

- This is a **technical-validation demo**, not an encoder, upload service, delivery certification, production QC system, or a substitute for a professional media probe.
- Presets illustrate customer constraints. They are not any platform's official specifications.
- A matching MP4/WebM header is only a signature observation, not complete container or track validation. Filename extension and MIME type are never treated as authoritative.
- Browser display dimensions may include rotation and differ from encoded dimensions. Duration is a browser observation, not a full frame scan. Boundary comparisons are inclusive and use the browser's unrounded observed value. The duration check displays the shortest faithful observed value and limits, so a near-boundary failure is not hidden by decimal rounding.
- Codec, frame rate, HDR/color space, loudness/channels, subtitle completeness, and visual/audible defects remain explicitly unknown. Human QC does not replace those technical unknowns.
- SHA-256 fingerprints the complete selected file. It does not establish origin, approval authenticity, or that a recipient received the same bytes. Reports are unsigned and editable.
- No encoding, external tool invocation, full decode, server job, report upload, message to a customer, or received-byte comparison occurs in the demo.
- Data is session-only: no localStorage, IndexedDB, cookies, analytics, or background sync. A reload clears the review. A downloaded report may contain a filename or private notes, so review it before sharing.
- The UI is responsive. Physical phones, Safari, and Firefox are not yet tested. See the verification status below.

A future owner-run Rust controller could invoke established tools such as FFmpeg/ffprobe and MediaConch, manage job cancellation and limits, recheck encoded output, and connect recipient-byte evidence. None of this future mode is represented as currently running. Standalone product differentiation against existing encoder/policy/QC combinations remains unvalidated.

## Limits and resource handling

- One file per review; non-empty and at most **64 MiB** (67,108,864 bytes).
- Observed and required dimensions: 1–16,384 pixels per axis. Duration observations: greater than 0 and at most 86,400 seconds. Requirements can start at 0 seconds and end at most 86,400 seconds.
- The browser custom-size editor accepts 0.001–64 MiB; the Rust library accepts integer limits from 1 byte to 64 MiB.
- Filename at most 1,024 UTF-8 bytes; policy title at most 160 UTF-8 bytes; ID at most 80 bytes; version positive. The UI bounds custom versions to 999,999.
- Header probe reads at most 64 KiB. EBML parsing is bounded to that header and requires the `webm` DocType; an MP4 probe accepts a conservative allowlist of major brands. Valid but unsupported brands remain unsupported.
- Media metadata has a 15-second timeout. Cancel/removal/new selection aborts `FileReader`, removes the temporary media source, and revokes object URLs.
- Web Crypto digest work cannot itself be canceled; a single digest queue prevents concurrent full-file hash allocations. Aborted queued work is skipped, and generation tokens prevent stale results from taking over a later selection.
- Inspection resets are silent; meaningful loading/metadata/hash/completion messages use a persistent polite status region. Explicit remove/cancel announce that action and restore focus to the chooser. Error recovery also returns focus to the chooser. Runtime assistive-technology behavior still needs browser verification.
- Requirements changes recompute the Rust checks and invalidate human QC. Invalid constraints hide the old result and disable export.
- Engine JSON requests are bounded to 32 KiB. DOM updates use text nodes, not HTML interpolation. Export filenames use only the digest and numeric policy version. Export URLs are revoked after 30 seconds; no more than five pending download URLs are retained.
- CSP restricts assets and requests to the same origin, media to same origin/blob, and disallows objects/forms/framing. No selected file data is transmitted. Loading the demo and its sample necessarily requests public static assets from the host.

## Build and run

### Try the checked-in bundle (no Rust)

From the repository root, with Node.js 20+ and Python 3 installed:

```sh
node scripts/static-smoke.mjs
python3 -m http.server 4174 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:4174` and choose **Try a sample**. This route checks and serves the included WASM; no Rust toolchain or npm installation is required. The local server binds only to loopback. Stop it with Ctrl+C when finished.

### Rebuild the engine

Rebuilding the engine requires the exact Rust **1.99.0** toolchain declared in `rust-toolchain.toml`, with `rustfmt`, `clippy`, and the `wasm32-unknown-unknown` target. Install these using the official rustup toolchain, and put cargo/rustc on PATH. There is no dependency on a sibling tooling directory.

```sh
rustup toolchain install 1.99.0 --profile minimal --component rustfmt --component clippy --target wasm32-unknown-unknown
cargo test --locked
cargo fmt --check
cargo clippy --all-targets -- -D warnings
npm run build:wasm
npm run build
npm test
npm run serve
```

Open `http://localhost:4174`. Production must be served over HTTPS so Web Crypto is available. A prebuilt `web/assets/deliver_core.wasm` is included; a static host only needs the `web` directory. `vercel.json` explicitly sets `framework: null`, uses a Node-only static smoke command, skips dependency installation, and declares the output plus protective response headers. Deployment does not invoke Rust or install test-only Playwright. `npm run build` verifies the prebuilt artifact by actually running its Rust engine and validates the packaged licenses. `npm run build:wasm` rebuilds the artifact from the pinned Rust toolchain, then runs the same static smoke gate. It reports a clear prerequisite error if cargo/rustc are absent. There is no JavaScript rule-engine fallback.

For repeatable browser QA in an environment where Chromium is permitted:

```sh
npm ci
# Start the server above in another terminal.
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
# Or target an authorized deployment:
BASE_URL=https://YOUR-VERIFIED-PREVIEW.example npm run test:browser
```

The browser suite uses Playwright 1.62.1; set `CHROMIUM_PATH` to a supported installed Chromium binary. The app has no npm runtime dependencies. `Cargo.lock` and `package-lock.json` pin test/build dependencies.

## Executed verification

- 14 Rust unit and negative-boundary tests: passed.
- 10 JavaScript container-parser and policy-input tests: passed.
- 9 integration tests executing the actual production WASM binary: passed. Includes malformed input, unknown observations, changed requirements, allocation limits, and 1,000 repeated engine calls with bounded observed WASM memory growth.
- 3 static privacy, security-header, and labeling tests: passed. These checks are not a full security or accessibility audit.
- 7 regression tests: neutral inspection resets; accessible progress; removal/cancellation focus; explicit deployment settings; exact toolchain pin; standalone missing-Rust error; and rejection of a truncated served license bundle. These include exact-source function tests with a minimal DOM stub, not browser or screen-reader execution.
- Node-only deployment smoke: passed, including real WASM execution, complete pinned license packaging, and byte-for-byte served/source notice checks.
- Binary path hygiene: the pinned build remaps project, Cargo-cache, and toolchain paths. The deployment gate rejects machine-specific paths in the shipped WASM. A fresh build from a different directory produced an identical SHA-256 digest.
- Rust formatting and Clippy with warnings denied: passed.
- JavaScript syntax checks: passed.
- `ffprobe` independently verified the fixture's 1920×1080 H.264 stream, 24 fps, 6-second duration, and 14,679-byte file. This is fixture-generation evidence only, not a browser capability claim.
- **Recorded build-environment browser UI suite: not run to completion.** Shell Chromium was blocked by local socket restrictions, including after reviewed escalation; the cloud browser could not reach the executor's local HTTP server. This historical result does not cover the separately hosted demo. The hosted sample/export walkthrough is a smoke check, not a full browser-suite or real-device pass.
- Five independent quality-review passes are outside the build verification recorded here.

`evidence/validation.json` records the actual status and `evidence/source-manifest.sha256` fingerprints the tested sources and public assets. `tests/browser.mjs` specifies 14 end-to-end scenarios, but the existence of this script is not evidence they passed.

## Browser QA acceptance checklist

- Desktop and narrow mobile viewport: no horizontal overflow, readable contrast, file control, form labels, focus outline, error announcements, reduced-motion handling, and touch-sized controls.
- Real sample: six measured/fingerprint checks pass and five technical categories remain unknown; real decoded dimensions/duration and digest match the source.
- Export: exact policy/version, selected-byte SHA-256, unknowns, self-reported human QC, notes, and no fabricated final approval.
- Requirement changes: mismatched dimensions fail, human review resets; invalid custom constraints disable stale export; corrected constraints recover.
- Hostile/mismatched MIME and names: bytes determine conservative container identity; empty, oversized, malformed, and unsupported inputs produce useful errors; filenames remain text.
- Browser-decoder failure: limited report keeps width/height/duration unknown, with explicit warning.
- Cancel, repeated sample click, replacement during sample fetch/hash, and removal: no stale review resurrects, no orphan preview, and no unbounded parallel hashing.
- Reopen the same file after removal, keyboard-only use, native file-picker cancellation, export repeated clicks, back/forward/reload semantics.
- Check a genuine WebM in Chromium, then supported Safari/Firefox and actual phone file-picker/playback/export behavior. Emulation is not physical-device proof.
- Inspect network: only same-origin app/engine/sample assets, no selected-media upload or unexpected third-party requests. Test deployed CSP and headers.

## Provenance and license

All application source and UI were newly authored for this task; no existing user repository source or private data was copied. No repository, original, pin, branch, or deployment was changed by this builder. Rust dependencies are serde and serde_json (their transitive versions are in Cargo.lock). The test-only dependency is Playwright. The media sample was generated locally with the installed FFmpeg from colored rectangles and contains no third-party media, speech, or customer content. See `scripts/generate-sample.sh` and `evidence/sample-probe.json`.

Application source is provided under the MIT license in `LICENSE`. Original license/copyright texts for all 11 pinned Cargo dependencies (including build-time macro crates) are preserved under `third-party/` and assembled verbatim into `THIRD-PARTY-NOTICES.txt`, also served at `web/THIRD-PARTY-NOTICES.txt`. Both upstream alternatives are retained for dual-licensed crates, including the Unicode notice for unicode-ident. The Rust 1.99.0 standard-library notice document is also preserved and served verbatim. `third-party/manifest.json` binds the exact Cargo.lock to original notice hashes; the build smoke gate rejects missing, modified, incomplete, or unserved notices. Dependency licenses remain their own. Public publication is handled separately by the coordinating task.
