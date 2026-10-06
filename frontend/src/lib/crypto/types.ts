export interface Wrapped { iv: string; ct: string }
export interface KeyRecord {
  v: 2; kdf: "Argon2id"; memory: 65536; iter: 3; parallelism: 1;
  salt: string; wrapped: Wrapped; wrappedRecovery: Wrapped;
}
export interface Cipher extends Wrapped {
  v: 2; alg: "A256GCM"; mode: "private"; aad: string;
}
export interface DeriveRequest { id: string; password: string; salt: Uint8Array }
export interface DeriveReply { id: string; bits?: Uint8Array; error?: string }
