const testDictionary = new Map([["hello", "你好"]]);

export function lookupWord(word) {
  return testDictionary.get(word.toLowerCase()) ?? null;
}
