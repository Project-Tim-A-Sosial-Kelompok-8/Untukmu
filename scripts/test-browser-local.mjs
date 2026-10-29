/** Run real web+API processes in one local test environment (isolated SQLite and storage). */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const web = resolve(root, "frontend");
const temporaryRoot = resolve(tmpdir());
const interrupted = new AbortController();
const children = [];
let fixtureDirectory;
let logs = "";
let failure = "";
let serviceError = null;
let cleaningUp = false;

async function freePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}

function runChild(command, args, options, isService = false) {
  interrupted.signal.throwIfAborted();
  const child = spawn(command, args, {
    ...options,
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  const record = {
    child,
    groupPid: process.platform !== "win32" ? child.pid : null,
    exited: false,
    error: null,
    stopping: null,
    closed: null,
  };
  record.closed = new Promise((done) => {
    child.on("error", (error) => {
      record.error = error;
      if (isService) serviceError = error;
    });
    child.once("exit", (code, signal) => {
      record.exited = true;
      if (isService && !cleaningUp && !interrupted.signal.aborted)
        serviceError = record.error || new Error(`Test service exited: ${code ?? signal}`);
    });
    child.once("close", (code, signal) => {
      record.exited = true;
      done({ code, signal, error: record.error });
    });
  });
  children.push(record);
  if (isService)
    for (const stream of [child.stdout, child.stderr])
      stream.on("data", (bytes) => {
        logs += bytes.toString();
      });
  return record;
}

function signalChild(record, signal) {
  if (record.groupPid) {
    try {
      // Each detached child owns this group; descendants share its lifetime.
      process.kill(-record.groupPid, signal);
      return;
    } catch (error) {
      if (error.code !== "ESRCH" && error.code !== "EPERM") throw error;
    }
  }
  if (!record.exited) record.child.kill(signal);
}

function requestStop(record) {
  if (record.stopping || (record.exited && !record.groupPid)) return;
  if (process.platform === "win32" && record.child.pid) {
    // Stop only this runner's process tree, including Playwright's browser.
    const killer = spawn("taskkill", ["/PID", String(record.child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    record.stopping = new Promise((done) => {
      killer.once("error", () => {
        record.child.kill("SIGTERM");
        done();
      });
      killer.once("close", (code) => {
        if (code) record.child.kill("SIGTERM");
        done();
      });
    });
  } else {
    signalChild(record, "SIGTERM");
    record.stopping = Promise.resolve();
  }
}

async function waitForCommand(record) {
  interrupted.signal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(interrupted.signal.reason);
    interrupted.signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([record.closed, aborted]);
  } finally {
    interrupted.signal.removeEventListener("abort", onAbort);
  }
}

async function waitForClose(record, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      record.closed.then(() => true),
      new Promise((done) => {
        timer = setTimeout(() => done(false), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopChildren() {
  cleaningUp = true;
  children.forEach(requestStop);
  const results = await Promise.allSettled(
    children.map(async (record) => {
      if (!(await waitForClose(record, 5000))) signalChild(record, "SIGKILL");
      if (!(await waitForClose(record, 5000)))
        throw new Error(`Test process belum berhenti: ${record.child.pid}`);
      // A CLI may exit before a descendant does; release the rest of its group.
      if (record.groupPid) signalChild(record, "SIGKILL");
      await record.stopping;
    }),
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

function onInterrupt(signal) {
  if (interrupted.signal.aborted) return;
  process.exitCode = signal === "SIGINT" ? 130 : 143;
  interrupted.abort(new Error(`Browser test dihentikan (${signal}).`));
  children.forEach(requestStop);
}
const onSigint = () => onInterrupt("SIGINT");
const onSigterm = () => onInterrupt("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

try {
  const apiPort = await freePort();
  let webPort = await freePort();
  while (webPort === apiPort) webPort = await freePort();
  interrupted.signal.throwIfAborted();
  const baseURL = `http://127.0.0.1:${webPort}`;
  fixtureDirectory = await mkdtemp(resolve(temporaryRoot, "untukmu-browser-"));
  interrupted.signal.throwIfAborted();
  const standaloneRoot = resolve(fixtureDirectory, "standalone");
  const standalone = resolve(standaloneRoot, "frontend");
  const apiBinary = resolve(
    fixtureDirectory,
    process.platform === "win32" ? "untukmu.exe" : "untukmu",
  );
  const environment = {
    ...process.env,
    UNTUKMU_BROWSER_TEST: "1",
    UNTUKMU_TEST_BASE_URL: baseURL,
    UNTUKMU_TEST_API_BIN: apiBinary,
    UNTUKMU_BROWSER_DATABASE: resolve(fixtureDirectory, "browser-test.db"),
    // Test-only API configuration; never read from the developer's .env.
    ENVIRONMENT: "test",
    APP_ORIGIN: baseURL,
    LISTEN_ADDR: `127.0.0.1:${apiPort}`,
    // Never the developer's Neon database: an empty URL selects SQLite.
    DATABASE_URL: "",
    DATABASE_PATH: resolve(fixtureDirectory, "browser-test.db"),
    STORAGE_DIR: resolve(fixtureDirectory, "storage"),
    JWT_SECRET: "browser-test-secret-not-for-production-0123456789",
    CONTENT_ENCRYPTION_KEY: "",
    TURNSTILE_SECRET: "",
    METRICS_TOKEN: "",
  };

  const build = runChild("go", ["build", "-o", apiBinary, "./cmd/untukmu"], {
    cwd: resolve(root, "backend"),
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  const built = await waitForCommand(build);
  if (built.error || built.code) throw built.error || new Error("go build gagal.");

  // Every run owns its build fixture and database. The project's standalone
  // manifest stays untouched even if setup fails or the runner is interrupted.
  await cp(resolve(web, ".next/standalone"), standaloneRoot, { recursive: true });
  interrupted.signal.throwIfAborted();
  await cp(resolve(web, "public"), resolve(standalone, "public"), { recursive: true });
  interrupted.signal.throwIfAborted();
  await cp(resolve(web, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
  interrupted.signal.throwIfAborted();
  const manifestPath = resolve(standalone, ".next/routes-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const rules of Object.values(manifest.rewrites))
    for (const rule of rules) {
      if (rule.source === "/api/v1/:path*")
        rule.destination = `http://127.0.0.1:${apiPort}/api/v1/:path*`;
    }
  await writeFile(manifestPath, JSON.stringify(manifest));
  interrupted.signal.throwIfAborted();

  runChild(
    apiBinary,
    ["serve"],
    { cwd: fixtureDirectory, env: environment, stdio: ["ignore", "pipe", "pipe"] },
    true,
  );
  runChild(
    process.execPath,
    [resolve(standalone, "server.js")],
    {
      cwd: standalone,
      env: { ...environment, PORT: String(webPort), HOSTNAME: "127.0.0.1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
    true,
  );
  for (const url of [
    `http://127.0.0.1:${apiPort}/api/v1/capabilities`,
    `${baseURL}/api/v1/capabilities`,
    baseURL,
  ]) {
    const deadline = Date.now() + 60000;
    while (true) {
      interrupted.signal.throwIfAborted();
      if (serviceError) throw serviceError;
      if (Date.now() > deadline) throw new Error("Test server belum siap: " + url);
      try {
        const signal = AbortSignal.any([interrupted.signal, AbortSignal.timeout(1500)]);
        if ((await fetch(url, { signal })).ok) break;
      } catch {
        interrupted.signal.throwIfAborted();
        /* service is starting */
      }
      await delay(200, undefined, { signal: interrupted.signal });
    }
  }
  const scriptPath = "/visual/ui.js";
  if (
    (await (
      await fetch(baseURL + scriptPath, {
        signal: AbortSignal.any([interrupted.signal, AbortSignal.timeout(1500)]),
      })
    ).text()) !== (await readFile(resolve(web, "public" + scriptPath), "utf8"))
  )
    throw new Error("Test server menyajikan engine yang berbeda dari hasil build.");
  console.log(`Browser test terisolasi: ${baseURL}`);
  const command = runChild(
    process.execPath,
    [resolve(root, "node_modules/@playwright/test/cli.js"), "test", ...process.argv.slice(2)],
    { cwd: web, env: environment, stdio: "inherit" },
  );
  const result = await waitForCommand(command);
  interrupted.signal.throwIfAborted();
  if (result.error) throw result.error;
  process.exitCode = result.code ?? 1;
} catch (error) {
  failure = error instanceof Error ? error.stack : String(error);
  if (!interrupted.signal.aborted) {
    process.exitCode = 1;
    console.error(failure);
  }
} finally {
  let processesStopped = false;
  try {
    await stopChildren();
    processesStopped = true;
  } catch (error) {
    process.exitCode ||= 1;
    failure += "\n" + (error instanceof Error ? error.stack : String(error));
    console.error(`Cleanup proses gagal; fixture dipertahankan: ${fixtureDirectory}`, error);
  }
  try {
    if (process.exitCode) {
      // Preserve earlier API exceptions after long browser runs and setup failures.
      await mkdir(resolve(web, "test-results"), { recursive: true });
      await writeFile(
        resolve(web, "test-results/browser-service.log"),
        logs + (failure ? "\n" + failure + "\n" : ""),
      );
      if (logs) process.stderr.write(logs.split(/\r?\n/).slice(-80).join("\n") + "\n");
    }
  } finally {
    try {
      if (fixtureDirectory && processesStopped) {
        const target = resolve(fixtureDirectory);
        if (
          dirname(target) !== temporaryRoot ||
          !target.startsWith(temporaryRoot + sep) ||
          !basename(target).startsWith("untukmu-browser-")
        )
          throw new Error("Invalid browser test cleanup path: " + target);
        await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      }
    } finally {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    }
  }
}
