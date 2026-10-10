#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v cargo >/dev/null || ! command -v rustc >/dev/null; then
  printf '%s\n' 'Rust is required to rebuild the WASM engine. Install Rust 1.99.0 with the wasm32-unknown-unknown target, add cargo/rustc to PATH, then rerun npm run build:wasm. See README.md. The prebuilt web/ bundle can be validated without Rust using npm run build.' >&2
  exit 1
fi
version="$(rustc --version)"
if [[ "$version" != 'rustc 1.99.0 '* ]]; then
  printf 'Expected Rust 1.99.0 (rust-toolchain.toml); found %s. Install the pinned toolchain and WASM target as described in README.md.\n' "$version" >&2
  exit 1
fi
# Keep distributed diagnostics reproducible without embedding local build/cache paths.
RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$PWD=. --remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=cargo-cache --remap-path-prefix=${RUSTUP_HOME:-$HOME/.rustup}=rust-toolchain" \
  cargo build --locked --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/deliver_core.wasm web/assets/deliver_core.wasm
node scripts/static-smoke.mjs
printf 'Built and validated web/assets/deliver_core.wasm\n'
