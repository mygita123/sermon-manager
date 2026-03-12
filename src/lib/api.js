const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:3927";

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    cache: "no-store",
    ...options
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listLessons() {
    return request("/lessons");
  },
  getLesson(id) {
    return request(`/lessons/${id}`);
  },
  createLesson(payload) {
    return request("/lessons", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  updateLesson(id, payload) {
    return request(`/lessons/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  deleteLesson(id) {
    return request(`/lessons/${id}`, {
      method: "DELETE"
    });
  },
  addSection(lessonId, payload) {
    return request(`/lessons/${lessonId}/sections`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  reorderSections(lessonId, order) {
    return request(`/lessons/${lessonId}/sections/order`, {
      method: "PATCH",
      body: JSON.stringify({ order })
    });
  },
  updateSection(sectionId, payload) {
    return request(`/sections/${sectionId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  deleteSection(sectionId) {
    return request(`/sections/${sectionId}`, {
      method: "DELETE"
    });
  },
  addBible(sectionId, payload) {
    return request(`/sections/${sectionId}/bibles`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  updateBible(bibleId, payload) {
    return request(`/section-bibles/${bibleId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  deleteBible(bibleId) {
    return request(`/section-bibles/${bibleId}`, {
      method: "DELETE"
    });
  },
  getBibleVerses(bibleId, mode) {
    const query = mode ? `?mode=${mode}` : "";
    return request(`/section-bibles/${bibleId}/verses${query}`);
  }
};
