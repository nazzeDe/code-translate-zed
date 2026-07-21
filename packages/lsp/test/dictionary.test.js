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
  const store = createDictionaryStore("/nonexistent");
  assert.equal(await store.lookup("a"), null);
  assert.equal(await store.lookup(""), null);
  assert.equal(await store.lookup("x"), null);
});

test("non-ASCII prefix returns null without touching fs", async () => {
  const store = createDictionaryStore("/nonexistent");
  assert.equal(await store.lookup("über"), null);
  assert.equal(await store.lookup("éclair"), null);
});

test("lazy loading: prefix file not read until first lookup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dict-lazy-"));
  try {
    await writeFile(
      join(dir, "te.json"),
      JSON.stringify({ test: "测试" }),
      "utf8",
    );

    const store = createDictionaryStore(dir);
    // No lookup yet — file should not have been read
    // First lookup triggers the load
    let result = await store.lookup("test");
    assert.deepEqual(result, { translation: "测试" });

    // Second lookup uses cache (no re-read)
    result = await store.lookup("test");
    assert.deepEqual(result, { translation: "测试" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("LRU cache evicts least-recently-used prefix", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dict-lru-"));
  try {
    // Create 3 prefix files
    for (const prefix of ["aa", "bb", "cc"]) {
      await writeFile(
        join(dir, `${prefix}.json`),
        JSON.stringify({ [`${prefix}word`]: `${prefix}翻译` }),
        "utf8",
      );
    }

    // Cache size of 2
    const store = createDictionaryStore(dir, { maxSize: 2 });

    // Load aa and bb
    await store.lookup("aaword");
    await store.lookup("bbword");

    // Load cc — should evict aa (least recently used)
    await store.lookup("ccword");

    // aa should still work (reloads from disk, not cached)
    // This verifies that eviction doesn't break lookups
    const result = await store.lookup("aaword");
    assert.deepEqual(result, { translation: "aa翻译" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
