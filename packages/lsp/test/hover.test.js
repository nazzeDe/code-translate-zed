import assert from "node:assert/strict";
import test from "node:test";
import { URL } from "node:url";

import { TextDocument } from "vscode-languageserver-textdocument";

import {
  createHoverProvider,
  renderHoverMarkdown,
  splitIdentifier,
} from "../src/hover.js";

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

function firstMarkdownLink(markdown) {
  const match = markdown.match(/\]\(([^)]+)\)/);
  assert.ok(match, "expected a Markdown link");
  return match[1];
}

// --- Rendering format tests (Issue #9) ---

test("single word renders with Google Translate link and translation", async () => {
  const provideHover = createProvider(async (identifier) =>
    identifier === "hello" ? { translation: "interj. 喂, 嘿" } : null,
  );
  const hover = await provideHover(createDocument("hello"), {
    line: 0,
    character: 2,
  });

  const value = hover.contents.value;
  const url = new URL(firstMarkdownLink(value));
  assert.equal(url.origin, "https://translate.google.com");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    sl: "en",
    tl: "zh-CN",
    text: "hello",
    op: "translate",
  });
  assert.match(value, /\)  \ninterj\\\. 喂\\, 嘿$/);
});

test("Google links encode URL-significant and non-ASCII word text", () => {
  const word = "rock & roll/中文?";
  const markdown = renderHoverMarkdown([
    { word, entry: { translation: "test" } },
  ]);
  const url = new URL(firstMarkdownLink(markdown));

  assert.equal(url.searchParams.get("text"), word);
  assert.ok(!url.href.includes("中文"));
  assert.ok(!url.href.includes("rock & roll"));
  assert.match(markdown, /^\[\*\*rock \\& roll\\\/中文\\\?\*\*\]/);
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
  assert.match(value, / eɪbiː  \n\\\[医\\\] 抗体$/);
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
    translation: "> [test] *bold* _italic_ `code` <tag> &copy;",
  }));
  const hover = await provideHover(createDocument("test"), {
    line: 0,
    character: 1,
  });

  const value = hover.contents.value;
  assert.ok(
    value.endsWith(
      "\\> \\[test\\] \\*bold\\* \\_italic\\_ \\`code\\` \\<tag\\> \\&copy\\;",
    ),
  );
});

test("Markdown special characters in phonetics are escaped", async () => {
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

test("dictionary line escapes render as Markdown hard breaks", async () => {
  const provideHover = createProvider(async () => ({
    translation: "n. 头\\nvt. 用头顶\nthird line",
  }));
  const hover = await provideHover(createDocument("head"), {
    line: 0,
    character: 1,
  });

  const value = hover.contents.value;
  assert.match(value, /\)  \nn\\\. 头  \nvt\\\. 用头顶  \nthird line$/);
  assert.ok(!value.includes("\\n"));
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

test("splitIdentifier handles adjacent acronym and PascalCase boundaries", () => {
  assert.deepEqual(splitIdentifier("XMLHttpRequest"), [
    "xml",
    "http",
    "request",
  ]);
});

test("splitIdentifier ignores repeated leading and trailing separators", () => {
  assert.deepEqual(splitIdentifier("__foo--bar__"), ["foo", "bar"]);
});

test("splitIdentifier retains digits without creating empty words", () => {
  assert.deepEqual(splitIdentifier("foo2_bar3"), ["foo2", "bar3"]);
});

// --- Filtering tests (Issue #8) ---

test("partial match: unknown words are omitted, only matched translations shown", async () => {
  const document = createDocument("unknownWord_cat");
  const provideHover = createProvider(async (identifier) => {
    if (identifier === "cat") return { translation: "猫" };
    return null;
  });
  const hover = await provideHover(document, { line: 0, character: 5 });

  const value = hover.contents.value;
  assert.ok(value.includes("text=cat"), "matched word should be linked");
  assert.ok(!value.includes("text=unknown"), "unknown component omitted");
  assert.ok(!value.includes("text=word"), "unknown component omitted");
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
  assert.doesNotMatch(hover.contents.value, /baidu/i);
});
