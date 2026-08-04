import { StrKey } from '@stellar/stellar-sdk';

/**
 * Minimal federation resolver. For Agos, we only need to validate public keys.
 * No federation server lookups required — employers enter contractor pubkeys directly.
 */
export function isValidStellarPublicKey(key: string): boolean {
  try {
    return StrKey.isValidEd25519PublicKey(key);
  } catch {
    return false;
  }
}

export function isValidStellarSecret(secret: string): boolean {
  try {
    return StrKey.isValidEd25519SecretSeed(secret);
  } catch {
    return false;
  }
}
