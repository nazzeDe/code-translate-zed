import { readFile as fsReadFile } from "node:fs/promises";
import { join } from "node:path";

// Map insertion order provides the LRU ordering without another dependency.

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
 * @param {string|object} raw
 * @returns {{ translation: string, word?: string, phonetic?: string }}
 */
function normalize(raw) {
  if (typeof raw === "string") {
    return { translation: raw };
  }
  const entry = { translation: raw.t ?? "" };
  if (raw.w !== undefined) entry.word = raw.w;
  if (raw.p !== undefined) entry.phonetic = raw.p;
  return entry;
}

const VALID_PREFIX = /^[a-z]{2,}$/;

const DEFAULT_MAX_SIZE = 50;

/**
 * Create a dictionary store backed by two-letter-prefix JSON files.
 *
 * @param {string}  dictDir            Directory containing prefix JSON files.
 * @param {object}  [options]
 * @param {number}  [options.maxSize]   Max cached prefix files (default 50).
 * @param {function} [options.readFile]  Replaceable file reader (default: fs.promises.readFile).
 * @returns {{ lookup: (word: string) => Promise<object|null> }}
 */
export function createDictionaryStore(dictDir, options = {}) {
  const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  const readFile = options.readFile ?? defaultReadFile;
  const cache = new LRUCache(maxSize);

  async function defaultReadFile(filePath) {
    return fsReadFile(filePath, "utf8");
  }

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
          cache.set(prefix, prefixData);
        } catch {
          // Do not cache failures. Return null without leaking paths.
          return null;
        }
      }

      const entry = prefixData[lower];
      return entry !== undefined ? normalize(entry) : null;
    },
  };
}
