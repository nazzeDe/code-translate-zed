import { MarkupKind } from "vscode-languageserver/node.js";

function isAsciiLetter(character) {
  return (
    (character >= "a" && character <= "z") ||
    (character >= "A" && character <= "Z")
  );
}

function isIdentifierCharacter(character) {
  return (
    isAsciiLetter(character) ||
    (character >= "0" && character <= "9") ||
    character === "_" ||
    character === "-"
  );
}

function identifierAtPosition(document, position) {
  const text = document.getText();
  const offset = document.offsetAt(position);
  if (offset >= text.length || !isIdentifierCharacter(text[offset])) {
    return null;
  }

  let start = offset;
  while (start > 0 && isIdentifierCharacter(text[start - 1])) {
    start -= 1;
  }

  let end = offset + 1;
  while (end < text.length && isIdentifierCharacter(text[end])) {
    end += 1;
  }

  return { text: text.slice(start, end), start, end };
}

export function createHoverProvider(store) {
  return async function provideHover(document, position) {
    const identifier = identifierAtPosition(document, position);
    if (!identifier) {
      return null;
    }

    const entry = await store.lookup(identifier.text);
    if (!entry) {
      return null;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: `**${identifier.text}**: ${entry.translation}`,
      },
      range: {
        start: document.positionAt(identifier.start),
        end: document.positionAt(identifier.end),
      },
    };
  };
}
