interface SupportMessage { privasi: string; moderationStatus?: string; releaseAt?: string | null }

export function supportStatus(message: SupportMessage, now = Date.now()) {
  if (message.privasi !== "publik") return {available:false,reason:message.privasi === "unlisted"
    ? "Pesan ini memakai tautan terbatas. Empati dan doa tersedia pada ucapan publik yang disetujui."
    : "Pesan ini privat. Empati dan doa tersedia pada ucapan publik yang disetujui."};
  if (message.moderationStatus !== "approved") return {available:false,reason:message.moderationStatus === "pending"
    ? "Ucapan ini menunggu persetujuan moderator. Setelah disetujui, ucapan muncul di Jelajah dan bisa menerima empati serta doa."
    : "Ucapan ini belum tersedia di Jelajah. Periksa status publikasinya di Ruang Pribadi."};
  if (message.releaseAt && Date.parse(message.releaseAt) > now) return {available:false,reason:"Ucapan ini bisa menerima empati dan doa setelah waktu pembukaannya."};
  return {available:true,reason:""};
}
