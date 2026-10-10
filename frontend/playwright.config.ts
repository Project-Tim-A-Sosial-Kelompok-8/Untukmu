import { chromium, defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const localEdge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === "win32" && !existsSync(chromium.executablePath()) && existsSync(localEdge) ? localEdge : undefined);
export default defineConfig({
  testDir: "tests/e2e", outputDir: "test-results/runs", timeout: 120000, workers: 1, fullyParallel: false,
  expect: { timeout: 20000 },
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: process.env.UNTUKMU_BROWSER_REPORT || "test-results/browser-results.json" }]],
  use: { baseURL: process.env.UNTUKMU_TEST_BASE_URL || "http://localhost:3000", viewport: { width: 1280, height: 800 }, timezoneId: "Asia/Jakarta",
    launchOptions: { executablePath: executable, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"] },
    trace: "retain-on-failure", screenshot: "only-on-failure" },
});
