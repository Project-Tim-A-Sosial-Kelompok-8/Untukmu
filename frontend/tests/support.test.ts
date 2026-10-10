import { expect, it } from "vitest";
import { normalizeMood, normalizeTag, normalizeTags } from "../src/lib/messages/metadata";
import { supportStatus } from "../src/lib/messages/support";

it.each([
  {privasi:"privat",moderationStatus:"not_applicable"},
  {privasi:"unlisted",moderationStatus:"not_applicable"},
  {privasi:"publik",moderationStatus:"pending"},
  {privasi:"publik",moderationStatus:"rejected"},
  {privasi:"publik",moderationStatus:"removed"},
  {privasi:"publik",moderationStatus:"approved",releaseAt:"2026-10-11T00:00:00Z"},
])("empati dan doa tidak tersedia pada pesan $privasi / $moderationStatus / $releaseAt", message => {
  const result = supportStatus(message, Date.parse("2026-10-10T00:00:00Z"));
  expect(result.available).toBe(false);
  expect(result.reason).toBeTruthy();
});

it("ucapan publik yang disetujui dapat menerima dukungan setelah jadwal pembukaan", () => {
  expect(supportStatus({privasi:"publik",moderationStatus:"approved",releaseAt:"2026-10-09T00:00:00Z"}, Date.parse("2026-10-10T00:00:00Z"))).toEqual({available:true,reason:""});
});

it("tag dan suasana tetap cocok meskipun memakai #, spasi, huruf besar, atau label bahasa Inggris", () => {
  expect(normalizeTag("  #KeNaNgAn  ")).toBe("kenangan");
  expect(normalizeTags(["#Syukur", " syukur ", "＃KENANGAN"])).toEqual(["syukur","kenangan"]);
  expect(normalizeMood(" Longing ")).toBe("rindu");
});
