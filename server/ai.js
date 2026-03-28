const fs = require("fs");
const path = require("path");

const MODEL_ID = "BAAI/bge-small-en-v1.5";
const CACHE_DIR = path.join(__dirname, "..", "data", "ai");
const READY_MARKER = path.join(CACHE_DIR, "model-ready.json");
const EMBEDDING_CACHE_LIMIT = 2000;

const OT_BOOKS = new Set([
  "genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth",
  "1 samuel","2 samuel","1 kings","2 kings","1 chronicles","2 chronicles","ezra","nehemiah","esther",
  "job","psalms","proverbs","ecclesiastes","song of solomon","isaiah","jeremiah","lamentations",
  "ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah","nahum","habakkuk",
  "zephaniah","haggai","zechariah","malachi"
]);

const NT_BOOKS = new Set([
  "matthew","mark","luke","john","acts","romans","1 corinthians","2 corinthians","galatians",
  "ephesians","philippians","colossians","1 thessalonians","2 thessalonians","1 timothy","2 timothy",
  "titus","philemon","hebrews","james","1 peter","2 peter","1 john","2 john","3 john","jude",
  "revelation"
]);

let pipelinePromise = null;
let pipelineConfig = null;
let downloadPromise = null;
const embeddingCache = new Map();
const headingCache = new Map();
const notesCache = new Map();
let geminiBlockedUntil = 0;
let openRouterBlockedUntil = 0;

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function markModelReady() {
  ensureCacheDir();
  fs.writeFileSync(
    READY_MARKER,
    JSON.stringify({ model: MODEL_ID, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function isModelReady() {
  return fs.existsSync(READY_MARKER);
}

function isDownloading() {
  return Boolean(downloadPromise);
}

async function createPipeline({ allowDownload, quantized }) {
  ensureCacheDir();
  const { pipeline, env } = await import("@xenova/transformers");
  env.allowLocalModels = true;
  env.allowRemoteModels = allowDownload;
  env.cacheDir = CACHE_DIR;
  return pipeline("feature-extraction", MODEL_ID, { quantized });
}

function shouldFallbackToUnquantized(error) {
  const message = String(error || "");
  return (
    message.includes("model_quantized.onnx") ||
    message.toLowerCase().includes("quantized") ||
    message.toLowerCase().includes("model_quantized")
  );
}

async function loadPipeline({ allowDownload }) {
  if (pipelinePromise) return pipelinePromise;

  pipelineConfig = { quantized: true };
  pipelinePromise = createPipeline({ allowDownload, quantized: true }).catch(async (error) => {
    if (shouldFallbackToUnquantized(error)) {
      pipelineConfig = { quantized: false };
      return createPipeline({ allowDownload, quantized: false });
    }
    pipelinePromise = null;
    pipelineConfig = null;
    throw error;
  });

  return pipelinePromise.catch((error) => {
    pipelinePromise = null;
    pipelineConfig = null;
    throw error;
  });
}

async function downloadModel() {
  if (downloadPromise) return downloadPromise;
  downloadPromise = (async () => {
    await loadPipeline({ allowDownload: true });
    markModelReady();
  })().finally(() => {
    downloadPromise = null;
  });
  return downloadPromise;
}

function tensorToVectors(tensor) {
  if (!tensor) return [];
  const data = tensor.data;
  const dims = tensor.dims || [];
  if (!dims.length) return [];
  if (dims.length === 1) {
    return [Float32Array.from(data)];
  }
  const rowCount = dims[0];
  const rowSize = dims[dims.length - 1];
  const vectors = [];
  for (let row = 0; row < rowCount; row += 1) {
    const start = row * rowSize;
    const end = start + rowSize;
    vectors.push(Float32Array.from(data.slice(start, end)));
  }
  return vectors;
}

async function embedTexts(texts, { allowDownload }) {
  const extractor = await loadPipeline({ allowDownload });
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return tensorToVectors(output);
}

function dot(a, b) {
  if (!a || !b) return 0;
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

function buildFtsQuery(text) {
  const tokens = (text || "").toLowerCase().match(/[a-z0-9']+/g) || [];
  const stopwords = new Set([
    "the",
    "and",
    "that",
    "with",
    "from",
    "this",
    "your",
    "into",
    "have",
    "has",
    "are",
    "was",
    "were",
    "for",
    "but",
    "not",
    "his",
    "her",
    "she",
    "him",
    "you",
    "our",
    "their",
    "they",
    "them",
    "what",
    "when",
    "where",
    "will",
    "shall"
  ]);
  const filtered = [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (stopwords.has(token)) continue;
    if (!filtered.includes(token)) filtered.push(token);
    if (filtered.length >= 10) break;
  }
  if (!filtered.length) return null;
  return filtered.map((token) => `${token}*`).join(" OR ");
}

function filterByScope(rows, scope) {
  if (!scope || scope === "all") return rows;
  const which = scope === "ot" ? OT_BOOKS : scope === "nt" ? NT_BOOKS : null;
  if (!which) return rows;
  return rows.filter((row) => which.has(String(row.book || "").toLowerCase()));
}

function searchBibleFts(db, queryText, limit, scope = "all") {

  const query = buildFtsQuery(queryText);
  if (!query) return [];
  const stmt = db.prepare(
    `SELECT bible.id, bible.book, bible.chapter, bible.verse, bible.text, bm25(bible_fts) as score
     FROM bible_fts
     JOIN bible ON bible_fts.rowid = bible.id
     WHERE bible_fts MATCH ?
     ORDER BY score
     LIMIT ?`
  );
  return filterByScope(stmt.all(query, limit), scope);
}

async function rankCandidates(queryText, candidates) {
  if (!candidates.length) return [];
  if (embeddingCache.size > EMBEDDING_CACHE_LIMIT) {
    embeddingCache.clear();
  }
  const [queryVector] = await embedTexts([`query: ${queryText}`], { allowDownload: true });
  const missing = candidates.filter((row) => !embeddingCache.has(row.id));
  if (missing.length) {
    const vectors = await embedTexts(
      missing.map((row) => `passage: ${row.book} ${row.chapter}:${row.verse} ${row.text}`),
      { allowDownload: true }
    );
    missing.forEach((row, index) => {
      embeddingCache.set(row.id, vectors[index]);
    });
  }

  return candidates
    .map((row) => ({
      ...row,
      score: dot(queryVector, embeddingCache.get(row.id))
    }))
    .sort((a, b) => b.score - a.score);
}

function formatResults(rows) {
  return rows.map((row) => ({
    id: row.id,
    book: row.book,
    chapter: row.chapter,
    verse: row.verse,
    text: row.text,
    citation: `${row.book} ${row.chapter}:${row.verse}`,
    score: row.score
  }));
}

async function recommendVerses(db, queryText, limit = 8, scope = "all") {
  const poolSize = Math.max(limit * 6, 30);
  const candidates = searchBibleFts(db, queryText, scope && scope !== "all" ? poolSize * 2 : poolSize, scope);
  if (!candidates.length) {
    return { mode: "fts", results: [] };
  }

  if (!isModelReady()) {
    return { mode: "fts", results: formatResults(candidates.slice(0, limit)) };
  }

  try {
    const ranked = await rankCandidates(queryText, candidates);
    return { mode: "ai", results: formatResults(ranked.slice(0, limit)) };
  } catch (error) {
    return { mode: "fts", results: formatResults(candidates.slice(0, limit)), error: error.message };
  }
}

function suggestSubheadingFromText(text) {
  const tokens = (text || "").toLowerCase().match(/[a-z']+/g)?.filter((w) => w.length > 3) || [];

  const stopwords = new Set([
    "shall",
    "will",
    "have",
    "with",
    "from",
    "your",
    "their",
    "them",
    "this",
    "that",
    "into",
    "unto",
    "also",
    "about",
    "they",
    "were",
    "been",
    "being",
    "could",
    "would",
    "should",
    "therefore",
    "because",
    "after",
    "before",
    "when",
    "where",
    "which",
    "while",
    "then",
    "than",
    "upon",
    "like",
    "behold"
  ]);

  const counts = new Map();
  for (const token of tokens) {
    if (stopwords.has(token)) continue;
    counts.set(token, (counts.get(token) || 0) + 1);
  }

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([word]) => word);

  if (!top.length) {
    return "New Section";
  }

  const title = top
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return title;
}

function sanitizeHeading(value) {
  if (!value || typeof value !== "string") return null;
  const cleaned = value
    .replace(/^[\-\d\.\)\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ");
  if (words.length < 2 || words.length > 7) return null;
  if (cleaned.length < 6) return null;
  const filler = ["shall", "unto", "they", "thee", "thou", "ye"];
  if (words.some((w) => filler.includes(w.toLowerCase()))) return null;
  return cleaned
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function uniqueCleanSuggestions(list, limit = 5) {
  const cleaned = (list || []).map(sanitizeHeading).filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, limit);
}

async function requestOpenRouter({ messages, apiKey, model, maxTokens = 120, temperature = 0.4 }) {
  if (!apiKey) throw new Error("OpenRouter API key missing");
  const now = Date.now();
  if (openRouterBlockedUntil && now < openRouterBlockedUntil) {
    throw new Error("OpenRouter temporarily blocked after prior failure");
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || process.env.OPEN_ROUTER_MODEL || "gryphe/hunter-alpha",
      messages,
      max_tokens: maxTokens,
      temperature
    })
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) {
      openRouterBlockedUntil = Date.now() + 10 * 60 * 1000;
    }
    throw new Error(`OpenRouter request failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("Empty OpenRouter response");
  return text;
}

function parseHeadingListClean(text) {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];
  for (const line of lines) {
    const parts = line.split(/[;•\-–—]/).filter(Boolean);
    parts.forEach((p) => candidates.push(p));
  }
  return candidates;
}

function parseHeadingList(text) {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = [];
  for (const line of lines) {
    const parts = line.split(/[;•\-–—]/).filter(Boolean);
    parts.forEach((p) => candidates.push(p));
  }
  return candidates;
}

async function suggestSubheadingGemini({ verses, lessonTitle, apiKey }) {
  if (String(process.env.GEMINI_DISABLE || "").toLowerCase() === "true") {
    throw new Error("Gemini disabled by environment");
  }

  const now = Date.now();
  if (geminiBlockedUntil && now < geminiBlockedUntil) {
    throw new Error("Gemini temporarily blocked after quota exhaustion");
  }

  if (!apiKey) throw new Error("Gemini API key missing");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const verseText = (verses || [])
    .slice(0, 6)
    .map((v) => `${v.citation || ""}: ${v.text || ""}`.trim())
    .join("\n");

  if (!verseText.trim()) {
    throw new Error("No verse content provided");
  }

  const cacheKey = JSON.stringify({ model, lessonTitle, verseText });
  if (headingCache.has(cacheKey)) {
    return headingCache.get(cacheKey);
  }

  const prompt = [
    "You write concise sermon section headings.",
    "Constraints: 3-5 options, each 2-6 words, Title Case, no numbering, no filler pronouns, no verse numbers.",
    lessonTitle ? `Lesson Title: ${lessonTitle}` : null,
    "Verses:",
    verseText
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 80,
      candidateCount: 1
    }
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) {
      // Back off for 15 minutes to avoid hammering zero quota projects.
      geminiBlockedUntil = Date.now() + 15 * 60 * 1000;
    }
    throw new Error(`Gemini request failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const suggestions = uniqueCleanSuggestions(parseHeadingListClean(text));
  headingCache.set(cacheKey, suggestions);
  return suggestions;
}

async function suggestSubheadingOpenRouter({ verses, lessonTitle, apiKey }) {
  const verseText = (verses || [])
    .slice(0, 6)
    .map((v) => `${v.citation || ""}: ${v.text || ""}`.trim())
    .join("\n");
  if (!verseText.trim()) throw new Error("No verse content provided");

  const cacheKey = JSON.stringify({
    provider: "openrouter",
    model: process.env.OPEN_ROUTER_MODEL || "gryphe/hunter-alpha",
    lessonTitle,
    verseText
  });
  if (headingCache.has(cacheKey)) return headingCache.get(cacheKey);

  const system = "You write 3-5 concise sermon section headings. 2-6 words, Title Case, no numbering, no filler words.";
  const user = [`Lesson Title: ${lessonTitle || "Untitled"}`, "Verses:", verseText].join("\n");
  const text = await requestOpenRouter({
    apiKey,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    maxTokens: 120,
    temperature: 0.5
  });

  const suggestions = uniqueCleanSuggestions(parseHeadingListClean(text));
  headingCache.set(cacheKey, suggestions);
  return suggestions;
}

async function suggestNotesGemini({ verses, lessonTitle, apiKey }) {
  if (String(process.env.GEMINI_DISABLE || "").toLowerCase() === "true") {
    throw new Error("Gemini disabled by environment");
  }
  const now = Date.now();
  if (geminiBlockedUntil && now < geminiBlockedUntil) {
    throw new Error("Gemini temporarily blocked after quota exhaustion");
  }
  if (!apiKey) throw new Error("Gemini API key missing");
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const verseText = (verses || [])
    .slice(0, 8)
    .map((v) => `${v.citation || ""}: ${v.text || ""}`.trim())
    .join("\n");
  if (!verseText.trim()) throw new Error("No verse content provided");

  const cacheKey = JSON.stringify({ model, lessonTitle, verseText, kind: "notes" });
  if (notesCache.has(cacheKey)) return notesCache.get(cacheKey);

  const prompt = [
    "You write 1-2 concise sermon section notes (combined as one short paragraph).",
    "Constraints: 40-80 words total, warm pastoral tone, connect the verses to the lesson title, avoid verse numbers, no bullet list.",
    lessonTitle ? `Lesson Title: ${lessonTitle}` : null,
    "Verses:",
    verseText
  ]
    .filter(Boolean)
    .join("\n");

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 160,
      candidateCount: 1
    }
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 429) {
      geminiBlockedUntil = Date.now() + 15 * 60 * 1000;
    }
    throw new Error(`Gemini request failed: ${res.status} ${detail}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const suggestion = text.replace(/\s+/g, " ").trim();
  if (!suggestion) throw new Error("Empty Gemini response");
  notesCache.set(cacheKey, suggestion);
  return suggestion;
}

async function suggestNotesOpenRouter({ verses, lessonTitle, apiKey }) {
  const verseText = (verses || [])
    .slice(0, 8)
    .map((v) => `${v.citation || ""}: ${v.text || ""}`.trim())
    .join("\n");
  if (!verseText.trim()) throw new Error("No verse content provided");

  const cacheKey = JSON.stringify({
    provider: "openrouter",
    model: process.env.OPEN_ROUTER_MODEL || "gryphe/hunter-alpha",
    lessonTitle,
    verseText,
    kind: "notes"
  });
  if (notesCache.has(cacheKey)) return notesCache.get(cacheKey);

  const system =
    "You write 1-2 concise sentences (40-80 words total) connecting the lesson title to the supplied verses. No bullets, no verse numbers.";
  const user = [`Lesson Title: ${lessonTitle || "Untitled"}`, "Verses:", verseText].join("\n");

  const text = await requestOpenRouter({
    apiKey,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    maxTokens: 160,
    temperature: 0.5
  });

  const suggestion = text.replace(/\s+/g, " ").trim();
  if (!suggestion) throw new Error("Empty OpenRouter response");
  notesCache.set(cacheKey, suggestion);
  return suggestion;
}

function suggestSubheadingCandidates(verses, limit = 5) {
  const combined = (verses || []).map((v) => v.text || v.citation || "").join(" ");
  const primary = suggestSubheadingFromText(combined);

  const tokens = (combined || "").toLowerCase().match(/[a-z']+/g) || [];
  const freq = new Map();
  for (const t of tokens) {
    if (t.length < 3) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .filter((t) => t.length > 3)
    .slice(0, 6);

  const combos = [];
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      combos.push(`${top[i]} ${top[j]}`);
    }
  }

  const suggestions = uniqueCleanSuggestions(
    [primary, ...top.map(capitalize), ...combos.map(capitalize)],
    Math.max(3, limit)
  );

  if (!suggestions.length && verses?.length) {
    const fallback = verses[0].text || verses[0].citation || "New Section";
    return uniqueCleanSuggestions([fallback.slice(0, 60)]);
  }
  return suggestions;
}

function suggestNotesFallback(verses, lessonTitle) {
  const text = (verses || [])
    .map((v) => v.text || v.citation || "")
    .filter(Boolean)
    .join(" ");
  const clipped = text.slice(0, 320);
  if (!clipped) return "Add verses to generate notes.";
  return `${lessonTitle ? `${lessonTitle}: ` : ""}${clipped}`;
}

function capitalize(str) {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

module.exports = {
  MODEL_ID,
  isModelReady,
  isDownloading,
  downloadModel,
  recommendVerses,
  suggestSubheadingFromText,
  suggestSubheadingCandidates,
  suggestSubheadingGemini,
  suggestSubheadingOpenRouter,
  suggestNotesGemini,
  suggestNotesOpenRouter,
  suggestNotesFallback
};
