import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getZedExtensionWorkDirectory,
  parseArguments,
} from "../scripts/bootstrap.mjs";

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
