#!/usr/bin/env bash
#
# Deploy AgosStream to Stellar Testnet (or Mainnet) with the Stellar CLI.
#
# Prereqs:
#   - Rust 1.89.0 + wasm32v1-none target
#   - Stellar CLI >= v27   (stellar --version)
#
# Usage:
#   IDENTITY=agos-hub ./scripts/deploy.sh                 # testnet
#   NETWORK=mainnet IDENTITY=prod ./scripts/deploy.sh
#
# The streamed token defaults to the native XLM Stellar Asset Contract.
set -euo pipefail

NETWORK="${NETWORK:-testnet}"
IDENTITY="${IDENTITY:-agos-hub}"
# Native XLM SAC ids are deterministic per network.
XLM_SAC_TESTNET="CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC"
TOKEN="${TOKEN:-$XLM_SAC_TESTNET}"
WASM="target/wasm32v1-none/release/agos_stream.wasm"

cd "$(dirname "$0")/.."

echo "Network: $NETWORK   Identity: $IDENTITY   Token: $TOKEN"

ADMIN_ADDR="$(stellar keys address "$IDENTITY")"
echo "Admin (payer) address: $ADMIN_ADDR"

echo "Building contract..."
stellar contract build
stellar contract optimize --wasm "$WASM" || true

echo "Deploying..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM" \
  --source "$IDENTITY" \
  --network "$NETWORK")
echo "Contract id: $CONTRACT_ID"

echo "Initializing (admin=$ADMIN_ADDR, token=$TOKEN)..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$IDENTITY" \
  --network "$NETWORK" \
  -- initialize --admin "$ADMIN_ADDR" --token "$TOKEN"

echo ""
echo "Done. Add to your app env (.env.local / Vercel):"
echo "   SOROBAN_STREAM_CONTRACT_ID=$CONTRACT_ID"
echo "   NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID=$CONTRACT_ID"
echo "   XLM_SAC_CONTRACT_ID=$TOKEN"
echo "   SOROBAN_RPC_URL=https://soroban-${NETWORK}.stellar.org"
