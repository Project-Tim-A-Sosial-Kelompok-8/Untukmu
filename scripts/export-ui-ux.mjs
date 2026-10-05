/** Export the actual website with demonstration accounts in an isolated API. */
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reuseBuild = process.argv.includes("--reuse-build");
const runner = reuseBuild ? "test-browser-local.mjs" : "check-buttons.mjs";
const env = { ...process.env, UNTUKMU_EXPORT_UI_UX: "1",
  UNTUKMU_BROWSER_REPORT: "../../docs/pengujian/hasil/ui-ux-full-results.json" };
async function run(script, args) {
  const child = spawn(process.execPath, [resolve(root, "scripts", script), ...args], { cwd: root, env, stdio: "inherit" });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", value => done(value ?? 1)); });
  if (code) process.exit(code);
}
await run(runner, ["ui-ux.spec.ts", "--trace", "off"]);
await run("render-ui-ux.mjs", []);
