const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const { getDb } = require("./db");
const { parseCitation, normalizeCitation } = require("./verseParser");
const {
  MODEL_ID,
  isModelReady,
  isDownloading,
  downloadModel,
  recommendVerses,
  suggestSubheadingCandidates,
  suggestSubheadingGemini,
  suggestSubheadingOpenRouter,
  suggestNotesGemini,
  suggestNotesOpenRouter,
  suggestNotesFallback
} = require("./ai");

const PORT = process.env.SERMON_API_PORT || 3927;

const db = getDb();
const app = express();

app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(express.json());
app.use(cors());

function fetchVersesByCitation(citation, mode) {
  const parsed = parseCitation(citation);
  if (!parsed) return { verses: [], mode: "initial" };

  if (parsed.mode === "chapter" || mode === "full") {
    const verses = db
      .prepare(
        "SELECT id, book, chapter, verse, text FROM bible WHERE book = ? AND chapter = ? ORDER BY verse"
      )
      .all(parsed.book, parsed.chapter);
    return { verses, mode: "full" };
  }

  const verses = db
    .prepare(
      "SELECT id, book, chapter, verse, text FROM bible WHERE book = ? AND chapter = ? AND verse BETWEEN ? AND ? ORDER BY verse"
    )
    .all(parsed.book, parsed.chapter, parsed.start, parsed.end);

  return { verses, mode: "initial" };
}

function updateCachedVerses(sectionBibleId, citation, mode) {
  const normalized = normalizeCitation(citation);
  const { verses, mode: resolvedMode } = fetchVersesByCitation(normalized, mode);

  const deleteStmt = db.prepare("DELETE FROM section_verses WHERE section_bible_id = ?");
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO section_verses (section_bible_id, book, chapter, verse, text) VALUES (?, ?, ?, ?, ?)"
  );

  const transaction = db.transaction(() => {
    deleteStmt.run(sectionBibleId);
    verses.forEach((verse) => {
      insertStmt.run(sectionBibleId, verse.book, verse.chapter, verse.verse, verse.text.trim());
    });
  });

  transaction();
  return { verses, mode: resolvedMode };
}

function getCachedVerses(sectionBibleId) {
  return db
    .prepare(
      "SELECT id, book, chapter, verse, text FROM section_verses WHERE section_bible_id = ? ORDER BY verse"
    )
    .all(sectionBibleId);
}

function hydrateLesson(lessonId) {
  const lesson = db.prepare("SELECT * FROM lessons WHERE id = ?").get(lessonId);
  if (!lesson) return null;

  const sections = db
    .prepare(
      "SELECT * FROM lesson_sections WHERE lesson_id = ? ORDER BY section_order ASC, id ASC"
    )
    .all(lessonId);

  const sectionBiblesStmt = db.prepare(
    "SELECT * FROM section_bibles WHERE section_id = ? ORDER BY id ASC"
  );

  const sectionsWithData = sections.map((section) => {
    const bibles = sectionBiblesStmt.all(section.id).map((bible) => {
      let verses = getCachedVerses(bible.id);
      const parsed = parseCitation(bible.citation);
      let mode = parsed?.mode === "chapter" ? "full" : "initial";

      if (!verses.length) {
        const updated = updateCachedVerses(bible.id, bible.citation, "initial");
        verses = updated.verses;
        mode = updated.mode;
      }

      return {
        ...bible,
        verses,
        mode
      };
    });

    return {
      ...section,
      bibles
    };
  });

  return {
    ...lesson,
    sections: sectionsWithData
  };
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/ai/status", (_req, res) => {
  res.json({
    modelId: MODEL_ID,
    modelDownloaded: isModelReady(),
    downloading: isDownloading()
  });
});

app.post("/ai/download", async (_req, res) => {
  if (isModelReady()) {
    return res.json({ modelId: MODEL_ID, modelDownloaded: true, downloading: false });
  }
  if (isDownloading()) {
    return res.json({ modelId: MODEL_ID, modelDownloaded: false, downloading: true });
  }
  try {
    await downloadModel();
    res.json({ modelId: MODEL_ID, modelDownloaded: true, downloading: false });
  } catch (error) {
    res.status(500).send(error.message || "Failed to download model");
  }
});

app.post("/ai/recommendations", async (req, res) => {
  const lessonTitle = (req.body?.lessonTitle || "").trim();
  const sectionSubheading = (req.body?.sectionSubheading || "").trim();
  const sectionNote = (req.body?.sectionNote || "").trim();
  const queryText = [lessonTitle, sectionSubheading, sectionNote].filter(Boolean).join(" ");
  if (!queryText) {
    return res.status(400).send("Provide lesson title, section subtitle, or note.");
  }

  const limitRaw = Number(req.body?.limit || 8);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;

  try {
    const recommendations = await recommendVerses(db, queryText, limit, "all");
    res.json({ ...recommendations, query: queryText });
  } catch (error) {
    res.status(500).send(error.message || "Failed to generate recommendations");
  }
});

app.post("/ai/section-subheading", (req, res) => {
  const verses = Array.isArray(req.body?.verses) ? req.body.verses : [];
  const lessonTitle = (req.body?.lessonTitle || "").trim();
  if (!verses.length) {
    return res.status(400).send("Provide at least one verse to summarize.");
  }

  const openRouterKey = process.env.OPEN_ROUTER_KEY;
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  (async () => {
    if (openRouterKey) {
      try {
        const suggestions = await suggestSubheadingOpenRouter({ verses, lessonTitle, apiKey: openRouterKey });
        if (suggestions.length) {
          return res.json({ suggestions, mode: "openrouter" });
        }
      } catch (error) {
        console.warn("OpenRouter subheading failed:", error.message);
      }
    }

    if (geminiKey) {
      try {
        const suggestions = await suggestSubheadingGemini({ verses, lessonTitle, apiKey: geminiKey });
        if (suggestions.length) {
          return res.json({ suggestions, mode: "gemini" });
        }
      } catch (error) {
        console.warn("Gemini subheading failed:", error.message);
      }
    }

    const fallback = suggestSubheadingCandidates(verses, 5);
    res.json({ suggestions: fallback, mode: "fallback" });
  })();
});

app.post("/ai/section-notes", (req, res) => {
  const verses = Array.isArray(req.body?.verses) ? req.body.verses : [];
  const lessonTitle = (req.body?.lessonTitle || "").trim();
  if (!verses.length) {
    return res.status(400).send("Provide at least one verse to summarize.");
  }
  const openRouterKey = process.env.OPEN_ROUTER_KEY;
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  (async () => {
    if (openRouterKey) {
      try {
        const suggestion = await suggestNotesOpenRouter({ verses, lessonTitle, apiKey: openRouterKey });
        if (suggestion) {
          return res.json({ suggestion, mode: "openrouter" });
        }
      } catch (error) {
        console.warn("OpenRouter notes failed:", error.message);
      }
    }
    if (geminiKey) {
      try {
        const suggestion = await suggestNotesGemini({ verses, lessonTitle, apiKey: geminiKey });
        if (suggestion) {
          return res.json({ suggestion, mode: "gemini" });
        }
      } catch (error) {
        console.warn("Gemini notes failed:", error.message);
      }
    }
    const fallback = suggestNotesFallback(verses, lessonTitle);
    res.json({ suggestion: fallback, mode: "fallback" });
  })();
});

app.post("/bible/search", async (req, res) => {
  const queryText = (req.body?.query || "").trim();
  const scope = (req.body?.scope || "all").toLowerCase();
  const limitRaw = Number(req.body?.limit || 8);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;
  if (!queryText) {
    return res.status(400).send("Query is required");
  }
  try {
    const { results, mode } = await recommendVerses(db, queryText, limit);
    res.json({ results, mode, query: queryText });
  } catch (error) {
    console.error("Bible search failed:", error);
    res.status(500).send(error.message || "Failed to search bible");
  }
});

app.get("/lessons", (_req, res) => {
  const lessons = db
    .prepare("SELECT id, title, updated_at FROM lessons ORDER BY updated_at DESC, id DESC")
    .all();
  res.json(lessons);
});

app.post("/lessons", (req, res) => {
  const title = (req.body?.title || "Untitled Lesson").trim() || "Untitled Lesson";
  const stmt = db.prepare(
    "INSERT INTO lessons (title, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  );
  const result = stmt.run(title);
  res.status(201).json({ id: result.lastInsertRowid, title });
});

app.get("/lessons/:id", (req, res) => {
  const lesson = hydrateLesson(Number(req.params.id));
  if (!lesson) return res.status(404).send("Lesson not found");
  res.json(lesson);
});

app.patch("/lessons/:id", (req, res) => {
  const id = Number(req.params.id);
  const title = (req.body?.title || "Untitled Lesson").trim() || "Untitled Lesson";
  db.prepare("UPDATE lessons SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(title, id);
  res.status(204).end();
});

app.delete("/lessons/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id FROM lessons WHERE id = ?").get(id);
  if (!existing) return res.status(404).send("Lesson not found");

  db.prepare("DELETE FROM lessons WHERE id = ?").run(id);
  res.status(204).end();
});

app.post("/lessons/:id/sections", (req, res) => {
  const lessonId = Number(req.params.id);
  const sectionOrder = Number(req.body?.section_order || 1);
  const subheading = req.body?.subheading || "";
  const note = req.body?.note || "";

  const result = db
    .prepare(
      "INSERT INTO lesson_sections (lesson_id, section_order, subheading, note) VALUES (?, ?, ?, ?)"
    )
    .run(lessonId, sectionOrder, subheading, note);

  db.prepare("UPDATE lessons SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lessonId);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch("/lessons/:id/sections/order", (req, res) => {
  const lessonId = Number(req.params.id);
  const order = req.body?.order;
  if (!Array.isArray(order) || !order.length) {
    return res.status(400).send("Order is required");
  }

  const ids = order.map((id) => Number(id)).filter((id) => Number.isFinite(id));
  if (ids.length !== order.length) {
    return res.status(400).send("Order must be a list of section ids");
  }

  const existing = db
    .prepare("SELECT id FROM lesson_sections WHERE lesson_id = ?")
    .all(lessonId)
    .map((row) => row.id);

  if (existing.length !== ids.length) {
    return res.status(400).send("Order does not match lesson sections");
  }

  const existingSet = new Set(existing);
  if (!ids.every((id) => existingSet.has(id))) {
    return res.status(400).send("Order contains invalid section ids");
  }

  const updateOrder = db.prepare(
    "UPDATE lesson_sections SET section_order = ? WHERE id = ? AND lesson_id = ?"
  );

  const transaction = db.transaction(() => {
    ids.forEach((sectionId, index) => {
      updateOrder.run(index + 1, sectionId, lessonId);
    });
    db.prepare("UPDATE lessons SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lessonId);
  });

  transaction();
  res.status(204).end();
});

app.patch("/sections/:id", (req, res) => {
  const sectionId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM lesson_sections WHERE id = ?").get(sectionId);
  if (!existing) return res.status(404).send("Section not found");

  const subheading = req.body?.subheading ?? existing.subheading;
  const note = req.body?.note ?? existing.note;

  db.prepare("UPDATE lesson_sections SET subheading = ?, note = ? WHERE id = ?").run(
    subheading,
    note,
    sectionId
  );
  db.prepare("UPDATE lessons SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    existing.lesson_id
  );
  res.status(204).end();
});

app.delete("/sections/:id", (req, res) => {
  const sectionId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM lesson_sections WHERE id = ?").get(sectionId);
  if (!existing) return res.status(404).send("Section not found");

  db.prepare("DELETE FROM lesson_sections WHERE id = ?").run(sectionId);
  db.prepare("UPDATE lessons SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    existing.lesson_id
  );
  res.status(204).end();
});

app.post("/sections/:id/bibles", (req, res) => {
  const sectionId = Number(req.params.id);
  const citation = (req.body?.citation || "").trim();
  if (!citation) return res.status(400).send("Citation is required");
  const normalizedCitation = normalizeCitation(citation);

  const result = db
    .prepare("INSERT INTO section_bibles (section_id, citation) VALUES (?, ?)")
    .run(sectionId, normalizedCitation);

  updateCachedVerses(result.lastInsertRowid, normalizedCitation, "initial");
  res.status(201).json({ id: result.lastInsertRowid });
});

app.patch("/section-bibles/:id", (req, res) => {
  const bibleId = Number(req.params.id);
  const citation = (req.body?.citation || "").trim();
  if (!citation) return res.status(400).send("Citation is required");
  const normalizedCitation = normalizeCitation(citation);

  db.prepare("UPDATE section_bibles SET citation = ? WHERE id = ?").run(
    normalizedCitation,
    bibleId
  );
  updateCachedVerses(bibleId, normalizedCitation, "initial");
  res.status(204).end();
});

app.delete("/section-bibles/:id", (req, res) => {
  const bibleId = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM section_bibles WHERE id = ?").get(bibleId);
  if (!existing) return res.status(404).send("Bible reference not found");

  db.prepare("DELETE FROM section_bibles WHERE id = ?").run(bibleId);
  res.status(204).end();
});

app.get("/section-bibles/:id/verses", (req, res) => {
  const bibleId = Number(req.params.id);
  const bible = db.prepare("SELECT * FROM section_bibles WHERE id = ?").get(bibleId);
  if (!bible) return res.status(404).send("Bible reference not found");

  const mode = req.query.mode === "full" ? "full" : "initial";
  const cached = updateCachedVerses(bibleId, bible.citation, mode);
  res.json(cached);
});

app.listen(PORT, () => {
  console.log(`Sermon API listening on ${PORT}`);
});
