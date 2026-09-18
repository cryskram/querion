#!/usr/bin/env node
/**
 * Prisma CLI wrapper.
 *
 * On NixOS, Prisma cannot download prebuilt engines. This wrapper locates
 * `prisma-engines` from nixpkgs and points Prisma at the schema engine before
 * delegating to the real CLI. On every other platform it is a transparent
 * pass-through (engines download as usual).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

function nixEngineEnv() {
  if (process.env.PRISMA_SCHEMA_ENGINE_BINARY) return {};
  if (process.platform !== "linux") return {};
  if (!existsSync("/nix")) return {};

  const build = spawnSync(
    "nix",
    ["build", "--no-link", "--print-out-paths", "nixpkgs#prisma-engines"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );
  if (build.status !== 0) return {};

  const storePath = (build.stdout || "").trim().split("\n").filter(Boolean).pop();
  if (!storePath) return {};

  const env = {};
  const mapping = {
    PRISMA_SCHEMA_ENGINE_BINARY: `${storePath}/bin/schema-engine`,
    PRISMA_QUERY_ENGINE_BINARY: `${storePath}/bin/query-engine`,
    PRISMA_QUERY_ENGINE_LIBRARY: `${storePath}/lib/libquery_engine.node`,
    PRISMA_FMT_BINARY: `${storePath}/bin/prisma-fmt`,
  };
  for (const [key, value] of Object.entries(mapping)) {
    if (existsSync(value)) env[key] = value;
  }
  return env;
}

const result = spawnSync(
  process.execPath,
  [prismaCli, ...process.argv.slice(2)],
  { stdio: "inherit", env: { ...process.env, ...nixEngineEnv() } },
);

process.exit(result.status ?? 1);
