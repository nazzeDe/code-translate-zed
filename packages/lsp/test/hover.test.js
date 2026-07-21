import assert from "node:assert/strict";
import test from "node:test";

import { TextDocument } from "vscode-languageserver-textdocument";

import { provideHover } from "../src/hover.js";

function createDocument(text) {
  return TextDocument.create(
    "file:///workspace/example.txt",
    "plaintext",
    1,
    text,
  );
}

test("complete identifiers include digits, underscores, and hyphens", () => {
  const texts = ["hello1", "hello_world", "hello-world"];

  const hovers = texts.map((text) =>
    provideHover(createDocument(text), { line: 0, character: 1 }),
  );

  assert.deepEqual(hovers, [null, null, null]);
});

test("beginning, middle, and last positions return the complete identifier range", () => {
  const document = createDocument('"hello_1-world",');
  const lookup = (identifier) =>
    identifier === "hello_1-world" ? "translation" : null;
  const positions = [1, 8, 13];

  const hovers = positions.map((character) =>
    provideHover(document, { line: 0, character }, lookup),
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

test("positions on surrounding quotes and punctuation return null", () => {
  const document = createDocument('"hello_1-world",');
  const positions = [0, 14, 15, 16];

  const hovers = positions.map((character) =>
    provideHover(document, { line: 0, character }, () => "translation"),
  );

  assert.deepEqual(hovers, [null, null, null, null]);
});
