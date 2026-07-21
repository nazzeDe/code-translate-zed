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

// --- Rendering format tests (Issue #9) ---

test("single word renders with Google Translate link and translation", async () => {
  const provideHover = createProvider(async (identifier) =>
    identifier === "hello"
      ? { translation: "interj. 喂, 嘿" }
      : null,
  );
  const hover = await provideHover(createDocument("hello"), {
    line: 0,
    character: 2,
  });

  const value = hover.contents.value;
  assert.ok(
    value.includes("[**hello**](https://translate.google.com/"),
    "word label should be a Google Translate link",
  );
  assert.ok(value.includes("&op=translate"), "should include op=translate");
  assert.ok(
    value.includes("text=hello"),
    "URL should encode the word",
  );
  assert.ok(
    value.includes("interj") && value.includes("喂, 嘿"),
    "translation should appear after word label",
  );
});

test("URL encoding uses encodeURIComponent for standards-based parameters", async () => {
  // The word is looked up as lowercase ASCII; verify URL uses encodeURIComponent.
  const provideHover = createProvider(async (identifier) =>
    identifier === "hello" ? { translation: "test" } : null,
  );
  const hover = await provideHover(createDocument("hello"), {
    line: 0,
    character: 2,
  });

  // The URL should use encodeURIComponent. Since "hello" has no special
  // chars, verify the parameter structure is correct.
  const value = hover.contents.value;
  assert.ok(
    value.includes("text=hello"),
    "URL parameter should contain the word",
  );
  assert.ok(
    value.includes("sl=en"),
    "source language should be en",
  );
});

test("dictionary with phonetic includes it on the label line", async () => {
  const provideHover = createProvider(async (identifier) =>
    identifier === "ab"
      ? { word: "AB", phonetic: "eɪbiː", translation: "[医] 抗体" }
      : null,
  );
  const hover = await provideHover(createDocument("ab"), {
    line: 0,
    character: 1,
  });

  const value = hover.contents.value;
  assert.ok(value.includes("eɪbiː"), "phonetic should appear");
  // Translation content should be present (brackets escaped)
  assert.ok(value.includes("医") && value.includes("抗体"), "translation content present");
});

test("multi-word identifiers render with separator", async () => {
  const document = createDocument("hello_world");
  const provideHover = createProvider(async (identifier) => {
    if (identifier === "hello") return { translation: "你好" };
    if (identifier === "world") return { translation: "世界" };
    return null;
  });
  const hover = await provideHover(document, { line: 0, character: 3 });

  const value = hover.contents.value;
  assert.ok(value.includes("---"), "multi-word should have separator");
  assert.ok(value.includes("text=hello"), "should link to hello");
  assert.ok(value.includes("text=world"), "should link to world");
});

test("Markdown special characters in translations are escaped", async () => {
  const provideHover = createProvider(async () => ({
    translation: "[test] *bold* _italic_ `code`",
  }));
  const hover = await provideHover(createDocument("test"), {
    line: 0,
    character: 1,
  });

  const value = hover.contents.value;
  // All special chars should be backslash-escaped
  assert.ok(value.includes("\\[test\\]"), "[ should be escaped");
  assert.ok(value.includes("\\*bold\\*"), "* should be escaped");
  assert.ok(value.includes("\\_italic\\_"), "_ should be escaped");
  assert.ok(value.includes("\\`code\\`"), "` should be escaped");
});

test("Markdown special characters in lookup word and phonetic are escaped", async () => {
  // Even though words from splitIdentifier are clean ASCII, verify the
  // rendering function escapes content that could contain special chars.
  const provideHover = createProvider(async () => ({
    phonetic: "test*phonetic",
    translation: "ok",
  }));
  const hover = await provideHover(createDocument("test"), {
    line: 0,
    character: 1,
  });

  const value = hover.contents.value;
  assert.ok(
    value.includes("test\\*phonetic"),
    "phonetic special chars should be escaped",
  );
});

test("dictionary line breaks are preserved in output", async () => {
  const provideHover = createProvider(async () => ({
    translation: "n. 头\nvt. 用头顶",
  }));
  const hover = await provideHover(createDocument("head"), {
    line: 0,
    character: 1,
  });

  const value = hover.contents.value;
  // Dots are escaped, but newlines are preserved
  assert.ok(value.includes("头") && value.includes("用头顶"), "content present");
  // Count newlines: should have at least 2 (label line + translation line1 + line2 = 2 newlines)
  const newlines = value.split("\n").length - 1;
  assert.ok(newlines >= 2, `expected >= 2 newlines, got ${newlines}`);
});

// --- Range preservation tests (Issue #4 + #5) ---

test("single-word identifiers with digits produce a hover with correct range", async () => {
  const provideHover = createProvider(async (identifier) =>
    identifier === "hello1" ? { translation: "translation" } : null,
  );
  const hover = await provideHover(createDocument("hello1"), {
    line: 0,
    character: 1,
  });

  assert.deepEqual(hover.range, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 6 },
  });
});

test("compound identifiers preserve original UTF-16 range for all cursor positions", async () => {
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

  const expectedRange = {
    start: { line: 0, character: 1 },
    end: { line: 0, character: 14 },
  };

  // All hovers should have the same range (the full identifier)
  for (const hover of hovers) {
    assert.deepEqual(hover.range, expectedRange);
  }

  // All hovers should have the same value
  assert.equal(hovers[0].contents.value, hovers[1].contents.value);
  assert.equal(hovers[0].contents.value, hovers[2].contents.value);
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

// --- splitIdentifier tests (Issue #5) ---

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

// --- Filtering tests (Issue #8) ---

test("partial match: unknown words are omitted, only matched translations shown", async () => {
  const document = createDocument("unknownWord_cat");
  const provideHover = createProvider(async (identifier) => {
    if (identifier === "cat") return { translation: "猫" };
    return null;
  });
  const hover = await provideHover(document, { line: 0, character: 5 });

  // Only cat should appear, not unknownWord
  assert.ok(
    hover.contents.value.includes("text=cat"),
    "matched word should be linked",
  );
  assert.ok(!hover.contents.value.includes("unknownWord"), "unknown omitted");
  assert.deepEqual(hover.range, {
    start: { line: 0, character: 0 },
    end: { line: 0, character: 15 },
  });
});

test("all words unknown returns null", async () => {
  const document = createDocument("unknown_xyz");
  const provideHover = createProvider(async () => null);
  const hover = await provideHover(document, { line: 0, character: 5 });
  assert.equal(hover, null);
});

test("pure number identifier returns null", async () => {
  const document = createDocument("123");
  const provideHover = createProvider(async () => ({
    translation: "should not appear",
  }));
  const hover = await provideHover(document, { line: 0, character: 1 });
  assert.equal(hover, null);
});

test("hover output contains no Baidu links", async () => {
  const document = createDocument("hello");
  const provideHover = createProvider(async () => ({
    translation: "你好",
  }));
  const hover = await provideHover(document, { line: 0, character: 1 });
  assert.ok(
    !hover.contents.value.includes("baidu"),
    "should not contain baidu",
  );
  assert.ok(
    !hover.contents.value.includes("Baidu"),
    "should not contain Baidu",
  );
});
