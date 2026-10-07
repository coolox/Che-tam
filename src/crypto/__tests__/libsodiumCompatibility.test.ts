import type * as compatibilityModule from '../libsodiumCompatibility';

const mockSodium = {
  crypto_box_PUBLICKEYBYTES: 32,
  crypto_box_SECRETKEYBYTES: 32,
  crypto_box_SEALBYTES: 48,
  crypto_box_keypair: jest.fn((publicKey: Uint8Array, secretKey: Uint8Array) => {
    publicKey.fill(1);
    secretKey.fill(2);
  }),
  crypto_box_seal: jest.fn((cipherText: Uint8Array, message: Uint8Array) => {
    cipherText.fill(9, 0, 48);
    cipherText.set(message, 48);
  }),
  crypto_box_seal_open: jest.fn((message: Uint8Array, cipherText: Uint8Array) => {
    message.set(cipherText.subarray(48));
  }),

  crypto_sign_BYTES: 64,
  crypto_sign_PUBLICKEYBYTES: 32,
  crypto_sign_SECRETKEYBYTES: 64,
  crypto_sign_SEEDBYTES: 32,
  crypto_sign_seed_keypair: jest.fn((publicKey: Uint8Array, secretKey: Uint8Array) => {
    publicKey.set(hexToBytes('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'));
    secretKey.fill(3);
  }),
  crypto_sign_detached: jest.fn((signature: Uint8Array) => {
    signature.set(
      hexToBytes(
        'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' +
          '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
      ),
    );
  }),
  crypto_sign_verify_detached: jest.fn(() => true),

  crypto_scalarmult_BYTES: 32,
  crypto_scalarmult_SCALARBYTES: 32,
  crypto_scalarmult: jest.fn((out: Uint8Array) => {
    out.set(hexToBytes('c3da55379de9c6908e94ea4df28d084f32eccf03491c71f754b4075577a28552'));
  }),
  crypto_scalarmult_base: jest.fn((out: Uint8Array) => {
    out.fill(4);
  }),

  crypto_aead_xchacha20poly1305_ietf_ABYTES: 16,
  crypto_aead_xchacha20poly1305_ietf_KEYBYTES: 32,
  crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: 24,
  crypto_aead_xchacha20poly1305_ietf_encrypt: jest.fn((cipherText: Uint8Array) => {
    cipherText.set(
      hexToBytes(
        'bd6d179d3e83d43b9576579493c0e939572a1700252bfaccbed2902c21396cbb' +
          '731c7f1b0b4aa6440bf3a82f4eda7e39ae64c6708c54c216cb96b72e1213b45' +
          '22f8c9ba40db5d945b11b69b982c1bb9e3f3fac2bc369488f76b2383565d3f' +
          'ff921f9664c97637da9768812f615c68b13b52ec0875924c1c7987947deafd8780acf49',
      ),
    );
    return cipherText.length;
  }),
  crypto_aead_xchacha20poly1305_ietf_decrypt: jest.fn((message: Uint8Array) => {
    message.set(
      hexToBytes(
        '4c616469657320616e642047656e746c656d656e206f662074686520636c617373' +
          '206f66202739393a204966204920636f756c64206f6666657220796f75206f6e' +
          '6c79206f6e652074697020666f7220746865206675747572652c2073756e7363' +
          '7265656e20776f756c642062652069742e',
      ),
    );
    return message.length;
  }),

  crypto_pwhash_SALTBYTES: 16,
  crypto_pwhash_ALG_ARGON2ID13: 2,
  crypto_pwhash_OPSLIMIT_INTERACTIVE: 2,
  crypto_pwhash_MEMLIMIT_INTERACTIVE: 67108864,
  crypto_pwhash: jest.fn((out: Uint8Array) => {
    out.fill(5);
  }),

  crypto_secretstream_xchacha20poly1305_ABYTES: 17,
  crypto_secretstream_xchacha20poly1305_HEADERBYTES: 24,
  crypto_secretstream_xchacha20poly1305_KEYBYTES: 32,
  crypto_secretstream_xchacha20poly1305_STATEBYTES: 52,
  crypto_secretstream_xchacha20poly1305_TAG_FINAL: 3,
  crypto_secretstream_xchacha20poly1305_keygen: jest.fn((key: Uint8Array) => {
    key.fill(6);
  }),
  crypto_secretstream_xchacha20poly1305_init_push: jest.fn((state: Uint8Array, header: Uint8Array) => {
    state.fill(7);
    header.fill(8);
  }),
  crypto_secretstream_xchacha20poly1305_push: jest.fn((state: Uint8Array, cipherText: Uint8Array, message: Uint8Array) => {
    state.fill(10);
    cipherText.fill(11, 0, 17);
    cipherText.set(message, 17);
  }),
  crypto_secretstream_xchacha20poly1305_init_pull: jest.fn((state: Uint8Array) => {
    state.fill(12);
  }),
  crypto_secretstream_xchacha20poly1305_pull: jest.fn((state: Uint8Array, message: Uint8Array, tag: Uint8Array, cipherText: Uint8Array) => {
    state.fill(13);
    tag[0] = 3;
    message.set(cipherText.subarray(17));
  }),
};

jest.mock('sodium-react-native-direct', () => mockSodium, { virtual: true });

const compatibility = jest.requireActual('../libsodiumCompatibility') as typeof compatibilityModule;

describe('runLibsodiumCompatibilityProof', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs all required libsodium primitives and reports OK', async () => {
    const results = await compatibility.runLibsodiumCompatibilityProof();

    expect(results).toEqual([
      { key: 'x25519', label: 'X25519', status: 'ok' },
      { key: 'ed25519', label: 'Ed25519', status: 'ok' },
      { key: 'xchacha20poly1305', label: 'XChaCha20-Poly1305', status: 'ok' },
      { key: 'sealedBox', label: 'crypto_box_seal', status: 'ok' },
      { key: 'argon2id', label: 'Argon2id', status: 'ok' },
      { key: 'secretstream', label: 'secretstream', status: 'ok' },
    ]);
    expect(mockSodium.crypto_scalarmult).toHaveBeenCalled();
    expect(mockSodium.crypto_sign_detached).toHaveBeenCalled();
    expect(mockSodium.crypto_aead_xchacha20poly1305_ietf_encrypt).toHaveBeenCalled();
    expect(mockSodium.crypto_box_seal_open).toHaveBeenCalled();
    expect(mockSodium.crypto_pwhash).toHaveBeenCalledWith(expect.any(Uint8Array), expect.any(Uint8Array), expect.any(Uint8Array), 2, 67108864, 2);
    expect(mockSodium.crypto_secretstream_xchacha20poly1305_pull).toHaveBeenCalled();
  });

  it('uses safe error categories without leaking primitive values', async () => {
    mockSodium.crypto_sign_detached.mockImplementationOnce(() => {
      throw new Error('native failure with sensitive internals');
    });

    const results = await compatibility.runLibsodiumCompatibilityProof();

    expect(results.find(result => result.key === 'ed25519')).toEqual({
      key: 'ed25519',
      label: 'Ed25519',
      status: 'error',
      errorCategory: 'unexpected',
    });
  });

  it('documents the selected package and rollout line', () => {
    expect(compatibility.CRYPTO_001_SELECTED_PACKAGE).toEqual(expect.objectContaining({ name: 'sodium-react-native-direct', version: '0.4.4' }));
    expect(JSON.parse(compatibility.CRYPTO_001_ROLLOUT_JSONL)).toEqual({
      task: 'CRYPTO-001',
      package: 'sodium-react-native-direct',
      version: '0.4.4',
      surface: 'localtest-settings',
      native_acceptance: 'pending-hermes-arm64-apk',
      checks: ['x25519', 'ed25519', 'xchacha20poly1305', 'crypto_box_seal', 'argon2id', 'secretstream_xchacha20poly1305'],
    });
  });
});

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
