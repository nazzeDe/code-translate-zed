import { readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";

class LRUCache {
  #max;
  #map = new Map();

  constructor(max) {
    this.#max = max;
  }

  get(key) {
    const value = this.#map.get(key);
    if (value === undefined) return undefined;
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.#map.has(key)) {
      this.#map.delete(key);
    } else if (this.#map.size >= this.#max) {
      const oldestKey = this.#map.keys().next().value;
      this.#map.delete(oldestKey);
    }
    this.#map.set(key, value);
  }
}

/**
 * Normalize a raw dictionary entry to a uniform contract.
 *
 * String entries are translation-only.
 * Object entries carry optional `w` (word), `p` (phonetic), and `t` (translation).
 *
 * @param {unknown} raw
 * @returns {{ translation: string, word?: string, phonetic?: string } | null}
 */
function normalize(raw) {
  if (typeof raw === "string") {
    return raw ? { translation: normalizeLineBreaks(raw) } : null;
  }

  if (!isRecord(raw) || typeof raw.t !== "string" || raw.t.length === 0) {
    return null;
  }

  const entry = { translation: normalizeLineBreaks(raw.t) };
  if (typeof raw.w === "string") entry.word = raw.w;
  if (typeof raw.p === "string") entry.phonetic = raw.p;
  return entry;
}

function normalizeLineBreaks(value) {
  return value.replaceAll("\\n", "\n");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function defaultReadFile(filePath) {
  return fsReadFile(filePath, "utf8");
}

function defaultOnLoadError({ prefix, error }) {
  const code =
    isRecord(error) && typeof error.code === "string" ? ` [${error.code}]` : "";
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `[code-translate-lsp] Failed to load dictionary ${prefix}.json${code}: ${message}`,
  );
}

function reportLoadError(onLoadError, diagnostic) {
  try {
    onLoadError(diagnostic);
  } catch {
    // Diagnostics must not turn a dictionary miss into a failed Hover request.
  }
}

const VALID_PREFIX = /^[a-z]{2}$/;

const DEFAULT_MAX_SIZE = 50;

/**
 * Create a dictionary store backed by two-letter-prefix JSON files.
 *
 * @param {string}  dictDir            Directory containing prefix JSON files.
 * @param {object}  [options]
 * @param {number} [options.maxSize] Max cached prefix files (default 50).
 * @param {function} [options.readFile] Replaceable file reader.
 * @param {function} [options.onLoadError] Replaceable diagnostic sink.
 * @returns {{ lookup: (word: string) => Promise<object|null> }}
 */
export function createDictionaryStore(dictDir, options = {}) {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  if (!Number.isSafeInteger(maxSize) || maxSize <= 0) {
    throw new TypeError("maxSize must be a positive safe integer");
  }

  const readFile = options.readFile ?? defaultReadFile;
  const onLoadError = options.onLoadError ?? defaultOnLoadError;
  const cache = new LRUCache(maxSize);

  return {
    async lookup(word) {
      const lower = word.toLowerCase();
      const prefix = lower.slice(0, 2);

      if (!VALID_PREFIX.test(prefix)) {
        return null;
      }

      let prefixData = cache.get(prefix);
      if (prefixData === undefined) {
        const filePath = join(dictDir, `${prefix}.json`);
        try {
          const raw = await readFile(filePath);
          prefixData = JSON.parse(raw);
          if (!isRecord(prefixData)) {
            throw new TypeError(
              "dictionary prefix file must contain an object",
            );
          }
          cache.set(prefix, prefixData);
        } catch (error) {
          reportLoadError(onLoadError, { prefix, error });
          return null;
        }
      }

      const entry = prefixData[lower];
      return normalize(entry);
    },
  };
}
