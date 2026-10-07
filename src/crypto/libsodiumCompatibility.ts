type SodiumModule = typeof import('react-native-libsodium');

export type CryptoProofCheckKey =
  | 'x25519'
  | 'ed25519'
  | 'xchacha20poly1305'
  | 'sealedBox'
  | 'argon2id'
  | 'fileEncryption5Mb';

export type CryptoProofErrorCategory =
  | 'api_missing'
  | 'crypto_failed'
  | 'unavailable'
  | 'unexpected'
  | 'vector_mismatch';

export type CryptoProofCheckResult = {
  key: CryptoProofCheckKey;
  label: string;
  status: 'ok' | 'error';
  errorCategory?: CryptoProofErrorCategory;
};

export const CRYPTO_001_SELECTED_PACKAGE = {
  name: 'react-native-libsodium',
  version: '1.7.0',
  evidence: 'README Requirements: New Architecture enabled; README Installation Expo (dev-client): plugins: [["react-native-libsodium", {}]]',
} as const;

export const CRYPTO_001_ROLLOUT_JSONL =
  '{"task":"CRYPTO-001S","package":"react-native-libsodium","version":"1.7.0","surface":"localtest-settings","native_acceptance":"pending-hermes-arm64-apk","checks":["x25519","ed25519","xchacha20poly1305","crypto_box_seal","argon2id","file_encryption_5mb_aead_xchacha20poly1305_ietf"]}';

const CHECK_LABELS: Record<CryptoProofCheckKey, string> = {
  x25519: 'X25519',
  ed25519: 'Ed25519',
  xchacha20poly1305: 'XChaCha20-Poly1305',
  sealedBox: 'crypto_box_seal',
  argon2id: 'Argon2id',
  fileEncryption5Mb: 'Шифрование файла 5 МБ',
};

// Published vectors: RFC 7748 (X25519), RFC 8032 (Ed25519), and the CFRG XChaCha20-Poly1305 draft.
const vectors = {
  x25519Scalar: hexToBytes('a546e36bf0527c9d3b16154b82465edd62144c0ac1fc5a18506a2244ba449ac4'),
  x25519Point: hexToBytes('e6db6867583030db3594c1a424b15f7c726624ec26b3353b10a903a6d1ab1c4c'),
  x25519Shared: hexToBytes('c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552'),
  ed25519Seed: hexToBytes('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'),
  ed25519PublicKey: hexToBytes('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'),
  ed25519EmptySignature: hexToBytes(
    'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
      '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
  ),
  xchachaKey: hexToBytes('808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f'),
  xchachaNonce: hexToBytes('404142434445464748494a4b4c4d4e4f5051525354555657'),
  xchachaAdditionalData: hexToBytes('50515253c0c1c2c3c4c5c6c7'),
  xchachaMessage: hexToBytes(
    '4c616469657320616e642047656e746c656d656e206f662074686520636c617373' +
      '206f66202739393a204966204920636f756c64206f6666657220796f75206f6e' +
      '6c79206f6e652074697020666f7220746865206675747572652c2073756e7363' +
      '7265656e20776f756c642062652069742e',
  ),
  xchachaCipherText: hexToBytes(
    'bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb' +
      '731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b45' +
      '22f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3f' +
      'ff921f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49',
  ),
} as const;

export async function runLibsodiumCompatibilityProof(): Promise<CryptoProofCheckResult[]> {
  let sodium: SodiumModule;
  try {
    sodium = await loadLibsodium();
  } catch {
    return REQUIRED_CHECKS.map(key => ({ key, label: CHECK_LABELS[key], status: 'error', errorCategory: 'unavailable' }));
  }

  const checks: Array<[CryptoProofCheckKey, (sodium: SodiumModule) => void]> = [
    ['x25519', checkX25519],
    ['ed25519', checkEd25519],
    ['xchacha20poly1305', checkXChaCha20Poly1305],
    ['sealedBox', checkSealedBox],
    ['argon2id', checkArgon2id],
    ['fileEncryption5Mb', checkFileEncryption5Mb],
  ];

  const results: CryptoProofCheckResult[] = [];
  for (const [key, check] of checks) {
    try {
      await Promise.resolve().then(() => check(sodium));
      results.push({ key, label: CHECK_LABELS[key], status: 'ok' });
    } catch (error) {
      results.push({ key, label: CHECK_LABELS[key], status: 'error', errorCategory: categorizeError(error) });
    }
  }
  return results;
}

const REQUIRED_CHECKS: CryptoProofCheckKey[] = ['x25519', 'ed25519', 'xchacha20poly1305', 'sealedBox', 'argon2id', 'fileEncryption5Mb'];

async function loadLibsodium(): Promise<SodiumModule> {
  return Promise.resolve().then(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('react-native-libsodium') as SodiumModule;
  });
}

function checkX25519(sodium: SodiumModule) {
  requireApi(sodium, 'crypto_scalarmult', 'crypto_scalarmult_base');
  const shared = sodium.crypto_scalarmult(vectors.x25519Scalar, vectors.x25519Point);
  assertBytesEqual(shared, vectors.x25519Shared);

  const publicKey = sodium.crypto_scalarmult_base(vectors.x25519Scalar);
  assertNonZero(publicKey);
  wipe(shared, publicKey);
}

function checkEd25519(sodium: SodiumModule) {
  requireApi(sodium, 'crypto_sign_seed_keypair', 'crypto_sign_detached', 'crypto_sign_verify_detached');
  const { publicKey, privateKey } = sodium.crypto_sign_seed_keypair(vectors.ed25519Seed);
  assertBytesEqual(publicKey, vectors.ed25519PublicKey);
  const signature = sodium.crypto_sign_detached(new Uint8Array(0), privateKey);
  assertBytesEqual(signature, vectors.ed25519EmptySignature);
  if (!sodium.crypto_sign_verify_detached(signature, new Uint8Array(0), publicKey)) {
    throw new CryptoFailedError();
  }
  wipe(publicKey, privateKey, signature);
}

function checkXChaCha20Poly1305(sodium: SodiumModule) {
  requireApi(sodium, 'crypto_aead_xchacha20poly1305_ietf_encrypt', 'crypto_aead_xchacha20poly1305_ietf_decrypt');
  const cipherText = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    vectors.xchachaMessage,
    vectors.xchachaAdditionalData,
    null,
    vectors.xchachaNonce,
    vectors.xchachaKey,
  );
  assertBytesEqual(cipherText, vectors.xchachaCipherText);
  const message = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    cipherText,
    vectors.xchachaAdditionalData,
    vectors.xchachaNonce,
    vectors.xchachaKey,
  );
  assertBytesEqual(message, vectors.xchachaMessage);
  wipe(cipherText, message);
}

function checkSealedBox(sodium: SodiumModule) {
  requireApi(sodium, 'crypto_box_keypair', 'crypto_box_seal', 'crypto_box_seal_open');
  const { publicKey, privateKey } = sodium.crypto_box_keypair();
  const message = utf8Bytes('sealed box proof');
  const cipherText = sodium.crypto_box_seal(message, publicKey);
  const opened = sodium.crypto_box_seal_open(cipherText, publicKey, privateKey);
  assertBytesEqual(opened, message);
  wipe(publicKey, privateKey, message, cipherText, opened);
}

function checkArgon2id(sodium: SodiumModule) {
  requireApi(sodium, 'crypto_pwhash');
  const password = utf8Bytes('compatibility password');
  const salt = new Uint8Array(sodium.crypto_pwhash_SALTBYTES);
  salt.set(hexToBytes('000102030405060708090a0b0c0d0e0f').subarray(0, salt.length));
  const out = sodium.crypto_pwhash(
    32,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  );
  assertNonZero(out);
  wipe(out, password, salt);
}

function checkFileEncryption5Mb(sodium: SodiumModule) {
  requireApi(sodium, 'crypto_aead_xchacha20poly1305_ietf_encrypt', 'crypto_aead_xchacha20poly1305_ietf_decrypt');
  const key = new Uint8Array(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
  const nonce = new Uint8Array(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const message = new Uint8Array(5 * 1024 * 1024);
  message.fill(0xa5);
  key.fill(0x11);
  nonce.fill(0x22);
  const cipherText = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(message, null, null, nonce, key);
  const opened = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, cipherText, null, nonce, key);
  assertBytesEqual(opened, message);
  wipe(key, nonce, message, cipherText, opened);
}

function requireApi(sodium: SodiumModule, ...names: Array<keyof SodiumModule>) {
  for (const name of names) {
    if (typeof sodium[name] !== 'function') {
      throw new ApiMissingError();
    }
  }
}

function assertBytesEqual(actual: Uint8Array, expected: Uint8Array) {
  if (actual.length !== expected.length) {
    throw new VectorMismatchError();
  }
  let diff = 0;
  for (let index = 0; index < actual.length; index += 1) {
    diff |= actual[index] ^ expected[index];
  }
  if (diff !== 0) {
    throw new VectorMismatchError();
  }
}

function assertNonZero(bytes: Uint8Array) {
  if (!bytes.some(byte => byte !== 0)) {
    throw new CryptoFailedError();
  }
}

function categorizeError(error: unknown): CryptoProofErrorCategory {
  if (error instanceof ApiMissingError) return 'api_missing';
  if (error instanceof VectorMismatchError) return 'vector_mismatch';
  if (error instanceof CryptoFailedError) return 'crypto_failed';
  if (error instanceof Error && error.message.includes("doesn't seem to be linked")) return 'unavailable';
  return 'unexpected';
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function utf8Bytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index);
  }
  return bytes;
}

function wipe(...arrays: Uint8Array[]) {
  arrays.forEach(array => array.fill(0));
}

class ApiMissingError extends Error {}
class CryptoFailedError extends Error {}
class VectorMismatchError extends Error {}
