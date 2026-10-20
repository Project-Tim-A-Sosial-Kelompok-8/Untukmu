const MAX_AUDIO_BYTES = 30 * 1024 * 1024;
const MIME_TYPES: Record<string, string> = {
  "audio/mpeg": "audio/mpeg",
  "audio/ogg": "audio/ogg",
  "application/ogg": "audio/ogg",
  "audio/wav": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/mp4": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
};
const EXTENSIONS: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};
export interface RecordingMetadata {
  contentType: string;
  durationSeconds: number;
}
const inspectedFiles = new WeakMap<File, Promise<RecordingMetadata>>();

export function recordingType(file: File) {
  if (file.size < 100 || file.size > MAX_AUDIO_BYTES) {
    throw new Error("Ukuran audio harus antara 100 byte dan 30 MiB.");
  }
  const contentType =
    MIME_TYPES[file.type] ||
    (!file.type && EXTENSIONS[file.name.split(".").pop()?.toLowerCase() || ""]);
  if (!contentType) throw new Error("Gunakan rekaman MP3, OGG, WAV, atau M4A.");
  return contentType;
}

export function inspectRecording(file: File): Promise<RecordingMetadata> {
  const existing = inspectedFiles.get(file);
  if (existing) return existing;
  const inspection = readRecording(file).catch((error) => {
    inspectedFiles.delete(file);
    throw error;
  });
  inspectedFiles.set(file, inspection);
  return inspection;
}

async function readRecording(file: File): Promise<RecordingMetadata> {
  const contentType = recordingType(file);
  const url = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  try {
    const durationSeconds = await new Promise<number>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error("Audio tidak dapat dibaca. Coba berkas lain.")),
        15000,
      );
      audio.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        const seconds = Math.ceil(audio.duration);
        if (!Number.isFinite(seconds) || seconds < 5 || seconds > 900) {
          reject(new Error("Durasi rekaman harus antara 5 detik dan 15 menit."));
        } else {
          resolve(seconds);
        }
      };
      audio.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Berkas audio rusak atau formatnya tidak dapat diputar."));
      };
      audio.preload = "metadata";
      audio.src = url;
    });
    return { contentType, durationSeconds };
  } finally {
    audio.onloadedmetadata = null;
    audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
