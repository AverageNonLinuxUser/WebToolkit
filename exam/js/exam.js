// exam.html — live exam: navigator, questions, timer, submit.
import { store } from "./storage.js";
import { scoreSession, fmtTime, isAnswered } from "./engine.js";
import { $, escapeHtml } from "./common.js";
import { loadActive, saveActive, clearActive, saveLastResult } from "./active.js";

const active = loadActive();
if (!active || !active.session?.items?.length) {
  alert("No active exam — pick an exam first.");
  location.href = "index.html";
}

const state = {
  session: active.session,
  current: active.current || 0,
  mode: active.mode || "timed",
  examId: active.examId || null,
  timeLimitMin: active.timeLimitMin || 60,
  passPct: active.passPct || 70,
  endAt: active.endAt || Date.now() + 60 * 60 * 1000,
  timerId: null,
  submitted: false,
};

init();

function init() {
  $("exam-title-label").textContent = state.session.examTitle;
  $("mode-badge").textContent = state.mode === "timed" ? "Timed Exam" : "Practice";
  $("btn-check").classList.toggle("hidden", state.mode !== "practice");
  $("btn-prev").onclick = () => goTo(state.current - 1);
  $("btn-next").onclick = () => goTo(state.current + 1);
  $("btn-flag").onclick = () => { toggleFlag(state.current); persist(); renderQ(); renderNav(); };
  $("btn-check").onclick = checkAnswer;
  $("btn-submit").onclick = () => submitExam(false);
  $("btn-toggle-nav").onclick = () => $("navigator").classList.toggle("collapsed");
  renderQ();
  renderNav();
  startTimer();
}

function persist() {
  saveActive({
    session: state.session,
    current: state.current,
    mode: state.mode,
    examId: state.examId,
    timeLimitMin: state.timeLimitMin,
    passPct: state.passPct,
    endAt: state.endAt,
  });
}

function startTimer() {
  clearInterval(state.timerId);
  const tick = () => {
    const left = Math.round((state.endAt - Date.now()) / 1000);
    $("timer").textContent = fmtTime(left);
    $("timer").classList.toggle("danger", left < 5 * 60);
    if (left <= 0) { clearInterval(state.timerId); submitExam(true); }
  };
  tick();
  state.timerId = setInterval(tick, 500);
}

function goTo(i) {
  if (i < 0 || i >= state.session.items.length) return;
  state.current = i;
  persist();
  renderQ();
  renderNav();
}

function toggleFlag(i) {
  const f = state.session.flagged;
  f.has(i) ? f.delete(i) : f.add(i);
}

function renderNav() {
  const nav = $("navigator");
  nav.innerHTML = "";
  state.session.items.forEach((it, i) => {
    const b = document.createElement("button");
    const written = it.kind === "written";
    b.className =
      "nav-dot" + (isAnswered(state.session, i) ? " answered" : "") + (i === state.current ? " current" : "") +
      (state.session.flagged.has(i) ? " flagged" : "") + (written ? " written" : "");
    b.textContent = i + 1;
    b.title = written ? `Q${i + 1} (written)` : `Q${i + 1}`;
    b.onclick = () => goTo(i);
    nav.appendChild(b);
  });
  const answeredCount = state.session.items.filter((_, i) => isAnswered(state.session, i)).length;
  $("progress-fill").style.width = (answeredCount / state.session.items.length) * 100 + "%";
  $("progress-label").textContent = `Question ${state.current + 1} of ${state.session.items.length}`;
}

function renderQ() {
  const s = state.session, i = state.current, it = s.items[i];
  $("q-topic").textContent = it.topicName + (it.kind === "written" ? " · ✍️ Written" : "");
  $("q-count").textContent = `Q ${i + 1}/${s.items.length}${s.flagged.has(i) ? " · ⚑ flagged" : ""}`;
  $("q-text").textContent = it.question;
  $("btn-flag").textContent = s.flagged.has(i) ? "⚑ Unflag" : "⚑ Flag for review";
  const box = $("q-options");
  box.innerHTML = "";
  if (it.kind === "written") { renderWrittenQ(s, i, box); return; }
  const elim = s.eliminated[i] || new Set();
  it.options.forEach((opt) => {
    const div = document.createElement("div");
    const chosen = s.answers[i] === opt.origIndex;
    const checked = s.checked[i];
    div.className = "opt" + (chosen ? " selected" : "") + (elim.has(opt.origIndex) ? " eliminated" : "") +
      (checked ? (opt.origIndex === it.correctOrigIndex ? " correct" : chosen ? " wrong" : "") : "");
    div.innerHTML = `<input type="radio" ${chosen ? "checked" : ""} /> <span></span>`;
    div.querySelector("span").textContent = opt.text;
    div.onclick = (e) => {
      if (e.target.closest(".elim")) return;
      s.answers[i] = opt.origIndex;
      persist();
      renderQ();
      renderNav();
    };
    const x = document.createElement("button");
    x.className = "elim";
    x.title = "Eliminate option (strikethrough)";
    x.textContent = "🚫";
    x.onclick = () => {
      const set = (s.eliminated[i] = s.eliminated[i] || new Set());
      set.has(opt.origIndex) ? set.delete(opt.origIndex) : set.add(opt.origIndex);
      persist();
      renderQ();
    };
    div.appendChild(x);
    box.appendChild(div);
  });
  const ex = $("q-explain");
  if (s.checked[i] && it.explanation) {
    ex.innerHTML = "<b>Explanation:</b> " + escapeHtml(it.explanation);
    ex.classList.remove("hidden");
  } else ex.classList.add("hidden");
}

function renderWrittenQ(s, i, box) {
  const wrap = document.createElement("div");
  wrap.className = "written-wrap";
  const label = document.createElement("label");
  label.className = "field-label";
  label.innerHTML = `<span>Your answer <span class="muted small">(not auto-scored — graded later by an LLM)</span></span>`;
  const ta = document.createElement("textarea");
  ta.className = "written-input";
  ta.rows = 8;
  ta.placeholder = "Type your written answer here…";
  ta.value = typeof s.answers[i] === "string" ? s.answers[i] : "";
  const counter = document.createElement("small");
  counter.className = "muted";
  const updateCount = () => {
    const words = ta.value.trim() ? ta.value.trim().split(/\s+/).length : 0;
    counter.textContent = `${ta.value.length} chars · ${words} words`;
  };
  updateCount();
  ta.oninput = () => { s.answers[i] = ta.value; updateCount(); persist(); renderNav(); };
  label.appendChild(ta);
  wrap.appendChild(label);
  wrap.appendChild(counter);
  box.appendChild(wrap);
  const ex = $("q-explain");
  // Written answers have no answer key — practice-mode Check just confirms it is saved.
  if (s.checked[i]) {
    ex.innerHTML = "<b>Saved.</b> Written answers are not auto-checked — export the answer sheet at the end and let an LLM grade them.";
    ex.classList.remove("hidden");
  } else ex.classList.add("hidden");
}

function checkAnswer() {
  const s = state.session, i = state.current, it = s.items[i];
  if (it.kind === "written") {
    if (!isAnswered(s, i)) return alert("Type your answer first");
    s.checked[i] = true;
    persist();
    renderQ();
    return;
  }
  if (s.answers[i] === undefined) return alert("Select an option first");
  s.checked[i] = true;
  persist();
  renderQ();
}

function submitExam(auto = false) {
  if (state.submitted) return;
  state.submitted = true;
  clearInterval(state.timerId);
  const s = state.session;
  const { correct, total, pct, byTopic, writtenTotal, writtenAnswered, grandTotal } = scoreSession(s);
  const timeSpent = Math.round(state.timeLimitMin * 60 - Math.max(0, (state.endAt - Date.now()) / 1000));
  const passed = total ? pct >= state.passPct : true; // written-only exam: nothing to fail
  const result = {
    date: new Date().toISOString(),
    examId: state.examId,
    examTitle: s.examTitle,
    mode: state.mode,
    correct,
    total,
    pct,
    passed,
    passPct: state.passPct,
    timeSpentSec: timeSpent,
    byTopic,
    writtenTotal,
    writtenAnswered,
    grandTotal,
    answers: { ...s.answers },
    itemKeys: s.items.map((x) => x.qid),
    // Per-question snapshot so history.html can build a most-missed
    // focus list (question text + correct answer + explanation).
    items: s.items.map((it) => ({
      qid: it.qid,
      kind: it.kind,
      topicId: it.topicId,
      topicName: it.topicName,
      question: it.question,
      options: (it.options || []).map((o) => ({ text: o.text, origIndex: o.origIndex })),
      correctOrigIndex: it.correctOrigIndex,
      explanation: it.explanation || "",
    })),
  };
  store.addResult(result);
  saveLastResult({ result, session: s });
  clearActive();
  if (auto) alert("Time is up — exam auto-submitted.");
  location.href = "results.html";
}
