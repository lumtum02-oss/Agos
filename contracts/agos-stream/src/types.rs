use soroban_sdk::{contracttype, Address};

/// Lifecycle of a stream. Created `Active`; becomes `Completed` once the
/// recipient has withdrawn the entire deposit, or `Stopped` if the payer
/// halts it early (vested portion settled to the recipient, the unvested
/// remainder reclaimed by the payer).
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum StreamStatus {
    Active = 0,
    Completed = 1,
    Stopped = 2,
}

/// A single linear-vesting salary/grant stream. The contract custodies
/// `total_amount - withdrawn_amount` of `token` until it is fully withdrawn
/// or stopped. Vesting is computed purely from on-chain ledger time, so the
/// amount available is always trustlessly derivable with no off-chain timer.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Stream {
    /// Funder; the only address allowed to stop the stream and reclaim the
    /// unvested remainder.
    pub payer: Address,
    /// Beneficiary; every withdrawal is paid to exactly this address.
    pub recipient: Address,
    /// Stellar Asset Contract (SAC) address of the streamed asset (XLM SAC).
    pub token: Address,
    /// Total deposit locked at creation, in the token's raw units (stroops for
    /// the native XLM SAC = 7 decimals).
    pub total_amount: i128,
    /// Cumulative amount already paid out to the recipient.
    pub withdrawn_amount: i128,
    /// Ledger unix timestamp (seconds) when vesting begins.
    pub start_time: u64,
    /// Ledger unix timestamp (seconds) when the stream is fully vested.
    pub end_time: u64,
    pub status: StreamStatus,
}
