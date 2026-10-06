import { argon2id } from "hash-wasm";
import type { DeriveRequest, DeriveReply } from "./types";

self.onmessage = async ({ data }: MessageEvent<DeriveRequest>) => {
  try {
    if (!data.password || data.password.length > 1024 || data.salt.byteLength !== 16) throw new Error("Parameter KDF tidak valid.");
    const bits = await argon2id({ password: data.password, salt: data.salt, parallelism: 1,
      iterations: 3, memorySize: 65536, hashLength: 32, outputType: "binary" });
    data.password = "";
    self.postMessage({ id: data.id, bits } satisfies DeriveReply, { transfer: [bits.buffer] });
  } catch {
    self.postMessage({ id: data.id, error: "Argon2id gagal dijalankan. Gunakan peramban yang mendukung WebAssembly." } satisfies DeriveReply);
  }
};
