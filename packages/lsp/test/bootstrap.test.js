import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  getZedExtensionWorkDirectory,
  NPM_PACKAGE,
  parseArguments,
} from "../scripts/bootstrap.mjs";

const repositoryRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("locates the Linux extension work directory", () => {
  assert.equal(
    getZedExtensionWorkDirectory({
      platform: "linux",
      env: { HOME: "/home/developer", XDG_DATA_HOME: "/data" },
    }),
    "/data/zed/extensions/work/code-translate",
  );
});

test("locates the macOS extension work directory", () => {
  assert.equal(
    getZedExtensionWorkDirectory({
      platform: "darwin",
      env: { HOME: "/Users/developer" },
    }),
    "/Users/developer/Library/Application Support/Zed/extensions/work/code-translate",
  );
});

test("locates the Windows extension work directory", () => {
  assert.equal(
    getZedExtensionWorkDirectory({
      platform: "win32",
      env: { LOCALAPPDATA: "C:\\Users\\developer\\AppData\\Local" },
    }),
    "C:\\Users\\developer\\AppData\\Local\\Zed\\extensions\\work\\code-translate",
  );
});

test("uses an explicit work directory override", () => {
  assert.equal(
    getZedExtensionWorkDirectory({
      platform: "linux",
      env: {},
      override: "/tmp/code-translate-work",
    }),
    "/tmp/code-translate-work",
  );
});

test("the command-line work directory overrides the environment", () => {
  assert.deepEqual(
    parseArguments(["--work-dir", "/tmp/cli"], {
      ZED_EXTENSION_WORK_DIR: "/tmp/environment",
    }),
    { override: "/tmp/cli" },
  );
});

test("bootstrap reuses a matching installation without replacing its server", async () => {
  const workDirectory = await mkdtemp(join(tmpdir(), "bootstrap-test-"));
  const installedPackage = join(workDirectory, "node_modules", NPM_PACKAGE);
  const serverPath = join(installedPackage, "dist", "server.js");
  const packageMetadata = JSON.parse(
    await readFile(join(repositoryRoot, "packages/lsp/package.json"), "utf8"),
  );

  try {
    await mkdir(join(installedPackage, "dist"), { recursive: true });
    await writeFile(
      join(installedPackage, "package.json"),
      JSON.stringify({ name: NPM_PACKAGE, version: packageMetadata.version }),
      "utf8",
    );
    await writeFile(serverPath, "preinstalled server", "utf8");

    const result = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", "bootstrap", "--", "--work-dir", workDirectory],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.ok(
      result.stdout.includes(
        `Reused ${NPM_PACKAGE}@${packageMetadata.version} in ${workDirectory}`,
      ),
    );
    assert.equal(await readFile(serverPath, "utf8"), "preinstalled server");
  } finally {
    await rm(workDirectory, { recursive: true, force: true });
  }
});
