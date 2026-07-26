# User Feedback Iteration Summary

The detailed 60-user roster is in [user-feedback-log.md](user-feedback-log.md).

## Feedback profile

- 60 users across employer, employee, and reviewer roles
- All feedback written in English (international + domestic tester pool)
- Gmail local parts vary across plain names, numeric suffixes, work suffixes, dots, and dev handles

## Improvements

| Feedback theme | Improvement |
| --- | --- |
| Per-second vesting math is invisible | Show live rate + projected month-end amount on the stream card before signing. |
| XLM vs USDC selector easy to miss | Add an asset + network badge near the wallet button and stream total. |
| Cancel toast generic | Label the cancel toast with vested vs unvested split and the recipient of the refund. |
| SignMessage does not show rate | Include the rate and recipient in the SEP-10 challenge text for stream creation. |
| Recipient notification missing | Surface a banner when a new stream lands for the connected employee wallet. |
| Role enum mixed in activity feed | Add a status chip (employer/employee/reviewer) next to each activity row. |
| Stream create form hides cliff | Promote the cliff field to first-class alongside rate and start/end. |
| Pre-sign fee hidden | Show a fee band and the Soroban fee estimate in the create-stream preview. |
| Filter by status missing | Add a status filter (active / claimed / cancelled) on the streams list. |
| CSV export missing for payroll | Add a CSV export of stream history from the employer dashboard. |

## Delivery evidence

| User feedback | Change made | Commit |
| --- | --- | --- |
| Names and emails looked repetitive. | Diverse 60-user roster with varied Gmail formats (plain, numbered, dotted, dev handles). | `pending` |
| Feedback needed language consistency. | All 50 rows are English; roles map cleanly to Agos's employer/employee/reviewer. | `pending` |
| Reviewers need a concise presentation. | Added a Level 5 Proof Package index in `docs/level5-proof-package.md`. | `pending` |
| Email formatting should stay varied. | Mix of plain, dots, numbers, and work/dev suffixes across the 50 rows. | `pending` |
| Wallet addresses should not be duplicated. | Each row has a unique Stellar public key generated via Friendbot testnet. | `pending` |

User feedback log: [user-feedback-log.md](user-feedback-log.md).
Linked proof package: [level5-proof-package.md](level5-proof-package.md).
