import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createDictionaryStore } from "../src/dictionary.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("createDictionaryStore looks up a word from a prefix file", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "dict-test-"));
  try {
    await writeFile(
      join(dir, "he.json"),
      JSON.stringify({ hello: "你好", help: "帮助" }),
      "utf8",
    );
    await writeFile(
      join(dir, "ab.json"),
      JSON.stringify({
        ab: { w: "AB", p: "eɪbiː", t: "[医] 抗体" },
      }),
      "utf8",
    );

    const store = createDictionaryStore(dir);

    await t.test("string entry returns translation", async () => {
      const result = await store.lookup("hello");
      assert.deepEqual(result, { translation: "你好" });
    });

    await t.test("case-insensitive lookup", async () => {
      const result = await store.lookup("HELLO");
      assert.deepEqual(result, { translation: "你好" });
    });

    await t.test("object entry returns normalized fields", async () => {
      const result = await store.lookup("ab");
      assert.deepEqual(result, {
        word: "AB",
        phonetic: "eɪbiː",
        translation: "[医] 抗体",
      });
    });

    await t.test("missing word returns null", async () => {
      const result = await store.lookup("hero");
      assert.equal(result, null);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("words shorter than 2 ASCII letters return null without touching fs", async () => {
  // Using a reader that throws to prove fs is never called.
  const store = createDictionaryStore("/nonexistent", {
    readFile: () => {
      throw new Error("fs should not be called");
    },
  });
  assert.equal(await store.lookup("a"), null);
  assert.equal(await store.lookup(""), null);
  assert.equal(await store.lookup("x"), null);
});

test("non-ASCII prefix returns null without touching fs", async () => {
  const store = createDictionaryStore("/nonexistent", {
    readFile: () => {
      throw new Error("fs should not be called");
    },
  });
  assert.equal(await store.lookup("über"), null);
  assert.equal(await store.lookup("éclair"), null);
});

test("cache capacity must be a positive safe integer", () => {
  for (const maxSize of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => createDictionaryStore("/unused", { maxSize }),
      /maxSize must be a positive safe integer/,
    );
  }
});

test("lazy loading: prefix file not read until first lookup, read only once", async () => {
  const calls = [];
  const dictDir = "dummy";
  const testFile = join(dictDir, "te.json");
  const store = createDictionaryStore(dictDir, {
    readFile: async (path) => {
      calls.push(path);
      if (path === testFile) {
        return JSON.stringify({ test: "测试" });
      }
      throw new Error(`unexpected path: ${path}`);
    },
  });

  // No lookups yet — reader should not have been called.
  assert.deepEqual(calls, []);

  // First lookup triggers the load.
  let result = await store.lookup("test");
  assert.deepEqual(result, { translation: "测试" });
  assert.equal(calls.length, 1);

  // Second lookup uses cache (no re-read).
  result = await store.lookup("test");
  assert.deepEqual(result, { translation: "测试" });
  assert.equal(calls.length, 1, "second lookup should not call reader");
});

test("LRU eviction: evicted prefix is reloaded from reader on next access", async () => {
  const calls = [];
  const dictDir = "d";
  const aaFile = join(dictDir, "aa.json");
  const bbFile = join(dictDir, "bb.json");
  const ccFile = join(dictDir, "cc.json");
  const data = {
    [aaFile]: JSON.stringify({ aaword: "aa翻译" }),
    [bbFile]: JSON.stringify({ bbword: "bb翻译" }),
    [ccFile]: JSON.stringify({ ccword: "cc翻译" }),
  };

  const store = createDictionaryStore(dictDir, {
    maxSize: 2,
    readFile: async (path) => {
      calls.push(path);
      if (data[path] !== undefined) return data[path];
      throw new Error(`unexpected path: ${path}`);
    },
  });

  // Load aa and bb.
  await store.lookup("aaword");
  await store.lookup("bbword");
  assert.deepEqual(calls, [aaFile, bbFile]);

  // Access aa again so bb becomes LRU.
  await store.lookup("aaword");
  assert.equal(calls.length, 2, "aa should be cached, no re-read");

  // Load cc — evicts bb (least recently used).
  await store.lookup("ccword");
  assert.deepEqual(calls, [aaFile, bbFile, ccFile]);

  // bb should reload from reader (was evicted).
  await store.lookup("bbword");
  assert.deepEqual(
    calls,
    [aaFile, bbFile, ccFile, bbFile],
    "evicted bb should be reloaded",
  );
});

test("cache capacity respects maxSize", async () => {
  const calls = [];
  const dictDir = "d";
  const aaFile = join(dictDir, "aa.json");
  const bbFile = join(dictDir, "bb.json");
  const store = createDictionaryStore(dictDir, {
    maxSize: 1,
    readFile: async (path) => {
      calls.push(path);
      if (path === aaFile) return JSON.stringify({ aaword: "aa" });
      if (path === bbFile) return JSON.stringify({ bbword: "bb" });
      throw new Error(`unexpected: ${path}`);
    },
  });

  await store.lookup("aaword");
  assert.equal(calls.length, 1);

  await store.lookup("bbword"); // evicts aa
  assert.equal(calls.length, 2);

  // aa should reload since it was evicted.
  await store.lookup("aaword");
  assert.equal(calls.length, 3);
});

test("missing file (ENOENT) returns null and is not cached", async () => {
  const calls = [];
  const store = createDictionaryStore("/d", {
    readFile: async (path) => {
      calls.push(path);
      const err = new Error("ENOENT: no such file");
      err.code = "ENOENT";
      throw err;
    },
    onLoadError: () => {},
  });

  // First attempt: null, reader called.
  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 1);

  // Second attempt: still null, reader called again (not cached).
  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 2, "failed loads should not be cached");
});

test("invalid JSON returns null and is not cached", async () => {
  const calls = [];
  const store = createDictionaryStore("/d", {
    readFile: async (path) => {
      calls.push(path);
      return "not valid json {{{";
    },
    onLoadError: () => {},
  });

  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 1);

  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 2, "invalid JSON should not be cached");
});

test("filesystem error returns null and is not cached", async () => {
  const calls = [];
  const store = createDictionaryStore("/d", {
    readFile: async (path) => {
      calls.push(path);
      const err = new Error("EACCES: permission denied");
      err.code = "EACCES";
      throw err;
    },
    onLoadError: () => {},
  });

  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 1);

  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 2, "fs errors should not be cached");
});

test("failed loads report prefix context without caching the failure", async () => {
  const diagnostics = [];
  const failure = Object.assign(new Error("permission denied"), {
    code: "EACCES",
  });
  const store = createDictionaryStore("/d", {
    readFile: async () => {
      throw failure;
    },
    onLoadError: (diagnostic) => diagnostics.push(diagnostic),
  });

  assert.equal(await store.lookup("hello"), null);
  assert.equal(await store.lookup("help"), null);
  assert.deepEqual(diagnostics, [
    { prefix: "he", error: failure },
    { prefix: "he", error: failure },
  ]);
});

test("default load diagnostics use stderr without writing to stdout", () => {
  const dictionaryModule = pathToFileURL(
    join(packageRoot, "src", "dictionary.js"),
  ).href;
  const program = `
    import { createDictionaryStore } from ${JSON.stringify(dictionaryModule)};
    const store = createDictionaryStore("/d", {
      readFile: async () => {
        throw Object.assign(new Error("permission denied"), { code: "EACCES" });
      },
    });
    await store.lookup("hello");
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", program],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /Failed to load dictionary he\.json \[EACCES\]: permission denied/,
  );
});

test("translation-less and malformed entries are dictionary misses", async () => {
  const store = createDictionaryStore("/d", {
    readFile: async () =>
      JSON.stringify({
        abnull: null,
        abmissing: { w: "ABMissing", t: null },
        abnumber: { t: 42 },
      }),
  });

  assert.equal(await store.lookup("abnull"), null);
  assert.equal(await store.lookup("abmissing"), null);
  assert.equal(await store.lookup("abnumber"), null);
});

test("packaged dictionary normalizes entries and escaped line breaks", async () => {
  const store = createDictionaryStore(join(packageRoot, "dict"));

  assert.deepEqual(await store.lookup("hello"), {
    translation: "interj. 喂, 嘿",
    phonetic: "hә'lәu",
  });

  const abandon = await store.lookup("abandon");
  assert.ok(abandon.translation.includes("\n"));
  assert.ok(!abandon.translation.includes("\\n"));

  assert.equal(await store.lookup("absconce"), null);
  assert.equal(await store.lookup("adamatic"), null);
});
