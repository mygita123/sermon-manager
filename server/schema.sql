PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lesson_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL,
  section_order INTEGER NOT NULL,
  subheading TEXT,
  note TEXT,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS section_bibles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  citation TEXT NOT NULL,
  FOREIGN KEY (section_id) REFERENCES lesson_sections(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS section_verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_bible_id INTEGER NOT NULL,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (section_bible_id) REFERENCES section_bibles(id) ON DELETE CASCADE,
  UNIQUE (section_bible_id, verse)
);

CREATE TABLE IF NOT EXISTS bible (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  citation TEXT,
  book TEXT NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_book_chapter_verse ON bible(book, chapter, verse);

CREATE VIRTUAL TABLE IF NOT EXISTS bible_fts USING fts5(
  book,
  chapter,
  verse,
  text,
  content='bible',
  content_rowid='id'
);
