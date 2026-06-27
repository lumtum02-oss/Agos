# Agos Stream — build / test / optimize
# Requires: Rust 1.89.0 (+ wasm32v1-none) and the Stellar CLI (>= v27).

WASM = target/wasm32v1-none/release/agos_stream.wasm

default: build

build:
	stellar contract build
	@ls -lh $(WASM)

# Pure-Rust unit tests (no network, no toolchain beyond cargo).
test:
	cargo test

optimize: build
	stellar contract optimize --wasm $(WASM)

fmt:
	cargo fmt --all

lint:
	cargo clippy --all-targets -- -D warnings

clean:
	cargo clean

.PHONY: default build test optimize fmt lint clean
