import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e", timeout: 120000, workers: 1, fullyParallel: false,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: process.env.UNTUKMU_BROWSER_REPORT || "test-results/browser-results.json" }]],
  use: { baseURL: process.env.UNTUKMU_TEST_BASE_URL || "http://localhost:3000", viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--disable-dev-shm-usage"] },
    trace: "retain-on-failure", screenshot: "only-on-failure" },
});
