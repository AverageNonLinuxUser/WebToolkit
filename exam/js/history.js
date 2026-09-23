// history.html — score history: stats, trend chart, attempts table, focus list.
import { store } from "./storage.js";
import { fmtTime } from "./engine.js";
import { $, escapeHtml } from "./common.js";

init();

function init() {
  renderHistory();
  renderFocusList();
}

function renderHistory() {
  const h = store.getHistory();
  const stats = $("history-stats");
  if (!h.length) { stats.innerHTML = "<div class='stat'>No attempts yet</div>"; }
  else {
    const pcts = h.map((x) => x.pct);
    stats.innerHTML = `
      <div class="stat"><b>${Math.max(...pcts)}%</b>Highest score</div>
      <div class="stat"><b>${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%</b>Average (${h.length} attempts)</div>
      <div class="stat"><b>${h.length}</b>Total attempts</div>`;
  }
  const tb = $("history-rows");
  tb.innerHTML = "";
  h.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${new Date(r.date).toLocaleString()}</td><td></td><td>${r.mode}</td>
      <td><b>${r.pct}%</b> (${r.correct}/${r.total}) ${r.passed ? "✅" : "❌"}</td><td>${fmtTime(r.timeSpentSec)}</td>
      <td><button class="btn ghost">Delete</button></td>`;
    tr.children[1].textContent = r.examTitle;
    tr.querySelector("button").onclick = () => { store.deleteResult(r.id); renderHistory(); };
    tb.appendChild(tr);
  });
  drawTrend(h);
}

// ---------- Focus list: questions sorted by how often they were missed ----------
function renderFocusList() {
  const h = store.getHistory();
  const sel = $("focus-exam");
  const box = $("focus-list");
  if (!sel || !box) return;

  // Distinct exams present in history (fall back to title when examId missing)
  const exams = [];
  const seenExam = new Set();
  h.forEach((r) => {
    const key = r.examId || "exam:" + r.examTitle;
    if (!seenExam.has(key)) { seenExam.add(key); exams.push({ key, examId: r.examId, title: r.examTitle }); }
  });
  sel.innerHTML = "";
  if (!exams.length) { box.innerHTML = "<p class='muted'>No attempts yet — your most-missed questions will appear here.</p>"; return; }
  exams.forEach((e) => {
    const o = document.createElement("option");
    o.value = e.key;
    o.textContent = e.title;
    sel.appendChild(o);
  });

  const render = () => {
    const key = sel.value;
    const attempts = h.filter((r) => (r.examId || "exam:" + r.examTitle) === key);
    // Aggregate per question across attempts with stored snapshots.
    // Keyed by qid; snapshots hold text + correct answer + explanation.
    const byQ = new Map();
    let legacy = 0;
    attempts.forEach((r) => {
      if (!Array.isArray(r.items)) { legacy++; return; }
      r.items.forEach((it, i) => {
        if (!it || it.kind === "written") return; // written is never scored
        const qkey = it.qid || it.question;
        let e = byQ.get(qkey);
        if (!e) {
          e = {
            qid: it.qid, topicName: it.topicName || "?", question: it.question || "?",
            options: it.options || [], correctOrigIndex: it.correctOrigIndex,
            explanation: it.explanation || "", seen: 0, missed: 0,
          };
          byQ.set(qkey, e);
        }
        e.seen++;
        if (r.answers?.[i] !== it.correctOrigIndex) e.missed++;
      });
    });
    const rows = [...byQ.values()].sort((a, b) => b.missed - a.missed || (b.missed / b.seen) - (a.missed / a.seen));
    box.innerHTML = "";
    if (legacy && !rows.length) {
      box.innerHTML = "<p class='muted'>These attempts were saved before question details were recorded — stats build up from new attempts.</p>";
      return;
    }
    if (!rows.length) { box.innerHTML = "<p class='muted'>No multiple-choice questions found for this exam.</p>"; return; }
    if (!rows.some((r) => r.missed > 0)) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = `Nothing missed across ${attempts.length} attempt(s) — perfect record for this exam.`;
      box.appendChild(p);
    }
    rows.forEach((e, idx) => {
      const pct = e.seen ? Math.round((e.missed / e.seen) * 100) : 0;
      const d = document.createElement("div");
      d.className = "review-item";
      d.innerHTML = `<p><b>#${idx + 1} · missed ${e.missed}/${e.seen} (${pct}%)</b> <span class="badge"></span><br></p>
        <p class="small">Correct answer: <b></b></p>
        <p class="small muted"></p>`;
      d.querySelector("b").textContent = `#${idx + 1} · missed ${e.missed}/${e.seen} (${pct}%)`;
      d.querySelector(".badge").textContent = e.topicName;
      const q = document.createElement("span");
      q.textContent = e.question;
      d.querySelector("p").appendChild(q);
      d.querySelectorAll("p.small b")[0].textContent = textOf(e, e.correctOrigIndex);
      d.querySelector("p.small.muted").textContent = e.explanation ? "💡 " + e.explanation : "No explanation provided for this question.";
      box.appendChild(d);
    });
    if (legacy) {
      const p = document.createElement("p");
      p.className = "muted small";
      p.textContent = `Note: ${legacy} older attempt(s) without question details are excluded.`;
      box.appendChild(p);
    }
  };
  sel.onchange = render;
  render();
}

function textOf(it, orig) {
  return it.options?.find((o) => o.origIndex === orig)?.text || "?";
}

function drawTrend(h) {
  const c = $("trend-chart"), ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  const data = [...h].reverse().slice(-30);
  if (!data.length) { ctx.fillStyle = "#94a3b8"; ctx.fillText("No data yet", 20, 30); return; }
  ctx.strokeStyle = "#2b2e5c";
  ctx.beginPath();
  ctx.moveTo(40, 10);
  ctx.lineTo(40, 190);
  ctx.lineTo(790, 190);
  ctx.stroke();
  ctx.strokeStyle = "#a2b2f7";
  ctx.lineWidth = 2;
  ctx.beginPath();
  data.forEach((r, i) => {
    const x = 50 + (i * 740) / Math.max(1, data.length - 1);
    const y = 190 - (r.pct / 100) * 170;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;
}
