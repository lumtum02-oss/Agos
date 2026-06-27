#![no_std]
//! # Agos Stream
//!
//! A Soroban smart contract that escrows an asset into a **linear-vesting
//! salary / grant stream**.
//!
//! It is the trust-minimized, on-chain core of Agos: instead of a backend
//! custodying salary funds and running an off-chain timer, the payer locks the
//! full grant *in the contract* with a `start_time`/`end_time` schedule, and the
//! recipient pulls the amount that has linearly vested so far. Vesting is
//! computed entirely from `env.ledger().timestamp()` on every read/withdraw, so
//! there is **no server cron and nothing to trust** — the chain itself is the clock.
//!
//! ## Features
//! - **Token escrow via the Stellar Asset Contract (SAC)** — real XLM custody.
//! - **Linear vesting from ledger time** — `vested = total * (now-start)/(end-start)`,
//!   clamped to `[0, total]`. Computed on read, never written by a timer.
//! - **Pull-based withdrawal** — the recipient withdraws `vested - withdrawn` at
//!   any time; funds are always paid to the stream's fixed `recipient` address.
//! - **Stop & reclaim** — the payer can halt a stream: the vested-so-far portion
//!   is settled to the recipient and the unvested remainder is returned to the
//!   payer. Funds are never stuck.
//! - **Authorization** — `require_auth` on the payer (create / stop);
//!   contract-as-custodian pays out from its own address.
//! - **Events** — `init`, `create`, `withdraw`, `stop` for indexers.
//! - **Pausable admin + upgradeable Wasm** — operational safety for mainnet.
//! - **Storage TTL management** — instance and stream entries are bumped so a
//!   long salary schedule never expires out from under a pending withdrawal.

mod error;
mod storage;
mod types;

#[cfg(test)]
mod test;

use error::Error;
use storage::{
    DataKey, INSTANCE_BUMP_AMOUNT, INSTANCE_LIFETIME_THRESHOLD, STREAM_BUMP_AMOUNT,
    STREAM_LIFETIME_THRESHOLD,
};
use types::{Stream, StreamStatus};

use soroban_sdk::{contract, contractimpl, symbol_short, token, Address, Env};

#[contract]
pub struct AgosStream;

#[contractimpl]
impl AgosStream {
    /// One-time setup. Records the admin and the streamed token (XLM SAC) and
    /// unpauses the contract.
    pub fn initialize(env: Env, admin: Address, token: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::Paused, &false);
        env.storage().instance().set(&DataKey::Counter, &0u64);
        bump_instance(&env);
        env.events().publish((symbol_short!("init"),), (admin, token));
        Ok(())
    }

    /// Lock `total_amount` of the configured token into a new stream and return
    /// its id. Vesting runs linearly from `start_time` to `end_time`.
    ///
    /// Auth: requires the payer's signature. The same authorization covers the
    /// inner SAC `transfer(payer -> contract)`.
    pub fn create_stream(
        env: Env,
        payer: Address,
        recipient: Address,
        total_amount: i128,
        start_time: u64,
        end_time: u64,
    ) -> Result<u64, Error> {
        payer.require_auth();
        require_not_paused(&env)?;

        if total_amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        if end_time <= start_time {
            return Err(Error::InvalidSchedule);
        }

        let token = token_addr(&env)?;

        // Pull the deposit into the contract's custody.
        token::Client::new(&env, &token).transfer(
            &payer,
            &env.current_contract_address(),
            &total_amount,
        );

        let id = next_id(&env);
        let stream = Stream {
            payer: payer.clone(),
            recipient: recipient.clone(),
            token,
            total_amount,
            withdrawn_amount: 0,
            start_time,
            end_time,
            status: StreamStatus::Active,
        };
        save_stream(&env, id, &stream);
        bump_instance(&env);

        env.events().publish(
            (symbol_short!("create"), id),
            (payer, recipient, total_amount, start_time, end_time),
        );
        Ok(id)
    }

    /// Withdraw everything that has vested but not yet been paid out. Funds are
    /// always sent to the stream's fixed `recipient`, so this is intentionally
    /// permissionless (anyone may poke it; nobody but the recipient can be paid).
    /// Returns the amount transferred.
    pub fn withdraw(env: Env, stream_id: u64) -> Result<i128, Error> {
        let mut stream = load_stream(&env, stream_id)?;
        if stream.status != StreamStatus::Active {
            return Err(Error::StreamNotActive);
        }

        let vested = vested_of(&env, &stream);
        let amount = vested - stream.withdrawn_amount;
        if amount <= 0 {
            return Err(Error::NothingToWithdraw);
        }

        token::Client::new(&env, &stream.token).transfer(
            &env.current_contract_address(),
            &stream.recipient,
            &amount,
        );

        stream.withdrawn_amount += amount;
        if stream.withdrawn_amount >= stream.total_amount {
            stream.status = StreamStatus::Completed;
        }
        save_stream(&env, stream_id, &stream);
        bump_instance(&env);

        env.events()
            .publish((symbol_short!("withdraw"), stream_id), (stream.recipient.clone(), amount));
        Ok(amount)
    }

    /// Stop a stream early. The payer settles whatever has vested so far to the
    /// recipient and reclaims the unvested remainder. Returns the reclaimed
    /// amount.
    ///
    /// Auth: requires the payer's signature.
    pub fn stop(env: Env, stream_id: u64) -> Result<i128, Error> {
        let mut stream = load_stream(&env, stream_id)?;
        stream.payer.require_auth();
        if stream.status != StreamStatus::Active {
            return Err(Error::StreamNotActive);
        }

        let token_client = token::Client::new(&env, &stream.token);
        let vested = vested_of(&env, &stream);

        // 1. Settle the vested-but-unwithdrawn portion to the recipient.
        let owed = vested - stream.withdrawn_amount;
        if owed > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.recipient, &owed);
            stream.withdrawn_amount += owed;
        }

        // 2. Return the unvested remainder to the payer.
        let reclaim = stream.total_amount - stream.withdrawn_amount;
        if reclaim > 0 {
            token_client.transfer(&env.current_contract_address(), &stream.payer, &reclaim);
        }

        stream.status = StreamStatus::Stopped;
        save_stream(&env, stream_id, &stream);
        bump_instance(&env);

        env.events().publish(
            (symbol_short!("stop"), stream_id),
            (stream.payer.clone(), owed, reclaim),
        );
        Ok(reclaim)
    }

    // --- Views -------------------------------------------------------------

    pub fn get_stream(env: Env, stream_id: u64) -> Result<Stream, Error> {
        load_stream(&env, stream_id)
    }

    /// Total amount vested so far for a stream (independent of withdrawals).
    pub fn vested_amount(env: Env, stream_id: u64) -> Result<i128, Error> {
        let stream = load_stream(&env, stream_id)?;
        Ok(vested_of(&env, &stream))
    }

    /// Amount the recipient could withdraw right now (`vested - withdrawn`).
    pub fn withdrawable(env: Env, stream_id: u64) -> Result<i128, Error> {
        let stream = load_stream(&env, stream_id)?;
        let amt = vested_of(&env, &stream) - stream.withdrawn_amount;
        Ok(if amt > 0 { amt } else { 0 })
    }

    pub fn total_streams(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::Counter).unwrap_or(0u64)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    pub fn get_admin(env: Env) -> Result<Address, Error> {
        env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
    }

    pub fn get_token(env: Env) -> Result<Address, Error> {
        token_addr(&env)
    }

    // --- Admin -------------------------------------------------------------

    pub fn pause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
        bump_instance(&env);
        env.events().publish((symbol_short!("pause"),), true);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance(&env);
        env.events().publish((symbol_short!("pause"),), false);
        Ok(())
    }

    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        bump_instance(&env);
        Ok(())
    }

    /// Replace the contract's own code (admin-gated). Enables shipping fixes
    /// without migrating stream state — important for a mainnet (L6) deploy.
    pub fn upgrade(env: Env, new_wasm_hash: soroban_sdk::BytesN<32>) -> Result<(), Error> {
        admin(&env)?.require_auth();
        env.deployer().update_current_contract_wasm(new_wasm_hash);
        Ok(())
    }
}

// --- Internal helpers ------------------------------------------------------

fn admin(env: &Env) -> Result<Address, Error> {
    env.storage().instance().get(&DataKey::Admin).ok_or(Error::NotInitialized)
}

fn token_addr(env: &Env) -> Result<Address, Error> {
    env.storage().instance().get(&DataKey::Token).ok_or(Error::NotInitialized)
}

fn require_not_paused(env: &Env) -> Result<(), Error> {
    let paused: bool = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .ok_or(Error::NotInitialized)?;
    if paused {
        return Err(Error::Paused);
    }
    Ok(())
}

fn next_id(env: &Env) -> u64 {
    let current: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0u64);
    let id = current + 1;
    env.storage().instance().set(&DataKey::Counter, &id);
    id
}

fn load_stream(env: &Env, id: u64) -> Result<Stream, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Stream(id))
        .ok_or(Error::StreamNotFound)
}

fn save_stream(env: &Env, id: u64, stream: &Stream) {
    let key = DataKey::Stream(id);
    env.storage().persistent().set(&key, stream);
    env.storage()
        .persistent()
        .extend_ttl(&key, STREAM_LIFETIME_THRESHOLD, STREAM_BUMP_AMOUNT);
}

fn bump_instance(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
}

/// Linear vesting from ledger time, clamped to `[0, total_amount]`:
/// `vested = total * (now - start) / (end - start)`.
fn vested_of(env: &Env, stream: &Stream) -> i128 {
    let now = env.ledger().timestamp();
    if now <= stream.start_time {
        return 0;
    }
    if now >= stream.end_time {
        return stream.total_amount;
    }
    let elapsed = (now - stream.start_time) as i128;
    let duration = (stream.end_time - stream.start_time) as i128;
    // duration > 0 guaranteed at create time; elapsed < duration here.
    stream.total_amount * elapsed / duration
}
