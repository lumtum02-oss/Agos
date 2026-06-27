# AgosStream — Testnet Deployment

| Field | Value |
|---|---|
| Contract | **AgosStream** (linear-vesting salary/grant stream) |
| Network | Stellar **Testnet** |
| Contract ID | `CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D` |
| Admin / payer | `GBL5RJKF4QNJ4ZPLJZ7PS7K5A4J44VEZJRV2CRTFFDRVSY2N76AIIE47` |
| Streamed token | Native **XLM** SAC `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Build | `cargo 1.89.0`, target `wasm32v1-none`, optimized (13,167 bytes) |
| Stellar CLI | v27.0.0 |

Explorer: https://stellar.expert/explorer/testnet/contract/CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D

## Reproduce

```bash
cd contracts
make test                 # 10 unit tests, all pass
stellar contract build    # -> target/wasm32v1-none/release/agos_stream.wasm
stellar contract optimize --wasm target/wasm32v1-none/release/agos_stream.wasm
IDENTITY=agos-hub ./scripts/deploy.sh   # deploy + initialize on testnet
```

## App wiring (env)

```
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
SOROBAN_STREAM_CONTRACT_ID=CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D
NEXT_PUBLIC_SOROBAN_STREAM_CONTRACT_ID=CDMSQ2YYSDBUUJNEF5SBZZLBY5QT52XAJVUBVGU4WILJ3VKD2KW4EL7D
XLM_SAC_CONTRACT_ID=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

The server invokes the contract with the hub key (= admin = payer) from
`src/server/stellar/soroban.ts`. XLM streams are funded into and settled by the
contract; vesting is computed on-chain from ledger time (no server timer).
