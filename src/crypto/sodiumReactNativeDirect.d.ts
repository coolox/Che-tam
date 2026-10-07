declare module 'sodium-react-native-direct' {
  type SodiumTag = Uint8Array;

  const sodium: {
    crypto_box_PUBLICKEYBYTES: number;
    crypto_box_SECRETKEYBYTES: number;
    crypto_box_SEALBYTES: number;
    crypto_box_keypair(publicKey: Uint8Array, secretKey: Uint8Array): void;
    crypto_box_seal(cipherText: Uint8Array, message: Uint8Array, publicKey: Uint8Array): void;
    crypto_box_seal_open(message: Uint8Array, cipherText: Uint8Array, publicKey: Uint8Array, secretKey: Uint8Array): void;

    crypto_sign_BYTES: number;
    crypto_sign_PUBLICKEYBYTES: number;
    crypto_sign_SECRETKEYBYTES: number;
    crypto_sign_SEEDBYTES: number;
    crypto_sign_seed_keypair(publicKey: Uint8Array, secretKey: Uint8Array, seed: Uint8Array): void;
    crypto_sign_detached(signature: Uint8Array, message: Uint8Array, secretKey: Uint8Array): void;
    crypto_sign_verify_detached(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean;

    crypto_scalarmult_BYTES: number;
    crypto_scalarmult_SCALARBYTES: number;
    crypto_scalarmult(q: Uint8Array, scalar: Uint8Array, publicKey: Uint8Array): void;
    crypto_scalarmult_base(q: Uint8Array, scalar: Uint8Array): void;

    crypto_aead_xchacha20poly1305_ietf_ABYTES: number;
    crypto_aead_xchacha20poly1305_ietf_KEYBYTES: number;
    crypto_aead_xchacha20poly1305_ietf_NPUBBYTES: number;
    crypto_aead_xchacha20poly1305_ietf_encrypt(cipherText: Uint8Array, message: Uint8Array, additionalData: Uint8Array | null, nsec: null, nonce: Uint8Array, key: Uint8Array): number;
    crypto_aead_xchacha20poly1305_ietf_decrypt(message: Uint8Array, nsec: null, cipherText: Uint8Array, additionalData: Uint8Array | null, nonce: Uint8Array, key: Uint8Array): number;

    crypto_pwhash_SALTBYTES: number;
    crypto_pwhash_ALG_ARGON2ID13: number;
    crypto_pwhash_OPSLIMIT_INTERACTIVE: number;
    crypto_pwhash_MEMLIMIT_INTERACTIVE: number;
    crypto_pwhash(out: Uint8Array, password: Uint8Array, salt: Uint8Array, opslimit: number, memlimit: number, algorithm: number): void;

    crypto_secretstream_xchacha20poly1305_ABYTES: number;
    crypto_secretstream_xchacha20poly1305_HEADERBYTES: number;
    crypto_secretstream_xchacha20poly1305_KEYBYTES: number;
    crypto_secretstream_xchacha20poly1305_STATEBYTES: number;
    crypto_secretstream_xchacha20poly1305_TAG_FINAL: number;
    crypto_secretstream_xchacha20poly1305_keygen(key: Uint8Array): void;
    crypto_secretstream_xchacha20poly1305_init_push(state: Uint8Array, header: Uint8Array, key: Uint8Array): void;
    crypto_secretstream_xchacha20poly1305_push(state: Uint8Array, cipherText: Uint8Array, message: Uint8Array, additionalData: Uint8Array | null, tag: SodiumTag): void;
    crypto_secretstream_xchacha20poly1305_init_pull(state: Uint8Array, header: Uint8Array, key: Uint8Array): void;
    crypto_secretstream_xchacha20poly1305_pull(state: Uint8Array, message: Uint8Array, tag: Uint8Array, cipherText: Uint8Array, additionalData: Uint8Array | null): void;
  };

  export default sodium;
}
