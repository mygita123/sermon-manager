import csv
import sqlite3
from pathlib import Path

DB_PATH = Path("data/sermons.db")
SCHEMA_PATH = Path("server/schema.sql")
CSV_PATH = Path("bible_data_set.csv")

DB_PATH.parent.mkdir(parents=True, exist_ok=True)

conn = sqlite3.connect(DB_PATH)
c = conn.cursor()

if SCHEMA_PATH.exists():
    c.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

c.execute("DELETE FROM bible")

with CSV_PATH.open("r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f, delimiter=",")
    for row in reader:
        c.execute(
            """
            INSERT INTO bible (citation, book, chapter, verse, text)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                row["citation"],
                row["book"],
                int(row["chapter"]),
                int(row["verse"]),
                row["text"].strip(),
            ),
        )

conn.commit()
conn.close()
print(f"Bible imported successfully into {DB_PATH}.")
