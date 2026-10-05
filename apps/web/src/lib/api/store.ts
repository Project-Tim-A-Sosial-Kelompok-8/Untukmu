import { requestChallenge } from "../../features/account/Challenge";
import { api, allPages, cached, currentUser, invalidate, restore, updateUser } from "./client";
import * as vault from "../crypto/vault";
import type { Cipher, KeyRecord } from "../crypto/types";

export interface Galaxy {
  id: string; nama: string; kategori: string; kind: "spiral" | "ellipsoid" | "irregular";
  warna: string; radius: 110 | 140 | 175; count: number; foto: string | null; dibuat: number;
  sendiri: true; seed: false;
}
interface GalaxyRecord {
  id: string; target_label: string; target_kind: string; custom_category: string | null;
  visual_ref: string | null; kind: Galaxy["kind"]; color: string; radius: Galaxy["radius"];
  particle_count: number; created_at: string;
}
interface MessageRecord {
  entry_type: "message" | "prayer";
  visibility: "private" | "public_anon" | "unlisted"; public_body: string | null; is_mine: boolean; moderation_status: string; empathy_count: number;
  id: string; constellation_ids: string[]; payload: Cipher; date_label: string | null;
  mood: string | null; tags: string[]; created_at: string; prayer_count: number; attachment_ids: string[];
}
export interface Message {
  jenis: "pesan" | "doa";
  publicBody: string | null; moderationStatus: string; empathyCount: number;
  id: string; galaksiId: string; galaksiIds: string[]; privasi: "privat" | "publik" | "unlisted"; isi: Cipher; tanggal: string | null;
  mood: string | null; tag: string[]; dibuat: number; sendiri: boolean; piringan: true;
  seed: false; pendoa: { total: number; tradisi: Record<string, number> }; attachmentIds: string[];
}
const categories: Record<string, string> = { "orang-tua": "orang_tua", orangtua: "orang_tua", keluarga: "saudara", saudara: "saudara", sahabat: "sahabat", pasangan: "pasangan", seseorang: "seseorang", "diri-sendiri": "diri_sendiri", diri: "diri_sendiri" };
const objectURLs = new Map<string, string>();
let boot: Promise<unknown> | null = null;
export function ready() {
  boot ||= restore().then(async user => {
    const catalog = await api<unknown[]>("/prayers/traditions");
    window.UM.doaData.tradisi.splice(0, window.UM.doaData.tradisi.length, ...catalog);
    return user;
  }).catch(error => { boot = null; throw error; });
  return boot;
}
function requireUser() { if (!currentUser()) throw new Error("Silakan masuk terlebih dahulu."); }

async function upload(file: File) {
  requireUser();
  const id = crypto.randomUUID();
  const encrypted = await vault.encryptFile(file, id);
  const signed = await api<{ upload: { url: string; fields: Record<string, string> } }>("/uploads/presign", {
    method: "POST", body: JSON.stringify({ id, byte_size: encrypted.blob.size, iv: encrypted.iv, aad: encrypted.aad }),
  });
  const form = new FormData();
  Object.entries(signed.upload.fields).forEach(([key, value]) => form.append(key, value));
  form.append("file", encrypted.blob, "encrypted.bin");
  const sent = await fetch(signed.upload.url, { method: "POST", body: form, credentials: "omit" });
  if (!sent.ok) throw new Error("Unggahan terenkripsi gagal.");
  await api(`/uploads/${id}/complete`, { method: "POST" });
  return id;
}
async function readFile(id: string) {
  const info = await api<{ url: string; encryption_meta: { iv: string; aad: string } }>(`/uploads/${id}`);
  const response = await fetch(info.url, { credentials: "omit" });
  if (!response.ok) throw new Error("Berkas tidak berhasil dimuat.");
  return vault.decryptFile(await response.arrayBuffer(), info.encryption_meta);
}
async function photoURL(id: string) {
  if (!vault.unlocked()) return null;
  if (objectURLs.has(id)) return objectURLs.get(id)!;
  const file = await readFile(id);
  // Only raster images are rendered in the galaxy; uploaded SVG/HTML cannot execute.
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return null;
  const url = URL.createObjectURL(file);
  objectURLs.set(id, url);
  return url;
}
export function clearPrivateMedia() { objectURLs.forEach(URL.revokeObjectURL); objectURLs.clear(); }
async function galaxy(row: GalaxyRecord): Promise<Galaxy> {
  return { id: row.id, nama: row.target_label, kategori: row.custom_category || row.target_kind.replaceAll("_", "-"),
    kind: row.kind, warna: row.color, radius: row.radius, count: row.particle_count,
    foto: row.visual_ref ? await photoURL(row.visual_ref) : null, dibuat: Date.parse(row.created_at), sendiri: true, seed: false };
}
function message(row: MessageRecord): Message {
  return { jenis: row.entry_type === "prayer" ? "doa" : "pesan", id: row.id, galaksiId: row.constellation_ids[0] || "", galaksiIds: row.constellation_ids, privasi: row.visibility === "public_anon" ? "publik" : row.visibility === "unlisted" ? "unlisted" : "privat", isi: row.payload,
    tanggal: row.date_label, mood: row.mood, tag: row.tags, dibuat: Date.parse(row.created_at), sendiri: row.is_mine !== false,
    piringan: true, seed: false, pendoa: { total: row.prayer_count, tradisi: {} }, attachmentIds: row.attachment_ids, publicBody: row.public_body, moderationStatus: row.moderation_status, empathyCount: row.empathy_count };
}
async function listGalaksi() {
  await ready();
  if (!currentUser()) return [];
  return Promise.all((await allPages<GalaxyRecord>("/constellations")).map(galaxy));
}
async function getGalaksi(id: string) { return galaxy(await cached<GalaxyRecord>(`/constellations/${id}`)); }
async function saveGalaksi(input: Partial<Galaxy> & { nama: string; kategori?: string }) {
  requireUser();
  let visualRef: string | null = null;
  if (input.foto) {
    if (!input.foto.startsWith("data:image/")) throw new Error("Format foto tidak valid.");
    const blob = await (await fetch(input.foto)).blob();
    visualRef = await upload(new File([blob], "foto.jpg", { type: "image/jpeg" }));
  }
  const category = input.kategori || "seseorang";
  const row = await api<GalaxyRecord>(input.id ? `/constellations/${input.id}` : "/constellations", {
    method: input.id ? "PATCH" : "POST",
    body: JSON.stringify({ target_label: input.nama, target_kind: categories[category] || "custom",
      custom_category: categories[category] ? null : category, visual_type: visualRef ? "photo" : "light_symbol",
      visual_ref: visualRef, kind: input.kind || "spiral", color: input.warna || "#ffd9a0",
      radius: input.radius || 140, particle_count: input.count || 8500 }),
  });
  await invalidate();
  return galaxy(row);
}
async function listPesan(galaksiId?: string) {
  await ready(); if (!currentUser()) return [];
  return (await allPages<MessageRecord>(galaksiId ? `/constellations/${galaksiId}/messages` : "/dashboard/messages")).map(message);
}
async function simpanPesan(input: { galaksiId: string; galaksiIds?: string[]; teks: string; jenis?: "pesan" | "doa"; privasi?: string; tanggal?: string; mood?: string; tag?: string[]; attachments?: File[] }) {
  requireUser();
  if (!input.teks.trim() || input.teks.length > 40000) throw new Error("Isi pesan wajib 1–40.000 karakter.");
  const id = crypto.randomUUID();
  const isPublic = input.privasi === "publik" || input.privasi === "unlisted";
  const payload = isPublic ? undefined : await vault.encryptPesan(input.teks, input.privasi || "privat", id);
  const challenge = isPublic ? await requestChallenge("publish") : undefined;
  const attachmentIds = [];
  for (const file of input.attachments || []) attachmentIds.push(await upload(file));
  const row = await api<MessageRecord>("/messages", { method: "POST", body: JSON.stringify({
    id, entry_type: input.jenis === "doa" ? "prayer" : "message", constellation_ids: [...new Set(input.galaksiIds || [input.galaksiId])], visibility: input.privasi === "unlisted" ? "unlisted" : isPublic ? "public_anon" : "private", payload,
    public_body: isPublic ? input.teks : undefined, turnstile_token: challenge,
    date_label: input.tanggal || null, mood: input.mood || null, tags: input.tag || [], attachment_ids: attachmentIds,
  }) });
  await invalidate(); return message(row);
}
async function getMeta(key: string): Promise<KeyRecord | { galaksiBawaan: boolean } | null> {
  await ready();
  if (key === "kunci") return currentUser()?.encryption_record || null;
  if (key === "setelan") return { galaksiBawaan: !!currentUser()?.preferences.galaxy_background };
  return null;
}
async function setMeta(key: string, value: { galaksiBawaan?: boolean }) {
  requireUser();
  if (key !== "setelan") throw new Error("Rekaman kunci hanya dibuat saat pendaftaran.");
  await updateUser({ default_message_visibility: currentUser()!.default_message_visibility, profile_visibility: currentUser()!.profile_visibility, galaxy_background: !!value.galaksiBawaan });
}
async function listDoa(galaksiId?: string) {
  await ready(); if (!currentUser()) return [];
  const [rows, messages] = await Promise.all([cached<{id: string; message_id: string; tradition: string; prayer_type: string; created_at: string; source_attribution: string}[]>("/dashboard/prayers-received"), listPesan()]);
  return rows.flatMap(row => { const p = messages.find(p => p.id === row.message_id); return p ? p.galaksiIds.map(galaksiId => ({id: row.id, pesanId: row.message_id, galaksiId, tradisi: row.tradition, jenis: row.prayer_type, doaId: row.prayer_type, dibuat: Date.parse(row.created_at), sumber: row.source_attribution})) : []; }).filter(row => !galaksiId || row.galaksiId === galaksiId);
}
async function stats() {
  requireUser();
  const result = await cached<{ constellations: number; messages: number; written_prayers: number; prayers_received: number; prayers_given: number; by_visibility: Record<string, number> }>("/dashboard/summary");
  return { galaksi: result.constellations, pesan: result.messages, doaTertulis: result.written_prayers, pesanMasuk: 0, doaDiterima: result.prayers_received,
    doaDiberikan: result.prayers_given, privat: result.by_visibility.private || 0, publik: result.by_visibility.public_anon || 0, unlisted: result.by_visibility.unlisted || 0 };
}
export const store = {
  defaultPrivacy: () => currentUser()?.default_message_visibility === "public_anon" ? "publik" : currentUser()?.default_message_visibility === "unlisted" ? "unlisted" : "privat",
  // One extra row proves another page exists; the UI displays 30 at a time.
  explore: async (sort = "baru", offset = 0, mood = "", tag = "") => (await api<MessageRecord[]>(`/explore?sort=${sort === "doa" ? "prayers" : "new"}&offset=${offset}&limit=31&mood=${encodeURIComponent(mood)}&tag=${encodeURIComponent(tag.replace(/^#/, ""))}`)).map(message),
  prayerCatalog: async () => {
    const catalog = await api<unknown[]>("/prayers/traditions");
    window.UM.doaData.tradisi.splice(0, window.UM.doaData.tradisi.length, ...catalog);
    return catalog;
  },
  empathy: async (id: string) => api(`/messages/${id}/empathy`, { method: "POST", body: JSON.stringify({ turnstile_token: currentUser() ? undefined : await requestChallenge("empathy") }) }),
  report: async (id: string, reason: string) => api("/reports", { method: "POST", body: JSON.stringify({ message_id: id, reason, turnstile_token: currentUser() ? undefined : await requestChallenge("report") }) }),
  block: async (id: string) => { requireUser(); await api("/users/blocks", { method: "POST", body: JSON.stringify({ message_id: id }) }); await invalidate(); },
  ready, identitas: async () => currentUser(), listGalaksi, getGalaksi, saveGalaksi, saveGalaksiBaru: saveGalaksi,
  listPesan, getPesan: async (id: string) => message(await cached<MessageRecord>(`/messages/${id}`)), simpanPesan,
  bacaIsi: (item: Message) => item.privasi !== "privat" ? Promise.resolve(item.publicBody) : vault.decryptPesan(item.isi), getMeta, setMeta, stats, listDoa,
  pesanTitik: async () => null, listPesanSabuk: async () => [],
  doaPerGalaksi: async () => {const rows=await listDoa();return rows.reduce<Record<string,number>>((counts,row)=>{counts[row.galaksiId]=(counts[row.galaksiId]||0)+1;return counts;},{});},
  preparePrayer: async (gid: string, id?: string) => {
    const catalog = await api<unknown[]>("/prayers/traditions");
    window.UM.doaData.tradisi.splice(0, window.UM.doaData.tradisi.length, ...catalog);
    if (id?.startsWith("prayer-")) throw new Error("Pilih pesan asal untuk mengirim doa.");
    if (id) { const p = await api<MessageRecord>(`/messages/${id}`); if(p.visibility !== "public_anon" || p.moderation_status !== "approved") throw new Error("Doa tersedia untuk pesan publik yang telah disetujui."); return id; }
    const candidates = await listPesan(gid); const p = candidates.find(p => p.privasi === "publik" && p.moderationStatus === "approved");
    if (!p) throw new Error("Galaksi ini belum memiliki pesan publik yang disetujui."); return p.id;
  },
  startPrayer: async (id: string, catalog_id: string) => api<{ playback_token: string; seconds: number; audio_url: string | null }>(`/messages/${id}/prayers/start`, { method: "POST", body: JSON.stringify({ catalog_id, turnstile_token: currentUser() ? undefined : await requestChallenge("prayer") }) }),
  addDoa: async (id: string, playback_token: string) => { const result = await api(`/messages/${id}/prayers`, { method: "POST", body: JSON.stringify({ playback_token }) }); await invalidate(); return result; },
  upload, readFile,
};
