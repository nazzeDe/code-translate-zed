import assert from "node:assert/strict";
import test from "node:test";

import { TextDocument } from "vscode-languageserver-textdocument";

import { createHoverProvider, splitIdentifier } from "../src/hover.js";

function createDocument(text) {
  return TextDocument.create(
    "file:///workspace/example.txt",
    "plaintext",
    1,
    text,
  );
}

function createProvider(lookup) {
  return createHoverProvider({ lookup });
}

test("single-word identifiers with digits produce a hover", async () => {
  const provideHover = createProvider(async (identifier) =>
    identifier === "hello1" ? { translation: "translation" } : null,
  );
  const hover = await provideHover(createDocument("hello1"), {
    line: 0,
    character: 1,
  });

  assert.equal(hover.contents.value, "**hello1**: translation");
  assert.deepEqual(hover.range, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 6 },
  });
});

test("compound identifiers split and look up each word, preserving original UTF-16 range", async () => {
  const document = createDocument('"hello_1-world",');
  const provideHover = createProvider(async (identifier) => {
    if (identifier === "hello") return { translation: "你好" };
    if (identifier === "world") return { translation: "世界" };
    return null;
  });
  const positions = [1, 8, 13];

  const hovers = await Promise.all(
    positions.map((character) =>
      provideHover(document, { line: 0, character }),
    ),
  );

  const expectedValue = "**hello**: 你好\n\n**world**: 世界";
  const expectedRange = {
    start: { line: 0, character: 1 },
    end: { line: 0, character: 14 },
  };

  for (const hover of hovers) {
    assert.equal(hover.contents.value, expectedValue);
    assert.deepEqual(hover.range, expectedRange);
  }
});

test("positions on surrounding quotes and punctuation return null", async () => {
  const document = createDocument('"hello_1-world",');
  const provideHover = createProvider(async () => ({
    translation: "translation",
  }));
  const positions = [0, 14, 15, 16];

  const hovers = await Promise.all(
    positions.map((character) =>
      provideHover(document, { line: 0, character }),
    ),
  );

  assert.deepEqual(hovers, [null, null, null, null]);
});

test("splitIdentifier splits camelCase", () => {
  assert.deepEqual(splitIdentifier("getUserName"), ["get", "user", "name"]);
});

test("splitIdentifier splits PascalCase with all-caps prefix", () => {
  assert.deepEqual(splitIdentifier("HTTPServer"), ["http", "server"]);
});

test("splitIdentifier splits snake_case", () => {
  assert.deepEqual(splitIdentifier("foo_bar"), ["foo", "bar"]);
});

test("splitIdentifier splits kebab-case", () => {
  assert.deepEqual(splitIdentifier("foo-bar"), ["foo", "bar"]);
});

test("splitIdentifier handles all-uppercase as single word", () => {
  assert.deepEqual(splitIdentifier("HTTP"), ["http"]);
});

test("splitIdentifier returns single lowercase character", () => {
  assert.deepEqual(splitIdentifier("a"), ["a"]);
});

test("splitIdentifier returns empty array for pure number", () => {
  assert.deepEqual(splitIdentifier("123"), []);
});

test("splitIdentifier returns empty for non-English", () => {
  assert.deepEqual(splitIdentifier("über"), []);
});

test("splitIdentifier deduplicates while preserving first occurrence order", () => {
  assert.deepEqual(splitIdentifier("foo_foo_bar"), ["foo", "bar"]);
});

test("splitIdentifier handles mixed case acronym followed by lowercase", () => {
  assert.deepEqual(splitIdentifier("getUserID"), ["get", "user", "id"]);
});
