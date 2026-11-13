// Compila lenz-daemon en release y lo copia como sidecar de Tauri:
// apps/desktop/src-tauri/binaries/lenz-daemon-<target-triple>[.exe]
// Lo ejecuta `beforeBuildCommand` de tauri.release.conf.json (Tauri define TAURI_ENV_TARGET_TRIPLE).

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "apps", "desktop", "src-tauri", "binaries");

const hostTriple = /host: (\S+)/.exec(execFileSync("rustc", ["-vV"]).toString())?.[1];
const triple = process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple;
if (!triple) throw new Error("No se pudo determinar el target triple");

const ext = triple.includes("windows") ? ".exe" : "";

function build(target) {
  execFileSync("cargo", ["build", "--release", "-p", "lenz-daemon", "--target", target], {
    cwd: root,
    stdio: "inherit",
  });
  return join(root, "target", target, "release", `lenz-daemon${ext}`);
}

mkdirSync(outDir, { recursive: true });
const dest = join(outDir, `lenz-daemon-${triple}${ext}`);

if (triple === "universal-apple-darwin") {
  const arm = build("aarch64-apple-darwin");
  const intel = build("x86_64-apple-darwin");
  execFileSync("lipo", ["-create", "-output", dest, arm, intel], { stdio: "inherit" });
} else {
  copyFileSync(build(triple), dest);
}

console.log(`sidecar listo: ${dest}`);
