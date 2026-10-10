import type { Cipher, DeriveReply, DeriveRequest, KeyRecord, Wrapped } from "./types";

const utf8 = new TextEncoder();
let master: CryptoKey | null = null;
let readRecord: () => Promise<KeyRecord | null> = async () => null;
let generation = 0;

export function b64(bytes: Uint8Array | ArrayBuffer): string {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let result = "";
  for (let i = 0; i < data.length; i += 8192) result += String.fromCharCode(...data.subarray(i, i + 8192));
  return btoa(result);
}
export function unb64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}
function random(length: number) { return crypto.getRandomValues(new Uint8Array(length)); }
export function available() { return typeof crypto !== "undefined" && !!crypto.subtle && globalThis.isSecureContext !== false; }
export function unlocked() { return master !== null; }
export function lock() { master = null; generation++; }
export function setRecordReader(reader: typeof readRecord) { readRecord = reader; }

/** One short-lived worker per derivation: no UI blocking or persistent password in a worker. */
export function derive(password: string, salt: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (!available()) return Promise.reject(new Error("Enkripsi memerlukan HTTPS atau localhost."));
  return new Promise((resolve, reject) => {
    const worker = new Worker("/visual/argon2.worker.js");
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => { worker.terminate(); reject(new Error("Proses kunci melewati batas waktu.")); }, 60000);
    const done = () => { clearTimeout(timeout); worker.terminate(); };
    worker.onmessage = ({ data }: MessageEvent<DeriveReply>) => {
      if (data.id !== id) return;
      done();
      if (data.bits) resolve(new Uint8Array(data.bits));
      else reject(new Error(data.error || "Kunci gagal dibuat."));
    };
    worker.onerror = () => { done(); reject(new Error("Modul enkripsi tidak berhasil dimuat.")); };
    worker.postMessage({ id, password, salt } satisfies DeriveRequest);
  });
}

async function keyFrom(bytes: Uint8Array<ArrayBuffer>) {
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
async function keyFromSecret(password: string, salt: string) {
  const bytes = await derive(password, unb64(salt));
  try { return await keyFrom(bytes); } finally { bytes.fill(0); }
}
async function wrap(raw: Uint8Array<ArrayBuffer>, key: CryptoKey): Promise<Wrapped> {
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8.encode("untukmu:vault:v2") }, key, raw);
  return { iv: b64(iv), ct: b64(ct) };
}
async function unwrap(payload: Wrapped, key: CryptoKey) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.iv), additionalData: utf8.encode("untukmu:vault:v2") }, key, unb64(payload.ct)));
}
export function makeRecoveryCode() { return b64(random(32)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
export function normalizeRecovery(value: string) { return value.trim(); }

export async function setup(password: string) {
  if (password.length < 12 || password.length > 256) throw new Error("Kata sandi wajib 12–256 karakter.");
  const epoch = generation;
  const salt = b64(random(16));
  const recoveryCode = makeRecoveryCode();
  const raw = random(32);
  try {
    const wrapped = await wrap(raw, await keyFromSecret(password, salt));
    const wrappedRecovery = await wrap(raw, await keyFromSecret(recoveryCode, salt));
    const record: KeyRecord = { v: 2, kdf: "Argon2id", memory: 65536, iter: 3, parallelism: 1, salt, wrapped, wrappedRecovery };
    const key = await keyFrom(raw);
    if (generation !== epoch) throw new Error("Pembukaan kunci dibatalkan.");
    master = key;
    return { record, recoveryCode };
  } finally { raw.fill(0); }
}

async function open(secret: string, recovery: boolean, supplied?: KeyRecord) {
  const epoch = generation;
  const record = supplied || await readRecord();
  if (!record || record.v !== 2 || record.kdf !== "Argon2id" || record.memory !== 65536 || record.iter !== 3 || record.parallelism !== 1) throw new Error("Rekaman kunci tidak didukung.");
  const raw = await unwrap(recovery ? record.wrappedRecovery : record.wrapped, await keyFromSecret(secret, record.salt));
  try {
    const key = await keyFrom(raw);
    if (generation !== epoch) throw new Error("Pembukaan kunci dibatalkan.");
    master = key;
  } finally { raw.fill(0); }
}
export const unlock = (password: string, record?: KeyRecord) => open(password, false, record);
export const unlockWithRecovery = (code: string) => open(normalizeRecovery(code), true);

/** Domain-separated login verifier; neither the raw password nor a vault key is sent to the API. */
export async function authCredential(password: string, email: string) {
  if (password.length > 256) throw new Error("Kata sandi terlalu panjang.");
  const digest = await crypto.subtle.digest("SHA-256", utf8.encode("untukmu:auth:v1:" + email.trim().toLowerCase()));
  const bytes = await derive(password, new Uint8Array(digest).slice(0, 16));
  try { return b64(bytes); } finally { bytes.fill(0); }
}

export async function encryptPesan(text: string, privacy = "privat", id = crypto.randomUUID()): Promise<Cipher> {
  if (!["privat", "unlisted"].includes(privacy)) throw new Error("Enkripsi pribadi tersedia untuk pesan privat dan tautan terbatas.");
  if (!master || !available()) throw new Error("locked");
  const iv = random(12), aad = `untukmu:message:v2:${id}:${privacy === "unlisted" ? "unlisted" : "private"}`;
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8.encode(aad) }, master, utf8.encode(text));
  return { v: 2, alg: "A256GCM", mode: "private", iv: b64(iv), ct: b64(ct), aad };
}
export async function decryptPesan(payload: Cipher): Promise<string | null> {
  if (!master) return null;
  const epoch = generation;
  if (payload.v !== 2 || payload.alg !== "A256GCM" || payload.mode !== "private") throw new Error("Format pesan tidak didukung.");
  const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(payload.iv), additionalData: utf8.encode(payload.aad) }, master, unb64(payload.ct));
  return generation === epoch ? new TextDecoder().decode(result) : null;
}

/** A distinct key travels only in the URL fragment, never to the API. */
export async function encryptShare(text: string, id: string) {
  const raw = random(32), iv = random(12), aad = `untukmu:share:v1:${id}`;
  try {
    const ct = await crypto.subtle.encrypt({name: "AES-GCM", iv, additionalData: utf8.encode(aad)}, await keyFrom(raw), utf8.encode(text));
    return {key: b64(raw).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""),
      payload: {v: 2, alg: "A256GCM", mode: "private", iv: b64(iv), ct: b64(ct), aad} satisfies Cipher};
  } finally {raw.fill(0);}
}
export async function decryptShare(payload: Cipher, secret: string, id: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret) || payload.aad !== `untukmu:share:v1:${id}` || payload.alg !== "A256GCM") throw new Error("Kunci tautan tidak valid.");
  const raw = unb64(secret.replaceAll("-", "+").replaceAll("_", "/") + "=");
  try {
    const result = await crypto.subtle.decrypt({name: "AES-GCM", iv: unb64(payload.iv), additionalData: utf8.encode(payload.aad)}, await keyFrom(raw), unb64(payload.ct));
    return new TextDecoder().decode(result);
  } finally {raw.fill(0);}
}

export async function encryptFile(file: File, id: string) {
  if (!master) throw new Error("Buka kunci sebelum mengunggah berkas.");
  if (file.size > 9 * 1024 * 1024) throw new Error("Ukuran berkas maksimal 9 MiB.");
  // Filename and MIME type are encrypted together with the bytes.
  const data = utf8.encode(JSON.stringify({ name: file.name, type: file.type, data: b64(await file.arrayBuffer()) }));
  if (data.byteLength + 16 > 10 * 1024 * 1024) throw new Error("Berkas terenkripsi melampaui 10 MiB.");
  const iv = random(12), aad = `untukmu:upload:v2:${id}`;
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: utf8.encode(aad) }, master, data);
  return { blob: new Blob([encrypted], { type: "application/octet-stream" }), iv: b64(iv), aad };
}
export async function decryptFile(bytes: ArrayBuffer, meta: { iv: string; aad: string }) {
  if (!master) throw new Error("Buka kunci untuk membaca berkas.");
  const epoch = generation;
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(meta.iv), additionalData: utf8.encode(meta.aad) }, master, bytes);
  if (generation !== epoch) throw new Error("Kunci sudah ditutup.");
  const value: { name: string; type: string; data: string } = JSON.parse(new TextDecoder().decode(raw));
  return new File([unb64(value.data)], value.name, { type: value.type });
}

/** Domain-separated verifier: the recovery secret never goes to the server. */
export async function recoveryVerifier(code: string, email: string) {
  const normalized = normalizeRecovery(code);
  if (!/^[A-Za-z0-9_-]{43}$/.test(normalized)) throw new Error("Format kode pemulihan tidak valid.");
  return b64(await crypto.subtle.digest("SHA-256", utf8.encode(`untukmu:recovery-auth:v1:${email.trim().toLowerCase()}:${normalized}`)));
}
export async function rewrapWithRecovery(code: string, password: string, previous: KeyRecord) {
  if (password.length < 12 || password.length > 256) throw new Error("Kata sandi wajib 12–256 karakter.");
  if(previous.v!==2 || previous.kdf!=="Argon2id" || previous.memory!==65536 || previous.iter!==3 || previous.parallelism!==1) throw new Error("Rekaman kunci tidak didukung.");
  const epoch = generation;
  const raw = await unwrap(previous.wrappedRecovery, await keyFromSecret(normalizeRecovery(code), previous.salt));
  try {
    const salt = b64(random(16)), recoveryCode = makeRecoveryCode();
    const record: KeyRecord = {...previous,salt,wrapped:await wrap(raw,await keyFromSecret(password,salt)),wrappedRecovery:await wrap(raw,await keyFromSecret(recoveryCode,salt))};
    if(epoch!==generation) throw new Error("Pemulihan dibatalkan.");
    return {record,recoveryCode};
  } finally {raw.fill(0);}
}
export async function encryptExport(value: unknown, password: string) {
  if(password.length<12 || password.length>256) throw new Error("Kata sandi ekspor wajib 12–256 karakter.");
  const salt=b64(random(16)),iv=random(12),key=await keyFromSecret(password,salt);
  const aad="untukmu:export:v1";
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:utf8.encode(aad)},key,utf8.encode(JSON.stringify(value)));
  return {format:aad,kdf:"Argon2id",memory:65536,iter:3,parallelism:1,salt,iv:b64(iv),ct:b64(ct)};
}
export async function decryptExport(envelope: Awaited<ReturnType<typeof encryptExport>>, password: string) {
  if(envelope.format!=="untukmu:export:v1"||envelope.kdf!=="Argon2id"||envelope.memory!==65536||envelope.iter!==3||envelope.parallelism!==1||unb64(envelope.salt).length!==16||unb64(envelope.iv).length!==12) throw new Error("Format ekspor tidak didukung.");
  const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(envelope.iv),additionalData:utf8.encode(envelope.format)},await keyFromSecret(password,envelope.salt),unb64(envelope.ct));
  return JSON.parse(new TextDecoder().decode(raw)) as {format:string;messages:unknown[];uploads:unknown[];constellations:unknown[]};
}
