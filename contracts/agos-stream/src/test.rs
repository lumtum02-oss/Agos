#![cfg(test)]

use crate::error::Error;
use crate::types::StreamStatus;
use crate::{AgosStream, AgosStreamClient};

use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{Address, Env};

struct Setup<'a> {
    env: Env,
    client: AgosStreamClient<'a>,
    token_client: TokenClient<'a>,
    payer: Address,
    recipient: Address,
}

fn setup<'a>(initial_mint: i128) -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let payer = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Deploy a Stellar Asset Contract to stand in for the native XLM SAC.
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token = sac.address();
    StellarAssetClient::new(&env, &token).mint(&payer, &initial_mint);

    let contract_id = env.register(AgosStream, ());
    let client = AgosStreamClient::new(&env, &contract_id);
    client.initialize(&admin, &token);

    Setup {
        token_client: TokenClient::new(&env, &token),
        env,
        client,
        payer,
        recipient,
    }
}

fn set_now(env: &Env, ts: u64) {
    env.ledger().with_mut(|li| li.timestamp = ts);
}

#[test]
fn create_locks_full_deposit() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &6_000, &1_000, &7_000);

    assert_eq!(id, 1);
    // Payer debited, contract custodies the deposit.
    assert_eq!(s.token_client.balance(&s.payer), 4_000);
    let st = s.client.get_stream(&id);
    assert_eq!(st.total_amount, 6_000);
    assert_eq!(st.withdrawn_amount, 0);
    assert_eq!(st.status, StreamStatus::Active);
    assert_eq!(s.client.total_streams(), 1);
}

#[test]
fn vesting_is_linear_over_time() {
    let s = setup(10_000);
    // stream 6000 over 6000 seconds (1 unit/sec) from t=1000.
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &6_000, &1_000, &7_000);

    // Before start.
    assert_eq!(s.client.vested_amount(&id), 0);
    // 25% through.
    set_now(&s.env, 2_500);
    assert_eq!(s.client.vested_amount(&id), 1_500);
    // Halfway.
    set_now(&s.env, 4_000);
    assert_eq!(s.client.vested_amount(&id), 3_000);
    // Past end clamps to total.
    set_now(&s.env, 9_999);
    assert_eq!(s.client.vested_amount(&id), 6_000);
}

#[test]
fn withdraw_pays_vested_to_recipient() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &6_000, &1_000, &7_000);

    // Halfway: 3000 vested.
    set_now(&s.env, 4_000);
    assert_eq!(s.client.withdrawable(&id), 3_000);
    let paid = s.client.withdraw(&id);
    assert_eq!(paid, 3_000);
    assert_eq!(s.token_client.balance(&s.recipient), 3_000);

    // Nothing new vested immediately after.
    let res = s.client.try_withdraw(&id);
    assert_eq!(res, Err(Ok(Error::NothingToWithdraw)));

    // Later, the rest vests and can be withdrawn; stream completes.
    set_now(&s.env, 8_000);
    let paid2 = s.client.withdraw(&id);
    assert_eq!(paid2, 3_000);
    assert_eq!(s.token_client.balance(&s.recipient), 6_000);
    assert_eq!(s.client.get_stream(&id).status, StreamStatus::Completed);
}

#[test]
fn withdraw_on_completed_is_rejected() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &1_000, &1_000, &2_000);
    set_now(&s.env, 5_000);
    assert_eq!(s.client.withdraw(&id), 1_000);
    let res = s.client.try_withdraw(&id);
    assert_eq!(res, Err(Ok(Error::StreamNotActive)));
}

#[test]
fn stop_settles_vested_and_reclaims_remainder() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &6_000, &1_000, &7_000);

    // Halfway, recipient has not withdrawn anything yet.
    set_now(&s.env, 4_000);
    let payer_before = s.token_client.balance(&s.payer);
    let reclaimed = s.client.stop(&id);

    // 3000 vested settled to recipient, 3000 unvested back to payer.
    assert_eq!(reclaimed, 3_000);
    assert_eq!(s.token_client.balance(&s.recipient), 3_000);
    assert_eq!(s.token_client.balance(&s.payer), payer_before + 3_000);
    assert_eq!(s.client.get_stream(&id).status, StreamStatus::Stopped);
}

#[test]
fn stop_after_partial_withdraw_settles_correctly() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &6_000, &1_000, &7_000);

    // Withdraw 1500 at 25%.
    set_now(&s.env, 2_500);
    assert_eq!(s.client.withdraw(&id), 1_500);

    // Stop at 50%: vested 3000, already withdrew 1500 -> owe 1500 more,
    // reclaim 3000 unvested.
    set_now(&s.env, 4_000);
    let payer_before = s.token_client.balance(&s.payer);
    let reclaimed = s.client.stop(&id);
    assert_eq!(reclaimed, 3_000);
    assert_eq!(s.token_client.balance(&s.recipient), 3_000);
    assert_eq!(s.token_client.balance(&s.payer), payer_before + 3_000);
}

#[test]
fn stop_on_stopped_is_rejected() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &6_000, &1_000, &7_000);
    set_now(&s.env, 4_000);
    s.client.stop(&id);
    assert_eq!(s.client.try_stop(&id), Err(Ok(Error::StreamNotActive)));
}

#[test]
fn invalid_create_parameters_are_rejected() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    // amount <= 0
    assert_eq!(
        s.client
            .try_create_stream(&s.payer, &s.recipient, &0, &1_000, &7_000),
        Err(Ok(Error::InvalidAmount))
    );
    // end <= start
    assert_eq!(
        s.client
            .try_create_stream(&s.payer, &s.recipient, &100, &7_000, &1_000),
        Err(Ok(Error::InvalidSchedule))
    );
}

#[test]
fn create_is_blocked_while_paused() {
    let s = setup(10_000);
    set_now(&s.env, 1_000);
    s.client.pause();
    assert!(s.client.is_paused());
    let res = s
        .client
        .try_create_stream(&s.payer, &s.recipient, &100, &1_000, &7_000);
    assert_eq!(res, Err(Ok(Error::Paused)));

    s.client.unpause();
    let id = s
        .client
        .create_stream(&s.payer, &s.recipient, &100, &1_000, &7_000);
    assert_eq!(id, 1);
}

#[test]
fn missing_stream_is_reported() {
    let s = setup(10_000);
    assert_eq!(s.client.try_get_stream(&42), Err(Ok(Error::StreamNotFound)));
}
