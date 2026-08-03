# AgosStream — Soroban linear-vesting salary stream

The trust-minimized on-chain core of **Agos**. A payer locks a full salary /
grant into the contract with a `start_time → end_time` schedule; the recipient
withdraws the amount that has **linearly vested** so far, computed on-chain from
ledger time. The payer can stop a stream early — the vested portion settles to
the recipient and the unvested remainder is reclaimed. Funds are never stuck and
no off-chain timer is trusted.

Deployed on Stellar **Testnet**: `CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D`
([explorer](https://stellar.expert/explorer/testnet/contract/CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D)).
Streamed token: native **XLM** SAC (no trustline).

## Entrypoints

| Method | Auth | Effect |
|---|---|---|
| `initialize(admin, token)` | once | Sets admin + streamed token (XLM SAC), unpauses |
| `create_stream(payer, recipient, total_amount, start_time, end_time) -> u64` | payer | Pulls `total_amount` from payer into escrow, opens a stream |
| `withdraw(stream_id) -> i128` | none* | Pays `vested - withdrawn` to the stream's fixed recipient |
| `stop(stream_id) -> i128` | payer | Settles vested to recipient, reclaims remainder to payer |
| `vested_amount / withdrawable / get_stream` | view | On-chain vesting reads (no fee) |
| `pause / unpause / set_admin / upgrade` | admin | Operational controls |

\* `withdraw` is intentionally permissionless: funds can only ever go to the
recipient address baked into the stream, so anyone may poke it (e.g. the hub
relays it for the recipient) without a theft vector.

## Vesting

```
vested(now) = 0                                   if now <= start
            = total                               if now >= end
            = total * (now - start) / (end - start)   otherwise
```

## Build / test / deploy

```bash
make test       # cargo test — 10 tests, all pass
make build      # stellar contract build -> wasm32v1-none
make optimize   # optimized wasm
IDENTITY=agos-hub ./scripts/deploy.sh   # deploy + initialize on testnet
```

Toolchain: Rust `1.89.0` (`wasm32v1-none`), `soroban-sdk` 22, Stellar CLI v27.
See `DEPLOYMENT.md` for the live ids and app env wiring. A reference TypeScript
client lives in `ts-client/` (the app's production client is
`src/server/stellar/soroban.ts`).
