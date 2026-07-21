import { MarkupKind } from "vscode-languageserver/node.js";

/**
 * Split a compound identifier into lowercase words.
 *
 * Handles camelCase, PascalCase, snake_case, kebab-case, and all-uppercase
 * identifiers. Deduplicates while preserving first-occurrence order.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function splitIdentifier(text) {
  // Reject tokens with non-ASCII-identifier characters.
  if (/[^a-zA-Z0-9_-]/.test(text)) return [];

  const words = [];
  const seen = new Set();
  let current = "";

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === "_" || c === "-") {
      if (current) {
        addWord(current);
        current = "";
      }
      continue;
    }

    if (current.length === 0) {
      current += c;
      continue;
    }

    const prev = current[current.length - 1];
    const prevIsLower = prev >= "a" && prev <= "z";
    const curIsUpper = c >= "A" && c <= "Z";

    if (prevIsLower && curIsUpper) {
      // camelCase boundary: lower -> upper
      addWord(current);
      current = c;
    } else if (
      i > 0 &&
      i + 1 < text.length &&
      c >= "A" && c <= "Z" &&
      text[i - 1] >= "A" && text[i - 1] <= "Z" &&
      text[i + 1] >= "a" && text[i + 1] <= "z"
    ) {
      // ALL-CAPS prefix followed by PascalCase: HTTP Server
      addWord(current);
      current = c;
    } else {
      current += c;
    }
  }

  if (current) {
    addWord(current);
  }

  return words;

  function addWord(w) {
    const lower = w.toLowerCase();
    // Omit tokens that contain no ASCII English letter.
    if (!/[a-z]/i.test(lower)) return;
    if (!seen.has(lower)) {
      seen.add(lower);
      words.push(lower);
    }
  }
}

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

    const words = splitIdentifier(identifier.text);
    if (words.length === 0) {
      return null;
    }

    const results = [];
    for (const word of words) {
      const entry = await store.lookup(word);
      if (entry) {
        results.push({ word, entry });
      }
    }

    if (results.length === 0) {
      return null;
    }

    const value = results
      .map((r) => `**${r.word}**: ${r.entry.translation}`)
      .join("\n\n");

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value,
      },
      range: {
        start: document.positionAt(identifier.start),
        end: document.positionAt(identifier.end),
      },
    };
  };
}
