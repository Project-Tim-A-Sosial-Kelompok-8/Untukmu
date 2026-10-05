/** Build the current app and audit its controls against an isolated real API. */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "apps/web");
const env = { ...process.env, UNTUKMU_BROWSER_REPORT: process.env.UNTUKMU_BROWSER_REPORT || "../../docs/pengujian/hasil/button-audit-results.json" };

async function run(args, cwd) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit" });
  const code = await new Promise((done, reject) => { child.on("error", reject); child.on("exit", value => done(value ?? 1)); });
  if (code) process.exit(code);
}

await run([resolve(web, "scripts/prepare-engine.mjs")], web);
await run([resolve(root, "node_modules/next/dist/bin/next"), "build", "--webpack"], web);
await run([resolve(root, "scripts/test-browser-local.mjs"), ...process.argv.slice(2)], root);
