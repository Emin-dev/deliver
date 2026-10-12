# First use: measured checks and remaining unknowns

Open the [Deliver demo](https://project-e257o.vercel.app/). Keep **Requirement set** on **HD review copy · v1**.

These expectations come from the [pinned source](https://github.com/Emin-dev/deliver/blob/c8cc16de87fdfa469eabbc7f22f855635e69c340/README.md) and tests, not a new browser run. This guide does not verify which commit the live demo currently serves.

## Try it

1. Choose **Try a sample** and wait for the result. The input is `web/assets/sample.mp4`, a generated silent clip.
2. On a browser that decodes the sample's metadata, expect **1920 × 1080**, **6 Passed**, **0 Needs work**, and **5 Unknown**. Inspect the unknowns as well as the passes.
3. Leave human QC you have not performed as **Not reviewed**. A silent clip cannot establish audio intelligibility. Enter “Synthetic exercise: technical unknowns still need review.” in **Handoff notes**.
4. Choose **Export JSON report** and keep the downloaded file.
5. Change **Requirement set** to **Vertical social · v1**. With the same decoded sample, expect **2 Needs work**. Human QC resets to **Not reviewed**, and **Handoff notes** clears because the requirements changed. You can export a second report to compare the policies.

## Read the report

The first report should contain `policy.version: 1`, `unknown: 5`, `final_delivery_approval: "not_certified"`, the selected-byte fingerprint, the policy snapshot and your notes. It records evidence, not final delivery approval.

If metadata cannot be decoded, additional checks legitimately remain **Unknown**. Do not substitute known fixture specifications for browser observations.

Presets are illustrative, not official platform specifications. Codec, frame rate, HDR/color, loudness and subtitle completeness remain unknown. This tool does not encode, upload or verify received bytes. Physical phones, Safari and Firefox are not established by this guide. Export before reloading, and review filenames and notes before sharing.

## Source and verification

- [Browser assertions](https://github.com/Emin-dev/deliver/blob/c8cc16de87fdfa469eabbc7f22f855635e69c340/tests/browser.mjs)
- [UI labels and presets](https://github.com/Emin-dev/deliver/blob/c8cc16de87fdfa469eabbc7f22f855635e69c340/web/index.html)
- [Report construction](https://github.com/Emin-dev/deliver/blob/c8cc16de87fdfa469eabbc7f22f855635e69c340/web/app.js)
- [Recorded verification and limits](../README.md)
