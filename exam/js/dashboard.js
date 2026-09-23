// index.html — exam selection: upload/select exam, mode & timer, topics, start.
import { store, validateExam } from "./storage.js";
import { buildSession } from "./engine.js";
import { $ } from "./common.js";
import { saveActive } from "./active.js";

const state = { examId: null, examData: null, mode: "timed" };

init();

function init() {
  bindDashboard();
  refreshExamList();
}

function bindDashboard() {
  const dz = $("dropzone"), fi = $("file-input");
  dz.onclick = () => fi.click();
  ["dragover", "dragenter"].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((e) => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (ev) => { const f = ev.dataTransfer.files[0]; if (f) loadFile(f); });
  fi.onchange = () => { if (fi.files[0]) loadFile(fi.files[0]); };

  $("saved-exams").onchange = (e) => selectExam(e.target.value);
  $("btn-delete-exam").onclick = () => {
    if (state.examId) { store.deleteExam(state.examId); state.examId = null; state.examData = null; refreshExamList(); }
  };
  $("btn-load-sample").onclick = async () => {
    const res = await fetch("sample-exam.json");
    const data = await res.json();
    const id = store.saveExam("sample-exam.json", data);
    refreshExamList(id);
  };
  $("mode-selector").querySelectorAll("button").forEach((b) => (b.onclick = () => {
    state.mode = b.dataset.mode;
    document.querySelectorAll("#mode-selector button").forEach((x) => x.classList.toggle("active", x === b));
  }));
  $("btn-start").onclick = () => startExam();
  $("btn-export-history").onclick = () => {
    const blob = new Blob([JSON.stringify(store.getHistory(), null, 2)], { type: "application/json" });
    dl(blob, "exam-history.json");
  };
  $("history-import").onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const h = JSON.parse(r.result);
        if (Array.isArray(h)) { store.setHistory(h); alert("History imported"); }
      } catch { alert("Invalid history file"); }
    };
    r.readAsText(f);
  };
}

async function loadFile(f) {
  try {
    const data = JSON.parse(await f.text());
    validateExam(data);
    const id = store.saveExam(f.name, data);
    refreshExamList(id);
  } catch (err) { alert("Invalid exam JSON: " + err.message); }
}

function refreshExamList(selectId) {
  const exams = store.getExams();
  const sel = $("saved-exams");
  sel.innerHTML = "";
  const ids = Object.keys(exams);
  if (!ids.length) sel.innerHTML = "<option value=''>— no exams yet —</option>";
  ids.forEach((id) => {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${exams[id].data.examTitle} (${exams[id].filename})`;
    sel.appendChild(o);
  });
  selectExam(selectId || ids[0] || "");
}

function selectExam(id) {
  const exams = store.getExams();
  $("saved-exams").value = id;
  state.examId = id;
  state.examData = exams[id]?.data || null;
  if (!state.examData) {
    $("topic-rows").innerHTML = "";
    $("btn-start").disabled = true;
    $("exam-meta").textContent = "";
    return;
  }
  $("time-limit").value = state.examData.defaultTimeLimitMinutes || 60;
  $("exam-meta").textContent = `${state.examData.examTitle} · v${state.examData.version || "?"} · ${state.examData.topics.length} topics · ${state.examData.topics.reduce((a, t) => a + t.questions.length, 0)} questions`;
  renderTopics();
}

function renderTopics() {
  const tb = $("topic-rows");
  tb.innerHTML = "";
  // Guarantee a stable key even if the JSON omits topic ids
  state.examData.topics.forEach((t, i) => { if (t.id == null || t.id === "") t.id = "__topic_" + i; });
  state.examData.topics.forEach((t) => {
    const tr = document.createElement("tr");
    const avail = t.questions.length;
    const def = Math.min(t.defaultQuestionCount ?? avail, avail);
    const chk = document.createElement("input");
    chk.type = "checkbox"; chk.checked = true; chk.dataset.inc = t.id;
    const num = document.createElement("input");
    num.type = "number"; num.min = "0"; num.max = String(avail); num.value = String(def);
    num.dataset.count = t.id; num.style.width = "80px";
    tr.insertCell().appendChild(chk);
    const nameCell = tr.insertCell(); nameCell.textContent = t.name;
    const availCell = tr.insertCell(); availCell.textContent = avail;
    tr.insertCell().appendChild(num);
    tb.appendChild(tr);
  });
  const update = () => {
    let total = 0;
    // Read per-row (no CSS selector interpolation, so any topic id works)
    tb.querySelectorAll("tr").forEach((tr) => {
      const chk = tr.querySelector("[data-inc]");
      const num = tr.querySelector("[data-count]");
      if (chk?.checked) total += Math.max(0, Math.min(+num?.value || 0, +(num?.max ?? 0)));
    });
    $("total-selected").textContent = `Total selected: ${total} questions`;
    $("btn-start").disabled = total === 0;
  };
  tb.onchange = update;
  tb.oninput = update;
  update();
}

function startExam() {
  const counts = {};
  // Read per-row so topic ids with special characters (or duplicates) can't break matching
  $("topic-rows").querySelectorAll("tr").forEach((tr) => {
    const chk = tr.querySelector("[data-inc]");
    const num = tr.querySelector("[data-count]");
    if (!num) return;
    const key = num.dataset.count;
    counts[key] = chk?.checked ? Math.max(0, +num.value || 0) : 0;
  });
  const session = buildSession(state.examData, {
    topicCounts: counts,
    shuffleQ: $("shuffle-q").checked,
    shuffleO: $("shuffle-o").checked,
  });
  if (!session.items.length) return alert("No questions selected");
  const timeLimitMin = +$("time-limit").value || 60;
  saveActive({
    session,
    current: 0,
    mode: state.mode,
    examId: state.examId,
    timeLimitMin,
    passPct: +$("pass-pct").value || 70,
    endAt: Date.now() + timeLimitMin * 60 * 1000,
  });
  location.href = "exam.html";
}

function dl(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
