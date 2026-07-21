import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createDictionaryStore } from "../src/dictionary.js";

test("createDictionaryStore lookups a word from a prefix file", async (t) => {
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
      const result = await store.lookup("nonexistent");
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

test("lazy loading: prefix file not read until first lookup, read only once", async () => {
  const calls = [];
  const store = createDictionaryStore("/dummy", {
    readFile: async (path) => {
      calls.push(path);
      if (path === "/dummy/te.json") {
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
  const data = {
    "/d/aa.json": JSON.stringify({ aaword: "aa翻译" }),
    "/d/bb.json": JSON.stringify({ bbword: "bb翻译" }),
    "/d/cc.json": JSON.stringify({ ccword: "cc翻译" }),
  };

  const store = createDictionaryStore("/d", {
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
  assert.deepEqual(calls, ["/d/aa.json", "/d/bb.json"]);

  // Access aa again so bb becomes LRU.
  await store.lookup("aaword");
  assert.equal(calls.length, 2, "aa should be cached, no re-read");

  // Load cc — evicts bb (least recently used).
  await store.lookup("ccword");
  assert.deepEqual(calls, ["/d/aa.json", "/d/bb.json", "/d/cc.json"]);

  // bb should reload from reader (was evicted).
  await store.lookup("bbword");
  assert.deepEqual(calls, [
    "/d/aa.json",
    "/d/bb.json",
    "/d/cc.json",
    "/d/bb.json",
  ], "evicted bb should be reloaded");
});

test("cache capacity respects maxSize", async () => {
  // Create a store with maxSize=1 and verify only 1 entry stays cached.
  const calls = [];
  const store = createDictionaryStore("/d", {
    maxSize: 1,
    readFile: async (path) => {
      calls.push(path);
      if (path === "/d/aa.json") return JSON.stringify({ aaword: "aa" });
      if (path === "/d/bb.json") return JSON.stringify({ bbword: "bb" });
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
  });

  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 1);

  assert.equal(await store.lookup("hello"), null);
  assert.equal(calls.length, 2, "fs errors should not be cached");
});
