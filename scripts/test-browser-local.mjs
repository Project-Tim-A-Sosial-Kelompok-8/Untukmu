/** Run real web+API processes in one local test environment (SQLite/fakeredis only). */
import { spawn } from "node:child_process";
import { cp, readFile, writeFile, mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "apps/web");
const standalone = resolve(web, ".next/standalone/apps/web");
async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", done); });
  const port = server.address().port;
  await new Promise(done => server.close(done));
  return port;
}
const apiPort = await freePort();
let webPort = await freePort();
while (webPort === apiPort) webPort = await freePort();
const baseURL = `http://127.0.0.1:${webPort}`;
const databaseDirectory = await mkdtemp(resolve(tmpdir(), "untukmu-browser-"));
const environment = { ...process.env, UNTUKMU_BROWSER_TEST: "1", UNTUKMU_TEST_BASE_URL: baseURL,
  UNTUKMU_BROWSER_DATABASE: resolve(databaseDirectory, "browser-test.db") };
await cp(resolve(web, "public"), resolve(standalone, "public"), { recursive: true });
await cp(resolve(web, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
// Override only the generated standalone fixture, never the source config or
// production build manifest. Restore it when this test run finishes.
const manifestPath = resolve(standalone, ".next/routes-manifest.json");
const originalManifest = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(originalManifest);
for (const rules of Object.values(manifest.rewrites)) for (const rule of rules) {
  if (rule.source === "/api/v1/:path*") rule.destination = `http://127.0.0.1:${apiPort}/api/v1/:path*`;
}
await writeFile(manifestPath, JSON.stringify(manifest));
const children = [];
let logs = "";
let serviceError = null;
function service(command, args, options) {
  const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => { logs += bytes.toString(); });
  child.on("error", error => { serviceError = error; });
  child.on("exit", (code, signal) => { serviceError = new Error(`Test service exited: ${code ?? signal}`); });
  children.push(child);
  return child;
}
service(process.env.UNTUKMU_TEST_PYTHON || "python", ["-m", "uvicorn", "tests.browser_server:app", "--host", "127.0.0.1", "--port", String(apiPort)], { cwd: resolve(root, "apps/api"), env: environment });
service(process.execPath, [resolve(standalone, "server.js")], { cwd: standalone, env: { ...environment, PORT: String(webPort), HOSTNAME: "127.0.0.1" } });
try {
  for (const url of [`${baseURL}/api/v1/capabilities`, baseURL]) {
    const deadline = Date.now() + 60000;
    while (true) {
      if (serviceError) throw serviceError;
      if (Date.now() > deadline) throw new Error("Test server belum siap: " + url);
      try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) break; } catch { /* service is starting */ }
      await new Promise(done => setTimeout(done, 200));
    }
  }
  const scriptPath = "/engine/untukmu/js/um-ui.js";
  if (await (await fetch(baseURL + scriptPath)).text() !== await readFile(resolve(web, "public" + scriptPath), "utf8")) throw new Error("Test server menyajikan engine yang berbeda dari hasil build.");
  console.log(`Browser test terisolasi: ${baseURL}`);
  const command = spawn(process.execPath, [resolve(root, "node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)], { cwd: web, env: environment, stdio: "inherit" });
  process.exitCode = await new Promise((done, reject) => { command.on("error", reject); command.on("exit", code => done(code ?? 1)); });
  if (process.exitCode) process.stderr.write(logs);
} catch (error) {
  process.stderr.write(logs);
  throw error;
} finally { children.forEach(child => child.kill("SIGTERM")); await writeFile(manifestPath, originalManifest); }
