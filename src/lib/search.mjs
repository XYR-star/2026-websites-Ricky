const chineseTerm = /^\p{Script=Han}{3,}$/u;

function normalize(text) {
  return text.normalize("NFKC").trim().toLowerCase();
}

/** @typedef {ReturnType<typeof import("./content").getSearchIndex>[number]} SearchEntry */

/**
 * @param {SearchEntry[]} entries
 * @param {string} query
 * @returns {SearchEntry[]}
 */
export function findSearchEntries(entries, query) {
  const words = new Set(normalize(query).split(/[\s,、;。]+/).filter(Boolean));
  if (!words.size) return [];

  const terms = [...words].map((word) => {
    // Keep a contiguous phrase of at least two characters. For example, 九寨沟
    // can match 九寨行 through 九寨, while unrelated single characters cannot match.
    const characters = chineseTerm.test(word) ? [...word] : [];
    const nearby = characters.length > 0
      ? [characters.slice(0, -1).join(""), characters.slice(1).join("")]
      : [];
    return { word, nearby };
  });

  return entries
    .map((entry) => {
      const text = normalize(entry.text);
      let exact = 0;
      let approximate = 0;

      for (const { word, nearby } of terms) {
        if (text.includes(word)) exact++;
        else if (nearby.some((fragment) => text.includes(fragment))) approximate++;
      }

      return { entry, exact, approximate };
    })
    .filter(({ exact, approximate }) => exact > 0 || approximate > 0)
    .sort((a, b) => b.exact - a.exact || b.approximate - a.approximate || b.entry.date.localeCompare(a.entry.date))
    .slice(0, 24)
    .map(({ entry }) => entry);
}
