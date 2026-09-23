// localStorage-backed persistence: exam templates + result history
const EXAMS_KEY = "lpea.exams.v1";
const HISTORY_KEY = "lpea.history.v1";

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

export const store = {
  getExams: () => readJSON(EXAMS_KEY, {}), // {id: {id, filename, savedAt, data}}
  saveExam(filename, data) {
    const exams = store.getExams();
    const id = data.examTitle ? slug(data.examTitle) + "-" + Date.now().toString(36) : "exam-" + Date.now().toString(36);
    exams[id] = { id, filename, savedAt: new Date().toISOString(), data };
    writeJSON(EXAMS_KEY, exams);
    return id;
  },
  deleteExam(id) { const e = store.getExams(); delete e[id]; writeJSON(EXAMS_KEY, e); },
  getHistory: () => readJSON(HISTORY_KEY, []),
  addResult(r) { const h = store.getHistory(); h.unshift({ ...r, id: "r" + Date.now().toString(36) }); writeJSON(HISTORY_KEY, h); return h; },
  deleteResult(id) { writeJSON(HISTORY_KEY, store.getHistory().filter(x => x.id !== id)); },
  setHistory(h) { writeJSON(HISTORY_KEY, h); },
};

function slug(s){return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,40)}

export function validateExam(data) {
  if (!data || typeof data !== "object") throw new Error("Not a JSON object");
  if (!data.examTitle || !Array.isArray(data.topics)) throw new Error("Missing examTitle or topics[]");
  data.topics.forEach((t,i)=>{
    if (!t.name || !Array.isArray(t.questions)) throw new Error(`topics[${i}] missing name/questions`);
    t.questions.forEach((q,j)=>{
      if (!q.question) throw new Error(`topics[${i}].questions[${j}] missing "question"`);
      const type = String(q.type || q.kind || "").toLowerCase();
      const writtenType = ["written", "essay", "short-answer", "short_answer", "free-text", "freetext", "open", "theory"].includes(type);
      if (writtenType || !Array.isArray(q.options)) {
        // Written question: record-only, just needs the prompt.
        // No options, no correctOptionIndex, no answer key.
        return;
      }
      if (typeof q.correctOptionIndex !== "number")
        throw new Error(`topics[${i}].questions[${j}] invalid (mcq needs options[] + correctOptionIndex)`);
    });
  });
  return true;
}
