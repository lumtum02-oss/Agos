use soroban_sdk::contracterror;

/// All failure modes are explicit, contiguous `u32` codes so the TypeScript
/// client can map them to user-facing messages without guessing.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Paused = 3,
    InvalidAmount = 4,
    InvalidSchedule = 5,
    StreamNotFound = 6,
    StreamNotActive = 7,
    NothingToWithdraw = 8,
    NothingToReclaim = 9,
}
