import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
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

function BibleBlock({ bible, onExpand }) {
  const [loading, setLoading] = useState(false);
  const isExpanded = bible.mode === "full";

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);
    const nextMode = isExpanded ? "initial" : "full";
    await onExpand(bible.id, nextMode);
    setLoading(false);
  };

  return (
    <div className="rounded-2xl border border-parchment-200 bg-white/70 p-4 shadow-sm">
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
              className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
              onClick={() => bible.onDelete?.(bible.id)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      <div className="prose prose-slate mt-3 max-w-none prose-p:leading-relaxed">
        {bible.verses?.length ? (
          bible.verses.map((verse) => (
            <p key={verse.id}>
              <span className="font-semibold text-parchment-700">{verse.verse}. </span>
              {verse.text}
            </p>
          ))
        ) : (
          <p className="text-sm text-ink-500">No verses available for this citation.</p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [lessons, setLessons] = useState([]);
  const [selectedLessonId, setSelectedLessonId] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [creatingLesson, setCreatingLesson] = useState(false);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [titleEditSignal, setTitleEditSignal] = useState(0);
  const [confirmState, setConfirmState] = useState(null);
  const [toastItems, setToastItems] = useState([]);
  const [pendingScroll, setPendingScroll] = useState(null);
  const sectionRefs = React.useRef(new Map());

  const selectedLessonTitle = selectedLesson?.title || "Select a lesson";

  const refreshLessons = async (preferredId) => {
    const data = await api.listLessons();
    setLessons(data);
    if (!data.length) {
      setSelectedLessonId(null);
      return;
    }
    const targetId =
      preferredId ?? (data.some((lesson) => lesson.id === selectedLessonId) ? selectedLessonId : null);
    setSelectedLessonId(targetId || data[0].id);
  };

  const loadLesson = async (id, options = {}) => {
    const { showLoading = true } = options;
    if (showLoading) {
      setLoadingLesson(true);
    }
    const data = await api.getLesson(id);
    setSelectedLesson(data);
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
    const lesson = await api.createLesson({ title });
    await refreshLessons();
    setSelectedLessonId(lesson.id);
    setCreatingLesson(false);
    setEditMode(true);
  };

  const handleUpdateLessonTitle = async (value) => {
    if (!selectedLesson) return;
    await api.updateLesson(selectedLesson.id, { title: value || "Untitled Lesson" });
    await refreshLessons();
    await loadLesson(selectedLesson.id, { showLoading: false });
  };

  const handleAddSection = async () => {
    if (!selectedLesson) return;
    const order = selectedLesson.sections.length + 1;
    const created = await api.addSection(selectedLesson.id, {
      section_order: order,
      subheading: "",
      note: ""
    });
    await loadLesson(selectedLesson.id, { showLoading: false });
    if (created?.id) {
      setPendingScroll({ sectionId: created.id });
    }
  };

  const handleSectionUpdate = async (sectionId, payload) => {
    await api.updateSection(sectionId, payload);
    await loadLesson(selectedLesson.id, { showLoading: false });
    setPendingScroll({ sectionId });
  };

  const handleAddBible = async (sectionId, citation) => {
    if (!citation) return;
    const created = await api.addBible(sectionId, { citation });
    await loadLesson(selectedLesson.id, { showLoading: false });
    setPendingScroll({ sectionId, bibleId: created?.id });
  };

  const handleBibleUpdate = async (bibleId, citation, sectionId) => {
    if (!citation) return;
    await api.updateBible(bibleId, { citation });
    await loadLesson(selectedLesson.id, { showLoading: false });
    if (sectionId) {
      setPendingScroll({ sectionId, bibleId });
    }
  };

  const handleBibleExpand = async (bibleId, mode) => {
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

  const pushToast = (message, type = "success") => {
    const id = crypto.randomUUID();
    setToastItems((items) => [...items, { id, message, type }]);
    setTimeout(() => {
      setToastItems((items) => items.filter((item) => item.id !== id));
    }, 3200);
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
              onClick={() => setPresentationMode(true)}
            >
              Presentation Mode
            </button>
          </div>
        </header>
      )}

      {presentationMode && (
        <button
          className="fixed right-6 top-6 z-50 rounded-full bg-ink-900 px-4 py-2 text-sm font-semibold text-white shadow-lift"
          onClick={() => setPresentationMode(false)}
        >
          Minimize
        </button>
      )}

      <div
        className={`grid min-h-[calc(100vh-80px)] grid-cols-1 gap-6 p-6 ${
          presentationMode ? "bg-parchment-50" : "lg:grid-cols-[1fr_280px]"
        }`}
      >
        <main
          className={`fade-in rounded-3xl border border-parchment-200 bg-white/80 p-6 shadow-lift ${
            presentationMode ? "lg:col-span-2" : ""
          }`}
        >
          {loadingLesson ? (
            <div className="text-ink-500">Loading lesson...</div>
          ) : selectedLesson ? (
            <div className="space-y-8">
              <div className="border-b border-parchment-200 pb-5">
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
                        className="rounded-full border border-rose-300 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
                        onClick={() => handleDeleteLesson(selectedLesson.id)}
                      >
                        Delete Lesson
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-10">
                {selectedLesson.sections.map((section) => (
                  <div
                    key={section.id}
                    data-section-id={section.id}
                    ref={(node) => {
                      if (node) {
                        sectionRefs.current.set(section.id, node);
                      } else {
                        sectionRefs.current.delete(section.id);
                      }
                    }}
                    className="space-y-4 rounded-2xl bg-parchment-50/60 p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <InlineEdit
                        value={section.subheading}
                        placeholder="Add subheading"
                        className="font-display text-xl font-semibold text-ink-900"
                        canEdit={editMode}
                        onSave={(value) => handleSectionUpdate(section.id, { subheading: value })}
                      />
                      {editMode && (
                        <button
                          className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:border-rose-400 hover:text-rose-700"
                          onClick={() => handleDeleteSection(section.id)}
                        >
                          Delete Section
                        </button>
                      )}
                    </div>

                    <InlineEdit
                      value={section.note}
                      placeholder="Add note"
                      className="text-base text-ink-700"
                      multiline
                      canEdit={editMode}
                      onSave={(value) => handleSectionUpdate(section.id, { note: value })}
                    />

                    <div className="space-y-4">
                      {section.bibles.map((bible) => (
                        <div key={bible.id} data-bible-id={bible.id} className="space-y-2">
                          <InlineEdit
                            value={bible.citation}
                            placeholder="Bible citation"
                            className="text-sm font-semibold uppercase tracking-wide text-parchment-700"
                            canEdit={editMode}
                            onSave={(value) => handleBibleUpdate(bible.id, value, section.id)}
                          />
                          <BibleBlock
                            bible={{
                              ...bible,
                              canDelete: editMode,
                              onDelete: (id) => handleDeleteBible(id, section.id)
                            }}
                            onExpand={handleBibleExpand}
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
                ))}
              </div>

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
                className="rounded-full bg-rose-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-rose-700"
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmText}
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

  return (
    <div className="rounded-2xl border border-dashed border-parchment-300 bg-white/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-parchment-600">Add Bible Caption</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="flex-1 rounded-lg border border-parchment-200 bg-white/80 p-2 text-sm focus:border-parchment-400 focus:outline-none"
          placeholder="Jeremiah 2:19-22"
          value={citation}
          onChange={(event) => setCitation(event.target.value)}
        />
        <button
          className="rounded-full bg-ink-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          onClick={() => {
            onSave(citation);
            setCitation("");
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
