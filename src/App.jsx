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
  editSignal,
  preserveLineBreaks = false,
  renderAdornment
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
        <div className="flex items-start gap-2">
          <textarea
            className={`w-full rounded-lg border border-parchment-200 bg-white/80 p-3 text-base shadow-sm focus:border-parchment-400 focus:outline-none ${className}`}
            rows={3}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            autoFocus
          />
          {renderAdornment?.({ value: draft, commit })}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
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
        {renderAdornment?.({ value: draft, commit })}
      </div>
    );
  }

  const viewStyle = preserveLineBreaks ? { whiteSpace: "pre-line" } : undefined;

  return (
    <div
      className={`cursor-text transition hover:text-ink-900 ${className} ${
        preserveLineBreaks ? "whitespace-pre-line" : ""
      }`}
      style={viewStyle}
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

function SettingsIcon({ className = "" }) {
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
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.06.06a2 2 0 1 1-2.82 2.82l-.06-.06a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.06 1.64V21a2 2 0 0 1-4 0v-.08a1.8 1.8 0 0 0-1.06-1.64 1.8 1.8 0 0 0-1.98.36l-.06.06a2 2 0 1 1-2.82-2.82l.06-.06A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.64-1.06H2.9a2 2 0 1 1 0-4h.06A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.36-1.98l-.06-.06a2 2 0 1 1 2.82-2.82l.06.06A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1.06-1.64V2.9a2 2 0 1 1 4 0v.06A1.8 1.8 0 0 0 15 4.6a1.8 1.8 0 0 0 1.98-.36l.06-.06a2 2 0 1 1 2.82 2.82l-.06.06A1.8 1.8 0 0 0 19.4 9a1.8 1.8 0 0 0 1.64 1.06H21a2 2 0 1 1 0 4h-.06A1.8 1.8 0 0 0 19.4 15Z" />
    </svg>
  );
}

function AiSparkIcon({ className = "" }) {
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
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17.5a2.5 2.5 0 0 1-2.5 2.5H5Z" />
      <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H15v17.5A2.5 2.5 0 0 0 12.5 22H5Z" />
      <path d="M5 8h10" />
      <path d="M5 12h7" />
      <path d="M5 16h6" />
    </svg>
  );
}

function SortIcon({ className = "" }) {
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
      <path d="M7 4v16M7 4l-2.5 3M7 4l2.5 3" />
      <path d="M17 20V4m0 16 2.5-3M17 20l-2.5-3" />
    </svg>
  );
}

function EyeToggleIcon({ className = "", hidden = false }) {
  if (hidden) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 3l18 18" />
        <path d="M10.58 10.58a3 3 0 0 0 3.84 3.84" />
        <path d="M9.88 5.18A9.46 9.46 0 0 1 12 5c5 0 9 5 9 7-1.08 1.78-2.7 3.59-4.7 4.62M6.1 6.1A11.72 11.72 0 0 0 3 12c1 2 4 6 9 6a9.8 9.8 0 0 0 3.18-.52" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M1.5 12s3.5-7 10.5-7 10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3.5" />
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
  const [presentationAlt, setPresentationAlt] = useState(false);
  const [presentationZoom, setPresentationZoom] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(() => {
    try {
      return localStorage.getItem("aiEnabled") === "true";
    } catch (error) {
      console.warn("Failed to read aiEnabled", error);
      return false;
    }
  });
  const [aiStatus, setAiStatus] = useState({
    modelId: "",
    modelDownloaded: false,
    downloading: false,
    loading: false,
    error: null
  });
  const [aiRecommendations, setAiRecommendations] = useState({});
  const [activeAiSectionId, setActiveAiSectionId] = useState(null);
  const [lessonSort, setLessonSort] = useState("title-asc");
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

  useEffect(() => {
    try {
      localStorage.setItem("aiEnabled", String(aiEnabled));
    } catch (error) {
      console.warn("Failed to save aiEnabled", error);
    }
  }, [aiEnabled]);

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

  const refreshAiStatus = async () => {
    setAiStatus((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await api.getAiStatus();
      setAiStatus({
        modelId: data.modelId || "",
        modelDownloaded: Boolean(data.modelDownloaded),
        downloading: Boolean(data.downloading),
        loading: false,
        error: null
      });
    } catch (error) {
      setAiStatus((prev) => ({
        ...prev,
        loading: false,
        error: error.message || "Failed to check AI status."
      }));
    }
  };

  const handleDownloadModel = async () => {
    setAiStatus((prev) => ({ ...prev, downloading: true, error: null }));
    try {
      const data = await api.downloadAiModel();
      setAiStatus({
        modelId: data.modelId || "",
        modelDownloaded: Boolean(data.modelDownloaded),
        downloading: Boolean(data.downloading),
        loading: false,
        error: null
      });
      if (data.modelDownloaded) {
        pushToast("AI model downloaded.", "success");
      }
    } catch (error) {
      setAiStatus((prev) => ({
        ...prev,
        downloading: false,
        error: error.message || "Failed to download model."
      }));
      pushToast(error.message || "Failed to download model.", "error");
    }
  };

  const handleFetchRecommendations = async (section) => {
    if (!selectedLesson) return;
    setActiveAiSectionId(section.id);
    setAiRecommendations((prev) => ({
      ...prev,
      [section.id]: {
        ...(prev[section.id] || {}),
        loading: true,
        error: null
      }
    }));

    try {
      const data = await api.getAiRecommendations({
        lessonTitle: selectedLesson.title,
        sectionSubheading: section.subheading,
        sectionNote: section.note,
        limit: 8
      });
      const existing = new Set(
        (section.bibles || []).map((bible) => (bible.citation || "").toLowerCase())
      );
      const results = (data.results || []).filter(
        (item) => !existing.has((item.citation || "").toLowerCase())
      );
      setAiRecommendations((prev) => ({
        ...prev,
        [section.id]: {
          loading: false,
          mode: data.mode,
          results,
          query: data.query || "",
          error: null
        }
      }));
    } catch (error) {
      setAiRecommendations((prev) => ({
        ...prev,
        [section.id]: {
          ...(prev[section.id] || {}),
          loading: false,
          error: error.message || "Failed to fetch recommendations."
        }
      }));
      pushToast(error.message || "Failed to fetch recommendations.", "error");
    }
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
    refreshAiStatus();
  }, []);

  useEffect(() => {
    if (selectedLessonId) {
      loadLesson(selectedLessonId);
    }
  }, [selectedLessonId]);

  useEffect(() => {
    // reset AI state when switching lessons
    setActiveAiSectionId(null);
  }, [selectedLessonId]);

  useEffect(() => {
    setActiveAiSectionId(null);
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

  useEffect(() => {
    setAiRecommendations({});
  }, [selectedLessonId]);

  useEffect(() => {
    setAiRecommendations({});
  }, [selectedLessonId]);

  useEffect(() => {
    if (aiEnabled) {
      refreshAiStatus();
    }
  }, [aiEnabled]);

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

  const handleAddRecommendation = async (sectionId, citation) => {
    if (!citation) return;
    await handleAddBible(sectionId, citation);
    setAiRecommendations((prev) => {
      const current = prev[sectionId];
      if (!current || !Array.isArray(current.results)) return prev;
      return {
        ...prev,
        [sectionId]: {
          ...current,
          results: current.results.filter((item) => item.citation !== citation)
        }
      };
    });
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
      if (activeAiSectionId === sectionId) {
        setActiveAiSectionId(null);
      }
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
    const list = [...lessons];
    const getDate = (lesson) => {
      const value = lesson.created_at || lesson.createdAt || lesson.updated_at || lesson.updatedAt;
      const time = value ? new Date(value).getTime() : 0;
      return Number.isFinite(time) ? time : 0;
    };

    switch (lessonSort) {
      case "title-desc":
        list.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
        break;
      case "created-asc":
        list.sort((a, b) => getDate(a) - getDate(b));
        break;
      case "created-desc":
        list.sort((a, b) => getDate(b) - getDate(a));
        break;
      case "title-asc":
      default:
        list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
    }
    return list;
  }, [lessons, lessonSort]);

  const activeAiSection = useMemo(() => {
    if (!activeAiSectionId || !selectedLesson) return null;
    return selectedLesson.sections?.find((section) => section.id === activeAiSectionId) || null;
  }, [activeAiSectionId, selectedLesson]);

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
            <button
              className="rounded-full border border-parchment-300 p-2 text-parchment-700 transition hover:border-parchment-500 hover:text-parchment-900"
              onClick={() => {
                setSettingsOpen(true);
                refreshAiStatus();
              }}
              aria-label="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
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
          <button
            className="inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/90 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-700 shadow-lift transition hover:border-ink-400"
            onClick={() => setPresentationAlt((value) => !value)}
            title="Alternate presentation layout"
          >
            <MagnifierIcon className="h-4 w-4" variant="in" />
            {presentationAlt ? "Standard View" : "Max View"}
          </button>
        </div>
      )}

      <div
        className={`grid min-h-[calc(100vh-80px)] grid-cols-1 ${
          presentationMode ? "gap-3 bg-parchment-50 p-6" : "gap-6 p-6 lg:grid-cols-[1fr_340px]"
        }`}
      >
        <main
          className={`fade-in rounded-3xl border border-parchment-200 bg-white/80 shadow-lift ${
            presentationMode ? "mx-auto w-full max-w-6xl p-6 lg:col-span-2 lg:pl-10" : "p-6"
          }`}
          style={presentationMode ? { zoom: presentationZoom } : undefined}
        >
          {loadingLesson ? (
            <div className="text-ink-500">Loading lesson...</div>
          ) : selectedLesson ? (
            <div className={presentationMode ? (presentationAlt ? "space-y-6" : "space-y-3") : "space-y-8"}>
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
                  <div className={presentationMode ? "space-y-3" : "space-y-6"}>
                    {orderedSections.map((section, index) => {
                      return (
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
                              presentationMode ? "space-y-2 p-2.5" : "space-y-3 p-4"
                            }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full bg-parchment-200 px-3 py-1 text-xs font-semibold text-parchment-800">
                                  {index + 1}
                                </span>
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
                                <div className="flex items-center gap-2">
                                  {aiEnabled && editMode && (
                                    <button
                                      className="rounded-full border border-parchment-300 p-2 text-parchment-700 transition hover:border-parchment-500 hover:text-parchment-900"
                                      onClick={() => {
                                        setActiveAiSectionId(section.id);
                                        const rec = aiRecommendations[section.id];
                                        if (!rec || ((!rec.results || !rec.results.length) && !rec.loading)) {
                                          handleFetchRecommendations(section);
                                        }
                                      }}
                                      aria-label="Show AI recommendations"
                                    >
                                      <AiSparkIcon className="h-4 w-4" />
                                    </button>
                                  )}
                                  {editMode && (
                                    <button
                                      className="rounded-full border border-rose-300 p-2 text-rose-600 transition hover-border-rose-400 hover:text-rose-700"
                                      onClick={() => handleDeleteSection(section.id)}
                                      aria-label="Delete section"
                                    >
                                      <TrashIcon className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {(editMode || section.note) &&
                                (editMode ? (
                                  <InlineEdit
                                    value={section.note}
                                    placeholder="Add note"
                                    className="text-base text-ink-700"
                                    multiline
                                    preserveLineBreaks
                                    canEdit={editMode}
                                    onSave={(value) => handleSectionUpdate(section.id, { note: value })}
                                  />
                                ) : (
                                  <div className="text-base text-ink-700 whitespace-pre-line">
                                    {section.note || "No note added."}
                                  </div>
                                ))}

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
                      );
                    })}
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

      {aiEnabled && !presentationMode && activeAiSection && (
        <div className="fixed inset-y-0 right-0 z-40 flex justify-end pointer-events-none">
          <div className="pointer-events-auto flex h-full w-full max-w-md flex-col border-l border-parchment-200 bg-white/95 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment-600">
                  Suggested verses based on the subheading
                </p>
                <h3 className="font-display text-lg font-semibold text-ink-900">
                  {activeAiSection.subheading || activeAiSection.title || "Section"}
                </h3>
                <p className="text-xs text-ink-500 truncate">{selectedLessonTitle}</p>
              </div>
              <button
                className="rounded-full border border-parchment-300 p-2 text-parchment-700 transition hover:border-parchment-500 hover:text-parchment-900"
                onClick={() => setActiveAiSectionId(null)}
                aria-label="Close AI recommendations"
              >
                <span className="block h-4 w-4 text-center leading-4">X</span>
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto">
              <AiPanel
                status={aiStatus}
                recommendation={aiRecommendations[activeAiSectionId]}
                onDownload={handleDownloadModel}
                onRequest={() => handleFetchRecommendations(activeAiSection)}
                onAdd={(citation) => handleAddRecommendation(activeAiSection.id, citation)}
              />
            </div>
          </div>
        </div>
      )}

      {!presentationMode && (
        <aside className="fade-in rounded-3xl border border-parchment-200 bg-white/70 p-4 shadow-lift">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-parchment-600">
              Lessons
            </h2>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-full border border-parchment-300 bg-white/80 px-2 py-1 text-xs text-ink-700">
                <SortIcon className="h-4 w-4" />
                <select
                  className="bg-transparent text-xs font-semibold uppercase tracking-wide text-ink-700 focus:outline-none"
                  value={lessonSort}
                  onChange={(e) => setLessonSort(e.target.value)}
                >
                  <option value="title-asc">Title A-Z</option>
                  <option value="title-desc">Title Z-A</option>
                  <option value="created-desc">Newest</option>
                  <option value="created-asc">Oldest</option>
                </select>
              </div>
              <button
                className="rounded-full bg-parchment-700 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white"
                onClick={() => setCreatingLesson(true)}
              >
                Add New
              </button>
            </div>
          </div>

            {creatingLesson && (
              <LessonCreator
                onCancel={() => setCreatingLesson(false)}
                onSave={handleCreateLesson}
              />
            )}

            <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
              {sortedLessons.map((lesson) => (
                <button
                  key={lesson.id}
                  className={`w-full rounded-2xl border px-3 py-2 text-left text-sm font-semibold transition ${
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

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-6 backdrop-blur"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-3xl border border-parchment-200 bg-white/95 p-6 shadow-lift"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment-600">
              Settings
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold text-ink-900">
              Preferences
            </h3>

            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-parchment-200 bg-parchment-50/70 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-ink-900">
                      Enable AI recommendations
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      Uses a local model to suggest relevant verses. You control when the
                      download happens.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 accent-parchment-700"
                    checked={aiEnabled}
                    onChange={(event) => setAiEnabled(event.target.checked)}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    className="rounded-full border border-parchment-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-parchment-700 transition hover:border-parchment-500 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleDownloadModel}
                    disabled={!aiEnabled || aiStatus.modelDownloaded || aiStatus.downloading}
                  >
                    {aiStatus.modelDownloaded
                      ? "Model Ready"
                      : aiStatus.downloading
                        ? "Downloading..."
                        : "Download Model"}
                  </button>
                  <span className="text-xs text-ink-500">
                    Model: {aiStatus.modelId || "BAAI/bge-small-en-v1.5"}
                  </span>
                </div>

                {!aiStatus.modelDownloaded && (
                  <p className="mt-2 text-xs text-ink-500">
                    Keyword fallback stays available when the model is not installed.
                  </p>
                )}
                {aiStatus.error && <p className="mt-2 text-xs text-rose-600">{aiStatus.error}</p>}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                className="rounded-full border border-parchment-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-parchment-700"
                onClick={() => setSettingsOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

function AiPanel({ status, recommendation, onDownload, onRequest, onAdd, onToggle, isOpen = true }) {
  const isLoading = recommendation?.loading;
  const results = Array.isArray(recommendation?.results) ? recommendation.results : [];
  const modeLabel = recommendation?.mode === "ai" ? "AI ranked" : "Keyword fallback";

  return (
    <div className="rounded-2xl border border-parchment-200 bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-parchment-600">
            Suggested verses based on the subheading
          </p>
          <p className="text-xs text-ink-500">
            {status.modelDownloaded
              ? "Model ready for smarter matches."
              : "Model not downloaded. Keyword fallback available."}
          </p>
          {recommendation?.mode && (
            <span className="mt-1 inline-block rounded-full border border-parchment-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-parchment-600">
              {modeLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onToggle && (
            <button
              className="rounded-full border border-parchment-300 p-2 text-parchment-700 transition hover:border-parchment-500 hover:text-parchment-900"
              onClick={onToggle}
              aria-label={isOpen ? "Hide AI recommendations" : "Show AI recommendations"}
            >
              <EyeToggleIcon hidden={!isOpen} className="h-4 w-4" />
            </button>
          )}
          {!status.modelDownloaded && (
            <button
              className="rounded-full border border-parchment-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-parchment-700 transition hover:border-parchment-500 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onDownload}
              disabled={status.downloading || status.loading}
            >
              {status.downloading ? "Downloading..." : "Download model"}
            </button>
          )}
          <button
            className="rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-70"
            onClick={onRequest}
            disabled={isLoading}
          >
            {isLoading ? "Finding..." : "Suggest verses"}
          </button>
        </div>
      </div>

      {status.error && <p className="mt-2 text-xs text-rose-600">{status.error}</p>}
      {recommendation?.error && (
        <p className="mt-2 text-xs text-rose-600">{recommendation.error}</p>
      )}

      {results.length ? (
        <div className="mt-3 space-y-2">
          {results.map((item) => (
            <div
              key={item.id || item.citation}
              className="rounded-xl border border-parchment-200 bg-white/80 p-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold uppercase tracking-wide text-parchment-700">
                    {item.citation}
                  </p>
                  <p className="text-sm leading-snug text-ink-700">{item.text}</p>
                </div>
                <button
                  className="rounded-full border border-parchment-300 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-parchment-700 transition hover:border-parchment-500"
                  onClick={() => onAdd(item.citation)}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !isLoading && (
          <p className="mt-3 text-xs text-ink-500">
            No suggestions yet. Click "Suggest verses" to populate.
          </p>
        )
      )}
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
