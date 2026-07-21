import { MarkupKind } from "vscode-languageserver/node.js";

import { lookupWord } from "./dictionary.js";

function isAsciiLetter(character) {
  return (
    (character >= "a" && character <= "z") ||
    (character >= "A" && character <= "Z")
  );
}

function wordAtPosition(document, position) {
  const text = document.getText();
  const offset = document.offsetAt(position);
  if (offset >= text.length || !isAsciiLetter(text[offset])) {
    return null;
  }

  let start = offset;
  while (start > 0 && isAsciiLetter(text[start - 1])) {
    start -= 1;
  }

  let end = offset + 1;
  while (end < text.length && isAsciiLetter(text[end])) {
    end += 1;
  }

  return { text: text.slice(start, end), start, end };
}

export function provideHover(document, position) {
  const word = wordAtPosition(document, position);
  if (!word) {
    return null;
  }

  const translation = lookupWord(word.text);
  if (!translation) {
    return null;
  }

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value: `**${word.text}**: ${translation}`,
    },
    range: {
      start: document.positionAt(word.start),
      end: document.positionAt(word.end),
    },
  };
}
