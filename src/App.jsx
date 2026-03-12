import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "./lib/api";

function InlineEdit({
  value,
  onSave,
  placeholder,
  className = "",
  multiline = false,
  canEdit = true,
  editSignal
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  useEffect(() => {
    if (canEdit && typeof editSignal === "number") {
      setEditing(true);
    }
  }, [editSignal, canEdit]);

  const commit = async () => {
    if (!canEdit) return;
    setEditing(false);
    if (draft !== value) {
      await onSave(draft.trim());
    }
  };

  if (!canEdit) {
    return <div className={className}>{value || placeholder}</div>;
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          className={`w-full rounded-lg border border-parchment-200 bg-white/80 p-3 text-base shadow-sm focus:border-parchment-400 focus:outline-none ${className}`}
          rows={3}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          autoFocus
        />
      );
    }

    return (
      <input
        className={`w-full rounded-lg border border-parchment-200 bg-white/80 p-2 text-base shadow-sm focus:border-parchment-400 focus:outline-none ${className}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit();
          }
        }}
        autoFocus
      />
    );
  }

  return (
    <div
      className={`cursor-text transition hover:text-ink-900 ${className}`}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {value || <span className="text-ink-500/70">{placeholder}</span>}
    </div>
  );
}

function BibleBlock({ bible, onExpand, compact = false, getVerseHighlights, onVerseSelect }) {
  const [loading, setLoading] = useState(false);
  const isExpanded = bible.mode === "full";
  const highlight = useMemo(() => getHighlightRange(bible.citation), [bible.citation]);

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);
    const nextMode = isExpanded ? "initial" : "full";
    await onExpand(bible.id, nextMode);
    setLoading(false);
  };

  return (
    <div
      className={`rounded-2xl border border-parchment-200 bg-white/70 shadow-sm ${
        compact ? "p-2" : "p-4"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-semibold uppercase tracking-wide text-parchment-700">
          {bible.citation}
        </span>
        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-parchment-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-700 transition hover:border-parchment-500 hover:text-parchment-900"
            onClick={handleToggle}
          >
            {loading ? "Loading..." : isExpanded ? "Collapse" : "View More"}
          </button>
          {bible.canDelete && (
            <button
              className="rounded-full border border-rose-300 p-2 text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
              onClick={() => bible.onDelete?.(bible.id)}
              aria-label="Delete bible caption"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
      <div
        className={`prose prose-slate max-w-none ${
          compact
            ? "mt-1.5 prose-p:leading-tight prose-p:my-0.5"
            : "mt-3 prose-p:leading-snug prose-p:my-1"
        }`}
      >
        {bible.verses?.length ? (
          bible.verses.map((verse) => {
            const isHighlighted =
              isExpanded &&
              highlight &&
              verse.verse >= highlight.start &&
              verse.verse <= highlight.end;
            const ranges = getVerseHighlights?.(bible.id, verse.verse) || [];
            const segments = splitByHighlightRanges(verse.text, ranges);
            return (
              <p
                key={verse.id}
                className={`transition ${isHighlighted ? "font-semibold text-ink-900" : ""}`}
                onMouseUp={(event) => onVerseSelect?.(bible.id, verse.verse, verse.text, event)}
                title="Select text to highlight"
              >
                <span className="font-semibold text-parchment-700">{verse.verse}. </span>
                <span data-verse-text>
                  {segments.map((segment, index) =>
                    segment.highlighted ? (
                      <span
                        key={`${verse.id}-${segment.start}-${segment.end}`}
                        className="rounded-[2px] bg-amber-200/70 px-0.5"
                        style={{ boxDecorationBreak: "clone" }}
                      >
                        {segment.text}
                      </span>
                    ) : (
                      <span key={`${verse.id}-plain-${index}`}>{segment.text}</span>
                    )
                  )}
                </span>
              </p>
            );
          })
        ) : (
          <p className="text-sm text-ink-500">No verses available for this citation.</p>
        )}
      </div>
    </div>
  );
}

function TrashIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M9 10v7" />
      <path d="M12 10v7" />
      <path d="M15 10v7" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  );
}

function DragHandleIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="8" cy="7" r="1.5" />
      <circle cx="16" cy="7" r="1.5" />
      <circle cx="8" cy="12" r="1.5" />
      <circle cx="16" cy="12" r="1.5" />
      <circle cx="8" cy="17" r="1.5" />
      <circle cx="16" cy="17" r="1.5" />
    </svg>
  );
}

function MagnifierIcon({ className = "", variant = "in" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.2 4.2" />
      {variant === "in" ? <path d="M11 8v6M8 11h6" /> : <path d="M8 11h6" />}
    </svg>
  );
}

function SortableSection({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-70" : ""}>
      {children({ attributes, listeners })}
    </div>
  );
}

function getHighlightRange(citation) {
  if (!citation) return null;
  const normalized = citation.replace(/[\u2013\u2014]/g, "-");
  const match = normalized.match(/(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!match) return null;
  const verseStart = match[2] ? Number(match[2]) : null;
  const verseEnd = match[3] ? Number(match[3]) : null;
  if (!Number.isFinite(verseStart)) return null;
  return {
    start: verseStart,
    end: Number.isFinite(verseEnd) ? verseEnd : verseStart
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRanges(ranges) {
  const cleaned = ranges
    .filter((range) => range && Number.isFinite(range.start) && Number.isFinite(range.end))
    .map((range) => ({
      start: Math.min(range.start, range.end),
      end: Math.max(range.start, range.end)
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged = [];
  for (const range of cleaned) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }
  return merged;
}

function isRangeCovered(ranges, start, end) {
  let cursor = start;
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start > cursor) return false;
    cursor = Math.max(cursor, range.end);
    if (cursor >= end) return true;
  }
  return false;
}

function addRange(ranges, start, end) {
  return normalizeRanges([...ranges, { start, end }]);
}

function subtractRange(ranges, start, end) {
  const result = [];
  for (const range of ranges) {
    if (end <= range.start || start >= range.end) {
      result.push(range);
    } else {
      if (start > range.start) {
        result.push({ start: range.start, end: start });
      }
      if (end < range.end) {
        result.push({ start: end, end: range.end });
      }
    }
  }
  return result;
}

function splitByHighlightRanges(text, ranges) {
  const normalized = normalizeRanges(ranges);
  if (!normalized.length) return [{ text, highlighted: false }];

  const segments = [];
  let cursor = 0;
  for (const range of normalized) {
    const start = clamp(range.start, 0, text.length);
    const end = clamp(range.end, 0, text.length);
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), highlighted: false });
    }
    if (end > start) {
      segments.push({ text: text.slice(start, end), highlighted: true, start, end });
      cursor = end;
    }
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }
  return segments;
}

function normalizeHighlightState(raw) {
  if (!raw || typeof raw !== "object") return {};
  const next = {};
  for (const [bibleId, verses] of Object.entries(raw)) {
    if (!verses || typeof verses !== "object" || Array.isArray(verses)) continue;
    const verseMap = {};
    for (const [verseNumber, ranges] of Object.entries(verses)) {
      if (!Array.isArray(ranges)) continue;
      const normalized = normalizeRanges(ranges);
      if (normalized.length) {
        verseMap[verseNumber] = normalized;
      }
    }
    if (Object.keys(verseMap).length) {
      next[bibleId] = verseMap;
    }
  }
  return next;
}

export default function App() {
  const [lessons, setLessons] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationZoom, setPresentationZoom] = useState(1);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [sectionOrder, setSectionOrder] = useState([]);
  const [titleEditSignal, setTitleEditSignal] = useState(0);
  const [confirmState, setConfirmState] = useState(null);
  const [toastItems, setToastItems] = useState([]);
  const [pendingScroll, setPendingScroll] = useState(null);
  const sectionRefs = React.useRef(new Map());
  const [highlightMap, setHighlightMap] = useState(() => {
    try {
      const raw = localStorage.getItem("bibleHighlights");
      return normalizeHighlightState(raw ? JSON.parse(raw) : {});
    } catch (error) {
      console.warn("Failed to load bible highlights", error);
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("bibleHighlights", JSON.stringify(highlightMap));
    } catch (error) {
      console.warn("Failed to save bible highlights", error);
    }
  }, [highlightMap]);

  const zoomIn = () => {
    setPresentationZoom((value) => Math.min(1.4, Number((value + 0.1).toFixed(2))));
  };

  const zoomOut = () => {
    setPresentationZoom((value) => Math.max(0.8, Number((value - 0.1).toFixed(2))));
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const getVerseHighlights = (bibleId, verseNumber) => {
    const verseMap = highlightMap?.[bibleId];
    if (!verseMap) return [];
    const ranges = verseMap[String(verseNumber)];
    return Array.isArray(ranges) ? ranges : [];
  };

  const toggleHighlightRange = (bibleId, verseNumber, start, end, textLength) => {
    setHighlightMap((prev) => {
      const next = { ...prev };
      const verseMap = { ...(next[bibleId] || {}) };
      const key = String(verseNumber);
      const clampedStart = clamp(start, 0, textLength);
      const clampedEnd = clamp(end, 0, textLength);
      if (clampedEnd <= clampedStart) return prev;

      const existing = normalizeRanges(Array.isArray(verseMap[key]) ? verseMap[key] : []);
      const covered = isRangeCovered(existing, clampedStart, clampedEnd);
      const updated = covered
        ? subtractRange(existing, clampedStart, clampedEnd)
        : addRange(existing, clampedStart, clampedEnd);

      if (updated.length) {
        verseMap[key] = updated;
      } else {
        delete verseMap[key];
      }

      if (Object.keys(verseMap).length) {
        next[bibleId] = verseMap;
      } else {
        delete next[bibleId];
      }
      return next;
    });
  };

  const handleVerseSelect = (bibleId, verseNumber, verseText, event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const container = event.currentTarget.querySelector("[data-verse-text]");
    if (!container) return;
    const range = selection.getRangeAt(0);
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      return;
    }

    const preRange = range.cloneRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);

    let start = preRange.toString().length;
    let end = start + range.toString().length;
    const text = verseText || container.textContent || "";

    while (start < end && /\s/.test(text[start])) start += 1;
    while (end > start && /\s/.test(text[end - 1])) end -= 1;

    if (end <= start) {
      selection.removeAllRanges();
      return;
    }

    toggleHighlightRange(bibleId, verseNumber, start, end, text.length);
    selection.removeAllRanges();
  };

  const orderedSections = useMemo(() => {
    if (!selectedLesson) return [];
    const map = new Map(selectedLesson.sections.map((section) => [section.id, section]));
    const ordered = sectionOrder
      .map((id) => map.get(id))
      .filter((section) => section);
    const missing = selectedLesson.sections.filter((section) => !sectionOrder.includes(section.id));
    return [...ordered, ...missing];
  }, [selectedLesson, sectionOrder]);

  const persistSectionOrder = async (lessonId, nextOrder, previousOrder) => {
    try {
      await api.reorderSections(lessonId, nextOrder);
    } catch (error) {
      setSectionOrder(previousOrder);
      pushToast(error.message || "Failed to reorder sections.", "error");
    }
  };

  const handleSectionDragEnd = async (event) => {
    if (!selectedLesson) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSectionOrder((current) => {
      const oldIndex = current.indexOf(active.id);
      const newIndex = current.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return current;
      const next = arrayMove(current, oldIndex, newIndex);
      persistSectionOrder(selectedLesson.id, next, current);
      return next;
    });
  };

  const pushToast = (message, type = "success") => {
    const id = crypto.randomUUID();
    setToastItems((items) => [...items, { id, message, type }]);
    setTimeout(() => {
      setToastItems((items) => items.filter((item) => item.id !== id));
    }, 3200);
  };

  const selectedLessonTitle = selectedLesson?.title || "Select a lesson";

  const refreshLessons = async (preferredId) => {
    try {
      const data = await api.listLessons();
      setLessons(data);
      if (!data.length) {
        setSelectedLessonId(null);
        return;
      }
      const targetId =
        preferredId ?? (data.some((lesson) => lesson.id === selectedLessonId) ? selectedLessonId : null);
      setSelectedLessonId(targetId || data[0].id);
    } catch (error) {
      pushToast(error.message || "Failed to load lessons.", "error");
    }
  };

  const loadLesson = async (id, options = {}) => {
    const { showLoading = true } = options;
    if (showLoading) {
      setLoadingLesson(true);
    }
    try {
      const data = await api.getLesson(id);
      setSelectedLesson(data);
    } catch (error) {
      pushToast(error.message || "Failed to load lesson.", "error");
    }
    if (showLoading) {
      setLoadingLesson(false);
    }
  };

  useEffect(() => {
    refreshLessons();
  }, []);

  useEffect(() => {
    if (selectedLessonId) {
      loadLesson(selectedLessonId);
    }
  }, [selectedLessonId]);

  useEffect(() => {
    if (!selectedLesson) return;
    setSectionOrder(selectedLesson.sections.map((section) => section.id));
  }, [selectedLesson]);

  useEffect(() => {
    if (presentationMode && editMode) {
      setEditMode(false);
    }
  }, [presentationMode, editMode]);

  useLayoutEffect(() => {
    if (!pendingScroll) return;
    const bibleTarget =
      pendingScroll.bibleId &&
      document.querySelector(`[data-bible-id="${pendingScroll.bibleId}"]`);
    const sectionTarget =
      pendingScroll.sectionId &&
      (sectionRefs.current.get(pendingScroll.sectionId) ||
        document.querySelector(`[data-section-id="${pendingScroll.sectionId}"]`));
    const target = bibleTarget || sectionTarget;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    setPendingScroll(null);
  }, [pendingScroll, selectedLesson]);

  const handleCreateLesson = async (title) => {
    if (!title) return;
    try {
      const lesson = await api.createLesson({ title });
      await refreshLessons();
      setSelectedLessonId(lesson.id);
      setCreatingLesson(false);
      setEditMode(true);
    } catch (error) {
      pushToast(error.message || "Failed to create lesson.", "error");
    }
  };

  const handleUpdateLessonTitle = async (value) => {
    if (!selectedLesson) return;
    try {
      await api.updateLesson(selectedLesson.id, { title: value || "Untitled Lesson" });
      await refreshLessons();
      await loadLesson(selectedLesson.id, { showLoading: false });
    } catch (error) {
      pushToast(error.message || "Failed to save lesson title.", "error");
    }
  };

  const handleAddSection = async () => {
    if (!selectedLesson) return;
    const order = selectedLesson.sections.length + 1;
    try {
      const created = await api.addSection(selectedLesson.id, {
        section_order: order,
        subheading: "",
        note: ""
      });
      await loadLesson(selectedLesson.id, { showLoading: false });
      if (created?.id) {
        setPendingScroll({ sectionId: created.id });
      }
    } catch (error) {
      pushToast(error.message || "Failed to add section.", "error");
    }
  };

  const handleSectionUpdate = async (sectionId, payload) => {
    try {
      await api.updateSection(sectionId, payload);
      await loadLesson(selectedLesson.id, { showLoading: false });
      setPendingScroll({ sectionId });
    } catch (error) {
      pushToast(error.message || "Failed to update section.", "error");
    }
  };

  const handleAddBible = async (sectionId, citation) => {
    if (!citation) return;
    try {
      const created = await api.addBible(sectionId, { citation });
      await loadLesson(selectedLesson.id, { showLoading: false });
      setPendingScroll({ sectionId, bibleId: created?.id });
    } catch (error) {
      pushToast(error.message || "Failed to add bible caption.", "error");
    }
  };

  const handleBibleUpdate = async (bibleId, citation, sectionId) => {
    if (!citation) return;
    try {
      await api.updateBible(bibleId, { citation });
      await loadLesson(selectedLesson.id, { showLoading: false });
      if (sectionId) {
        setPendingScroll({ sectionId, bibleId });
      }
    } catch (error) {
      pushToast(error.message || "Failed to update bible caption.", "error");
    }
  };

  const handleBibleExpand = async (bibleId, mode) => {
    try {
      const data = await api.getBibleVerses(bibleId, mode);
      setSelectedLesson((current) => {
        if (!current) return current;
        return {
          ...current,
          sections: current.sections.map((section) => ({
            ...section,
            bibles: section.bibles.map((bible) =>
              bible.id === bibleId ? { ...bible, verses: data.verses, mode: data.mode } : bible
            )
          }))
        };
      });
    } catch (error) {
      pushToast(error.message || "Failed to load verses.", "error");
    }
  };

  const handleDeleteLesson = async (lessonId) => {
    const lesson = lessons.find((item) => item.id === lessonId);
    const ok = await openConfirm({
      title: "Delete Lesson",
      message: `Delete lesson "${lesson?.title || "Untitled Lesson"}"? This cannot be undone.`,
      confirmText: "Delete Lesson"
    });
    if (!ok) return;
    try {
      await api.deleteLesson(lessonId);
      await refreshLessons();
      setSelectedLesson(null);
      pushToast("Lesson deleted.", "success");
    } catch (error) {
      pushToast(error.message || "Failed to delete lesson.", "error");
    }
  };

  const handleDeleteSection = async (sectionId) => {
    const sections = selectedLesson?.sections || [];
    const index = sections.findIndex((section) => section.id === sectionId);
    const nextSection =
      index >= 0 ? sections[index + 1] || sections[index - 1] || null : null;
    const ok = await openConfirm({
      title: "Delete Section",
      message: "Delete this section and its bible captions? This cannot be undone.",
      confirmText: "Delete Section"
    });
    if (!ok) return;
    try {
      await api.deleteSection(sectionId);
      await loadLesson(selectedLesson.id, { showLoading: false });
      setPendingScroll(nextSection ? { sectionId: nextSection.id } : null);
      pushToast("Section deleted.", "success");
    } catch (error) {
      pushToast(error.message || "Failed to delete section.", "error");
    }
  };

  const handleDeleteBible = async (bibleId, sectionId) => {
    const ok = await openConfirm({
      title: "Delete Bible Caption",
      message: "Delete this bible caption? This cannot be undone.",
      confirmText: "Delete Caption"
    });
    if (!ok) return;
    try {
      await api.deleteBible(bibleId);
      await loadLesson(selectedLesson.id, { showLoading: false });
      if (sectionId) {
        setPendingScroll({ sectionId });
      }
      pushToast("Bible caption deleted.", "success");
    } catch (error) {
      pushToast(error.message || "Failed to delete bible caption.", "error");
    }
  };

  const openConfirm = ({ title, message, confirmText = "Delete" }) =>
    new Promise((resolve) => {
      setConfirmState({ title, message, confirmText, resolve });
    });

  const closeConfirm = (result) => {
    if (confirmState?.resolve) {
      confirmState.resolve(result);
    }
    setConfirmState(null);
  };

  const sortedLessons = useMemo(() => {
    return [...lessons].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }, [lessons]);

  return (
    <div className="min-h-screen">
      {!presentationMode && (
        <header className="flex items-center justify-between border-b border-parchment-200 bg-white/80 px-6 py-4 backdrop-blur">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-parchment-600">Sermon Manager</p>
            <h1 className="font-display text-2xl font-semibold text-ink-900">{selectedLessonTitle}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                editMode
                  ? "bg-parchment-700 text-white"
                  : "border border-parchment-300 text-parchment-700 hover:border-parchment-500"
              }`}
              onClick={() => setEditMode((value) => !value)}
            >
              {editMode ? "Exit Edit Mode" : "Switch Edit Mode"}
            </button>
            <button
              className="rounded-full border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 transition hover:border-ink-400"
              onClick={() => {
                setEditMode(false);
                setPresentationMode(true);
              }}
            >
              Presentation Mode
            </button>
          </div>
        </header>
      )}

      {presentationMode && (
        <div className="fixed right-6 top-6 z-50 flex flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-700 shadow-lift transition hover:border-ink-400"
            onClick={zoomOut}
          >
            <MagnifierIcon className="h-4 w-4" variant="out" />
            Zoom Out
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-700 shadow-lift transition hover:border-ink-400"
            onClick={zoomIn}
          >
            <MagnifierIcon className="h-4 w-4" variant="in" />
            Zoom In
          </button>
          <button
            className="rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-lift"
            onClick={() => setPresentationMode(false)}
          >
            Minimize
          </button>
        </div>
      )}

      <div
        className={`grid min-h-[calc(100vh-80px)] grid-cols-1 ${
          presentationMode ? "gap-3 bg-parchment-50 p-3" : "gap-6 p-6 lg:grid-cols-[1fr_280px]"
        }`}
      >
        <main
          className={`fade-in rounded-3xl border border-parchment-200 bg-white/80 shadow-lift ${
            presentationMode ? "p-3 lg:col-span-2" : "p-6"
          }`}
          style={presentationMode ? { zoom: presentationZoom } : undefined}
        >
          {loadingLesson ? (
            <div className="text-ink-500">Loading lesson...</div>
          ) : selectedLesson ? (
            <div className={presentationMode ? "space-y-3" : "space-y-8"}>
              <div
                className={
                  presentationMode
                    ? "border-b border-parchment-200 pb-2"
                    : "border-b border-parchment-200 pb-5"
                }
              >
                <div className="flex flex-wrap items-center gap-3">
                  <InlineEdit
                    value={selectedLesson.title}
                    placeholder="Lesson title"
                    className="font-display text-3xl font-semibold text-ink-900"
                    canEdit={editMode}
                    onSave={handleUpdateLessonTitle}
                    editSignal={titleEditSignal}
                  />
                  {editMode && (
                    <>
                      <button
                        className="rounded-full border border-parchment-300 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-700"
                        onClick={() => setTitleEditSignal((value) => value + 1)}
                        aria-label="Edit title"
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-full border border-rose-300 p-2 text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
                        onClick={() => handleDeleteLesson(selectedLesson.id)}
                        aria-label="Delete lesson"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleSectionDragEnd}
              >
                <SortableContext
                  items={sectionOrder.length ? sectionOrder : orderedSections.map((section) => section.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className={presentationMode ? "space-y-4" : "space-y-10"}>
                    {orderedSections.map((section) => (
                      <SortableSection key={section.id} id={section.id} disabled={!editMode}>
                        {({ attributes, listeners }) => (
                          <div
                            data-section-id={section.id}
                            ref={(node) => {
                              if (node) {
                                sectionRefs.current.set(section.id, node);
                              } else {
                                sectionRefs.current.delete(section.id);
                              }
                            }}
                            className={`rounded-2xl bg-parchment-50/60 ${
                              presentationMode ? "space-y-2 p-3" : "space-y-4 p-5"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                {editMode && (
                                  <button
                                    className="rounded-full border border-parchment-300 p-2 text-parchment-700 transition hover:border-parchment-500 hover:text-parchment-900"
                                    aria-label="Reorder section"
                                    {...attributes}
                                    {...listeners}
                                  >
                                    <DragHandleIcon className="h-4 w-4" />
                                  </button>
                                )}
                                {(editMode || !presentationMode || section.subheading) && (
                                  <InlineEdit
                                    value={section.subheading}
                                    placeholder="Add subheading"
                                    className="font-display text-xl font-semibold text-ink-900"
                                    canEdit={editMode}
                                    onSave={(value) => handleSectionUpdate(section.id, { subheading: value })}
                                  />
                                )}
                              </div>
                              {editMode && (
                                <button
                                  className="rounded-full border border-rose-300 p-2 text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
                                  onClick={() => handleDeleteSection(section.id)}
                                  aria-label="Delete section"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              )}
                            </div>

                            {(editMode || section.note) && (
                              <InlineEdit
                                value={section.note}
                                placeholder="Add note"
                                className="text-base text-ink-700"
                                multiline
                                canEdit={editMode}
                                onSave={(value) => handleSectionUpdate(section.id, { note: value })}
                              />
                            )}

                            <div className={presentationMode ? "space-y-2" : "space-y-4"}>
                              {section.bibles.map((bible) => (
                                <div key={bible.id} data-bible-id={bible.id} className="space-y-2">
                                  {editMode && (
                                    <InlineEdit
                                      value={bible.citation}
                                      placeholder="Bible citation"
                                      className="text-sm font-semibold uppercase tracking-wide text-parchment-700"
                                      canEdit={editMode}
                                      onSave={(value) => handleBibleUpdate(bible.id, value, section.id)}
                                    />
                                  )}
                                  <BibleBlock
                                    bible={{
                                      ...bible,
                                      canDelete: editMode,
                                      onDelete: (id) => handleDeleteBible(id, section.id)
                                    }}
                                    onExpand={handleBibleExpand}
                                    compact={presentationMode}
                                    getVerseHighlights={getVerseHighlights}
                                    onVerseSelect={handleVerseSelect}
                                  />
                                </div>
                              ))}

                              {editMode && (
                                <BibleAdder
                                  onSave={(citation) => handleAddBible(section.id, citation)}
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </SortableSection>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {editMode && (
                <button
                  className="rounded-full border border-parchment-300 px-4 py-2 text-sm font-semibold text-parchment-700 transition hover:border-parchment-500"
                  onClick={handleAddSection}
                >
                  Add Section
                </button>
              )}
            </div>
          ) : (
            <div className="text-ink-500">Select or add a lesson to begin.</div>
          )}
        </main>

        {!presentationMode && (
          <aside className="fade-in rounded-3xl border border-parchment-200 bg-white/70 p-5 shadow-lift">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-parchment-600">
                Lessons
              </h2>
              <button
                className="rounded-full bg-parchment-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
                onClick={() => setCreatingLesson(true)}
              >
                Add New
              </button>
            </div>

            {creatingLesson && (
              <LessonCreator
                onCancel={() => setCreatingLesson(false)}
                onSave={handleCreateLesson}
              />
            )}

            <div className="mt-4 max-h-[70vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
              {sortedLessons.map((lesson) => (
                <button
                  key={lesson.id}
                  className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    lesson.id === selectedLessonId
                      ? "border-parchment-400 bg-parchment-100 text-ink-900"
                      : "border-transparent bg-white/70 text-ink-600 hover:border-parchment-200"
                  }`}
                  onClick={() => setSelectedLessonId(lesson.id)}
                >
                  {lesson.title}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-6 backdrop-blur">
          <div className="w-full max-w-md rounded-3xl border border-parchment-200 bg-white/90 p-6 shadow-lift">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment-600">
              Confirmation
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-ink-900">
              {confirmState.title}
            </h3>
            <p className="mt-3 text-sm text-ink-600">{confirmState.message}</p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <button
                className="rounded-full border border-parchment-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-parchment-700"
                onClick={() => closeConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="rounded-full bg-rose-600 p-2 text-white shadow-sm transition hover:bg-rose-700"
                onClick={() => closeConfirm(true)}
                aria-label={confirmState.confirmText}
              >
                <TrashIcon className="h-4 w-4" />
                <span className="sr-only">{confirmState.confirmText}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-xs flex-col gap-3">
        {toastItems.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lift ${
              toast.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function LessonCreator({ onSave, onCancel }) {
  const [title, setTitle] = useState("");

  return (
    <div className="mt-4 rounded-2xl border border-parchment-200 bg-parchment-50/80 p-3">
      <input
        className="w-full rounded-lg border border-parchment-200 bg-white/80 p-2 text-sm focus:border-parchment-400 focus:outline-none"
        placeholder="Lesson title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded-full bg-parchment-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
          onClick={() => onSave(title)}
        >
          Save
        </button>
        <button
          className="rounded-full border border-parchment-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-700"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function BibleAdder({ onSave }) {
  const [citation, setCitation] = useState("");

  const submit = () => {
    const trimmed = citation.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setCitation("");
  };

  return (
    <div className="rounded-2xl border border-dashed border-parchment-300 bg-white/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="flex-1 rounded-lg border border-parchment-200 bg-white/80 px-3 py-2 text-sm focus:border-parchment-400 focus:outline-none"
          placeholder="Type bible caption e.g Genesis 1:1"
          value={citation}
          onChange={(event) => setCitation(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          className="rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          onClick={submit}
        >
          Save
        </button>
      </div>
    </div>
  );
}
