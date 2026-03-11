const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "sermons.db");

function ensureDirectory() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function initSchema(db) {
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
}

function seedSample(db) {
  const count = db.prepare("SELECT COUNT(*) as count FROM lessons").get().count;
  if (count > 0) return;

  const insertLesson = db.prepare(
    "INSERT INTO lessons (title, created_at, updated_at) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  );
  const insertSection = db.prepare(
    "INSERT INTO lesson_sections (lesson_id, section_order, subheading, note) VALUES (?, ?, ?, ?)"
  );
  const insertBible = db.prepare(
    "INSERT INTO section_bibles (section_id, citation) VALUES (?, ?)"
  );

  const lessonId = insertLesson.run("Backsliding").lastInsertRowid;
  const section1 = insertSection.run(
    lessonId,
    1,
    "1. Backsliding is evil and bitter.",
    "Show the ways through which backsliding comes, sin, forgetting prayers"
  ).lastInsertRowid;
  insertBible.run(section1, "Jeremiah 2:19");

  const section2 = insertSection.run(
    lessonId,
    2,
    "2. Backsliding is spiritual unfaithfulness.",
    ""
  ).lastInsertRowid;
  insertBible.run(section2, "Jeremiah 3:6");
}

function getDb() {
  ensureDirectory();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  seedSample(db);
  return db;
}

module.exports = {
  getDb
};
