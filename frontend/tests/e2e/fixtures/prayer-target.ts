import type { Page } from "@playwright/test";

/** A public target for read-only UI tests; never inserted into the application database. */
export async function mockPrayerTarget(page: Page) {
  const target = {
    id: "00000000-0000-4000-8000-000000000008",
    entry_type: "message",
    visibility: "public_anon",
    public_body: "Pesan tujuan doa khusus pengujian antarmuka.",
    is_mine: false,
    moderation_status: "approved",
    empathy_count: 0,
    constellation_ids: [],
    payload: null,
    date_label: null,
    mood: "tenang",
    tags: ["pengujian"],
    created_at: "2026-10-10T00:00:00Z",
    prayer_count: 0,
    attachment_ids: [],
    release_at: null,
  };
  await page.route("**/api/v1/explore?*", (route) => route.fulfill({ json: [target] }));
  await page.route(`**/api/v1/messages/${target.id}`, (route) => route.fulfill({ json: target }));
}
