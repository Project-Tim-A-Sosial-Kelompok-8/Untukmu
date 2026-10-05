import type { OriginalEngine } from "../features/galaxy/FiberBridge";
import type { store } from "../lib/api/store";
import type * as vault from "../lib/crypto/vault";

interface LegacyUM {
  doaData: { tradisi: unknown[] };
  openSocial: (mode: "report" | "block" | "admin" | "blocks", id?: string) => Promise<void>;
  openWrittenPrayer: (galaxyId?: string) => Promise<void>;
  renderScreen: (host: HTMLElement, value: unknown) => void;
  trackScreen: (host: HTMLElement | undefined, opened: boolean) => void;
  store: typeof store;
  crypto: typeof vault & { reason: () => string | null; kdfId: () => string; iterations: () => number };
  account: { require: () => Promise<boolean>; open: () => void; logout: () => Promise<void>; isLogged: () => boolean };
  ui: {
    toast: (text: string) => void; bukaKomposer: (id?: string) => void; bukaDash: () => void;
    bukaSetup: () => void; bukaSet: () => void; renderSemua: () => void;
    closeAllScreens: () => void; bukaJelajah: () => void;
    bukaDoa: (galaxyId?: string, messageId?: string) => void;
  };
  galaksi: { refresh: () => Promise<unknown>; bersihkanPilihan: () => void; setGalaksiBawaan: (value: boolean) => void; state: { galaksiBawaan: boolean } };
  sky: { refresh: () => Promise<unknown> };
}
declare global { interface Window { UM: LegacyUM; UM_ENGINE?: OriginalEngine; __UM_TESTING__?: boolean } }
