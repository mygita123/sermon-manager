function normalizeCitation(citation) {
  return citation
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCitation(citation) {
  const normalized = normalizeCitation(citation);
  const match = normalized.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i);
  if (!match) {
    return null;
  }

  const book = match[1].trim();
  const chapter = Number(match[2]);
  const verseStart = match[3] ? Number(match[3]) : null;
  const verseEnd = match[4] ? Number(match[4]) : null;

  if (!chapter || Number.isNaN(chapter)) return null;

  if (!verseStart) {
    return { book, chapter, mode: "chapter" };
  }

  if (!verseEnd) {
    return { book, chapter, mode: "single", start: verseStart, end: verseStart };
  }

  return { book, chapter, mode: "range", start: verseStart, end: verseEnd };
}

module.exports = {
  normalizeCitation,
  parseCitation
};
