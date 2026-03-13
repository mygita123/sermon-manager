// Canonical book names (must match the SQLite bible table values).
const BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation"
];

// Common abbreviations and aliases mapped to canonical base names.
const ABBREVIATIONS = {
  gen: "Genesis",
  ge: "Genesis",
  ex: "Exodus",
  exo: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  deut: "Deuteronomy",
  deuter: "Deuteronomy",
  josh: "Joshua",
  judg: "Judges",
  rt: "Ruth",
  ruth: "Ruth",
  job: "Job",
  ps: "Psalms",
  psa: "Psalms",
  psm: "Psalms",
  psalm: "Psalms",
  prov: "Proverbs",
  pro: "Proverbs",
  eccl: "Ecclesiastes",
  ecc: "Ecclesiastes",
  song: "Song of Solomon",
  sos: "Song of Solomon",
  songofsongs: "Song of Solomon",
  songofsolomon: "Song of Solomon",
  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  ezek: "Ezekiel",
  ez: "Ezekiel",
  dan: "Daniel",
  hos: "Hosea",
  joel: "Joel",
  amos: "Amos",
  obad: "Obadiah",
  jon: "Jonah",
  mic: "Micah",
  nah: "Nahum",
  hab: "Habakkuk",
  zeph: "Zephaniah",
  hag: "Haggai",
  zech: "Zechariah",
  mal: "Malachi",
  mt: "Matthew",
  matt: "Matthew",
  mk: "Mark",
  mrk: "Mark",
  lk: "Luke",
  luk: "Luke",
  jn: "John",
  joh: "John",
  john: "John",
  acts: "Acts",
  rom: "Romans",
  cor: "Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  phil: "Philippians",
  php: "Philippians",
  col: "Colossians",
  thess: "Thessalonians",
  thes: "Thessalonians",
  tim: "Timothy",
  tit: "Titus",
  philem: "Philemon",
  phm: "Philemon",
  heb: "Hebrews",
  jam: "James",
  jas: "James",
  pet: "Peter",
  pe: "Peter",
  jud: "Jude",
  rev: "Revelation",
  re: "Revelation",
  rv: "Revelation"
};

const NUMBERED_BOOKS = new Set(
  BOOKS.filter((name) => /^\d\s+/.test(name)).map((name) => name.replace(/^\d\s+/, ""))
);

const BASE_BOOKS = Array.from(
  new Map(
    BOOKS.map((name) => {
      const base = name.replace(/^\d\s+/, "");
      return [normalizeBookKey(base), base];
    })
  ).values()
);

const BASE_BOOKS_MAP = BASE_BOOKS.reduce((acc, name) => {
  acc[normalizeBookKey(name)] = name;
  return acc;
}, {});

function normalizeBookKey(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Step 1-3: trim, lowercase, normalize book number words (first/second/third).
function normalizeInput(input) {
  return (input || "")
    .trim()
    .replace(/[\u2013\u2014]/g, "-")
    .toLowerCase()
    .replace(/\b(first|1st)\b/g, "1")
    .replace(/\b(second|2nd)\b/g, "2")
    .replace(/\b(third|3rd)\b/g, "3")
    .replace(/(\d)(st|nd|rd)(?=[a-z])/g, "$1")
    .replace(/\s+/g, " ");
}

// Step 4: insert a space between book name and chapter when missing (e.g., Jn3 -> Jn 3).
function fixNoSpaceReference(input) {
  if (!input) return input;
  return input.replace(/([a-z\.])(\d)/i, "$1 $2");
}

// Step 5: parse the normalized reference into raw parts.
function parseReference(input) {
  const normalized = fixNoSpaceReference(normalizeInput(input));
  if (!normalized) return null;

  const match = normalized.match(
    /^(\d)?\s*([a-z][a-z.\s]*?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?(?:,\s*(\d+))?$/
  );
  if (!match) return null;

  const bookNumber = match[1] || null;
  const bookNameRaw = match[2].replace(/\s+/g, " ").trim();
  const chapter = Number(match[3]);
  const verseStart = match[4] ? Number(match[4]) : null;
  const verseEnd = match[5] ? Number(match[5]) : null;
  const commaVerse = match[6] ? Number(match[6]) : null;

  if (!chapter || Number.isNaN(chapter)) return null;

  return {
    bookNumber,
    bookNameRaw,
    chapter,
    verseStart,
    verseEnd: verseEnd ?? commaVerse,
    normalized
  };
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function allowedDistance(length) {
  if (length <= 4) return 1;
  if (length <= 7) return 2;
  return 3;
}

// Step 6: fuzzy-correct the book name (Levenshtein distance).
function correctBookName(rawBookName) {
  if (!rawBookName) return null;

  const rawKey = normalizeBookKey(rawBookName);
  if (!rawKey) return rawBookName;

  // Short inputs are likely abbreviations; let abbreviation mapping handle them.
  if (rawKey.length <= 2) return rawBookName;
  if (ABBREVIATIONS[rawKey]) return rawBookName;

  if (BASE_BOOKS_MAP[rawKey]) {
    return BASE_BOOKS_MAP[rawKey];
  }

  let best = null;
  let bestDistance = Infinity;

  for (const name of BASE_BOOKS) {
    const candidateKey = normalizeBookKey(name);
    const distance = levenshtein(rawKey, candidateKey);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = name;
    }
  }

  if (best && bestDistance <= allowedDistance(rawKey.length)) {
    return best;
  }

  return rawBookName;
}

function mapAbbreviation(bookName) {
  if (!bookName) return null;
  const key = normalizeBookKey(bookName);
  return ABBREVIATIONS[key] || bookName;
}

function applyBookNumber(bookName, bookNumber) {
  if (!bookNumber) return bookName;
  if (NUMBERED_BOOKS.has(bookName)) {
    return `${bookNumber} ${bookName}`;
  }
  return bookName;
}

// Step 7: expand abbreviations and build the normalized query object.
function buildQueryObject({ bookNumber, bookName, chapter, verseStart, verseEnd }) {
  if (!bookName || !chapter) return null;

  const abbreviationExpanded = mapAbbreviation(bookName);
  const canonicalKey = normalizeBookKey(abbreviationExpanded);
  const canonicalBase = BASE_BOOKS_MAP[canonicalKey] || abbreviationExpanded;
  const book = applyBookNumber(canonicalBase, bookNumber);

  const start = Number.isFinite(verseStart) ? verseStart : null;
  let end = Number.isFinite(verseEnd) ? verseEnd : null;
  if (start !== null && end === null) {
    end = start;
  }

  return {
    book,
    chapter,
    verseStart: start,
    verseEnd: end
  };
}

function normalizeCitation(input) {
  const parsed = parseReference(input);
  if (!parsed) return (input || "").trim();

  const corrected = correctBookName(parsed.bookNameRaw);
  const normalized = buildQueryObject({
    bookNumber: parsed.bookNumber,
    bookName: corrected,
    chapter: parsed.chapter,
    verseStart: parsed.verseStart,
    verseEnd: parsed.verseEnd
  });

  if (!normalized) return (input || "").trim();

  const { book, chapter, verseStart, verseEnd } = normalized;
  if (verseStart === null) {
    return `${book} ${chapter}`;
  }
  if (verseEnd === null || verseEnd === verseStart) {
    return `${book} ${chapter}:${verseStart}`;
  }
  return `${book} ${chapter}:${verseStart}-${verseEnd}`;
}

function parseCitation(input) {
  const parsed = parseReference(input);
  if (!parsed) return null;

  const corrected = correctBookName(parsed.bookNameRaw);
  const normalized = buildQueryObject({
    bookNumber: parsed.bookNumber,
    bookName: corrected,
    chapter: parsed.chapter,
    verseStart: parsed.verseStart,
    verseEnd: parsed.verseEnd
  });

  if (!normalized) return null;

  const { book, chapter, verseStart, verseEnd } = normalized;

  if (verseStart === null) {
    return { book, chapter, mode: "chapter" };
  }

  const mode = verseEnd !== null && verseEnd !== verseStart ? "range" : "single";
  return {
    book,
    chapter,
    start: verseStart,
    end: verseEnd ?? verseStart,
    mode
  };
}

module.exports = {
  normalizeInput,
  fixNoSpaceReference,
  correctBookName,
  parseReference,
  buildQueryObject,
  normalizeCitation,
  parseCitation
};
