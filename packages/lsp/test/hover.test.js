import assert from "node:assert/strict";
import test from "node:test";

import { TextDocument } from "vscode-languageserver-textdocument";

import { createHoverProvider } from "../src/hover.js";

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

test("complete identifiers include digits, underscores, and hyphens", async () => {
  const texts = ["hello1", "hello_world", "hello-world"];

  for (const text of texts) {
    const provideHover = createProvider(async (identifier) =>
      identifier === text ? { translation: "translation" } : null,
    );
    const hover = await provideHover(createDocument(text), {
      line: 0,
      character: 1,
    });

    assert.equal(hover.contents.value, `**${text}**: translation`);
    assert.deepEqual(hover.range, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: text.length },
    });
  }
});

test("beginning, middle, and last positions return the complete identifier range", async () => {
  const document = createDocument('"hello_1-world",');
  const provideHover = createProvider(async (identifier) =>
    identifier === "hello_1-world" ? { translation: "translation" } : null,
  );
  const positions = [1, 8, 13];

  const hovers = await Promise.all(
    positions.map((character) =>
      provideHover(document, { line: 0, character }),
    ),
  );

  const expectedHover = {
    contents: {
      kind: "markdown",
      value: "**hello_1-world**: translation",
    },
    range: {
      start: { line: 0, character: 1 },
      end: { line: 0, character: 14 },
    },
  };
  assert.deepEqual(hovers, [expectedHover, expectedHover, expectedHover]);
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
