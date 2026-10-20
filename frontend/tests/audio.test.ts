import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { inspectRecording } from "../src/features/prayers/audio";

interface PreviewAudio {
  duration: number;
  onloadedmetadata: (() => void) | null;
  onerror: (() => void) | null;
  preload: string;
  src: string;
  removeAttribute: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
}

let duration: number;
let damaged: boolean;
let previews: PreviewAudio[];
const createObjectURL = vi.fn(() => "blob:recording-metadata");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  duration = 28.2;
  damaged = false;
  previews = [];
  vi.clearAllMocks();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  vi.stubGlobal("document", {
    createElement: vi.fn((tag: string) => {
      expect(tag).toBe("audio");
      const audio: PreviewAudio = {
        duration,
        onloadedmetadata: null,
        onerror: null,
        preload: "",
        set src(_url: string) {
          queueMicrotask(() => {
            if (damaged) audio.onerror?.();
            else audio.onloadedmetadata?.();
          });
        },
        removeAttribute: vi.fn(),
        load: vi.fn(),
      };
      previews.push(audio);
      return audio;
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function recording() {
  return new File([new Uint8Array(512)], "recording.ogg", { type: "audio/ogg" });
}

it("satu File hanya diperiksa sekali saat dipilih, disimpan, dan dicoba bersamaan", async () => {
  const file = recording();
  const first = inspectRecording(file);
  expect(inspectRecording(file)).toBe(first);
  expect(await first).toEqual({ contentType: "audio/ogg", durationSeconds: 29 });
  expect(await inspectRecording(file)).toEqual(await first);
  expect(previews).toHaveLength(1);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:recording-metadata");
  expect(previews[0].removeAttribute).toHaveBeenCalledWith("src");
  expect(previews[0].load).toHaveBeenCalledOnce();
});

it("File baru tetap diperiksa walaupun nama dan ukurannya sama", async () => {
  await inspectRecording(recording());
  duration = 40;
  expect(await inspectRecording(recording())).toEqual({
    contentType: "audio/ogg",
    durationSeconds: 40,
  });
  expect(previews).toHaveLength(2);
});

it("pemeriksaan gagal tidak disimpan dalam cache dan sumber audio dibersihkan", async () => {
  const file = recording();
  damaged = true;
  await expect(inspectRecording(file)).rejects.toThrow("Berkas audio rusak");
  expect(previews[0].onerror).toBeNull();
  expect(previews[0].onloadedmetadata).toBeNull();
  damaged = false;
  expect(await inspectRecording(file)).toEqual({ contentType: "audio/ogg", durationSeconds: 29 });
  expect(previews).toHaveLength(2);
  expect(revokeObjectURL).toHaveBeenCalledTimes(2);
});
