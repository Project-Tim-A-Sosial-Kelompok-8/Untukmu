import { cp, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const target = resolve(".next/standalone/frontend");
await access(resolve(target, "server.js"));
await cp(resolve("public"), resolve(target, "public"), { recursive: true });
await cp(resolve(".next/static"), resolve(target, ".next/static"), { recursive: true });
const child = spawn(process.execPath, [resolve(target, "server.js")], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => { process.exitCode = code || 0; });
