// results.html — score hero, LLM answer sheet, topic breakdown, review.
import { fmtTime, shuffle } from "./engine.js";
import { $, escapeHtml, dl } from "./common.js";
import { loadLastResult, saveActive } from "./active.js";

const loaded = loadLastResult();
if (!loaded) {
  alert("No attempt to show — take an exam first.");
  location.href = "index.html";
}

const { result, session } = loaded;

init();

function init() {
  renderResults(result);
  $("btn-retry-missed").onclick = () => {
    const missed = session.items.filter((it, i) => it.kind !== "written" && session.answers[i] !== it.correctOrigIndex);
    if (!missed.length) return alert("Nothing missed — perfect MCQ score!");
    saveActive({
      session: { examTitle: session.examTitle, items: shuffle(missed), answers: {}, eliminated: {}, flagged: new Set(), checked: {} },
      current: 0,
      mode: result.mode,
      examId: result.examId,
      timeLimitMin: 60,
      passPct: result.passPct ?? 70,
      endAt: Date.now() + 60 * 60 * 1000,
    });
    location.href = "exam.html";
  };
  $("btn-review").onclick = () => { $("review-list").classList.remove("hidden"); renderReview(); };
  $("btn-answer-sheet").onclick = downloadAnswerSheet;
  $("btn-copy-prompt").onclick = copyGradingPrompt;
}

function renderResults(r) {
  const writtenTotal = r.writtenTotal ?? 0, writtenAnswered = r.writtenAnswered ?? 0;
  const mcqNote = r.total === 0 ? "No auto-scored (MCQ) questions in this exam." : `${r.correct}/${r.total} MCQ correct`;
  $("score-hero").className = "card hero " + (r.passed ? "pass" : "fail");
  $("score-hero").innerHTML = `<h1>${r.total ? r.pct + "%" : "—"}</h1>
    <h2>${r.total ? (r.passed ? "✅ PASS" : "❌ FAIL") + " — " + mcqNote : "✍️ Written-only exam"}</h2>
    <p class="muted">${escapeHtml(r.examTitle)} · ${r.mode} · time ${fmtTime(r.timeSpentSec)} · pass mark ${r.passPct}% · saved to history</p>
    ${writtenTotal ? `<p>✍️ Written answers: ${writtenAnswered}/${writtenTotal} answered · <b>not auto-scored</b> — download the answer sheet below and paste it into an LLM for grading.</p>` : ""}
    <p class="muted small">Auto-score covers multiple-choice only. Written answers vary, so they are excluded from the % above.</p>`;
  const bd = $("topic-breakdown");
  bd.innerHTML = "";
  Object.values(r.byTopic).forEach((t) => {
    const p = t.total ? Math.round((t.correct / t.total) * 100) : 0;
    const d = document.createElement("div");
    d.innerHTML = `<p><b></b> <span class="muted">${t.correct}/${t.total} (${p}%)</span></p><div class="tbar"><div style="width:${p}%"></div></div>`;
    d.querySelector("b").textContent = t.name;
    bd.appendChild(d);
  });
  $("review-list").classList.add("hidden");
}

function renderReview() {
  const box = $("review-items");
  box.innerHTML = "";
  session.items.forEach((it, i) => {
    const d = document.createElement("div");
    d.className = "review-item";
    if (it.kind === "written") {
      const ans = typeof session.answers[i] === "string" ? session.answers[i] : "";
      d.innerHTML = `<p><b>Q${i + 1} [${escapeHtml(it.topicName)}] ✍️ Written</b> (not scored)<br>${escapeHtml(it.question)}</p>
        <p class="small">Your answer:<br><b>${ans.trim() ? escapeHtml(ans) : "— (blank) —"}</b></p>`;
      box.appendChild(d);
      return;
    }
    const chosen = session.answers[i];
    const ok = chosen === it.correctOrigIndex;
    d.innerHTML = `<p><b>Q${i + 1} [${escapeHtml(it.topicName)}]</b> ${ok ? "✅" : "❌"}<br>${escapeHtml(it.question)}</p>
      <p class="small">Your answer: <b>${chosen !== undefined ? escapeHtml(textOf(it, chosen)) : "—"}</b><br>
      Correct: <b>${escapeHtml(textOf(it, it.correctOrigIndex))}</b></p>
      ${it.explanation ? `<p class="small muted">💡 ${escapeHtml(it.explanation)}</p>` : ""}`;
    box.appendChild(d);
  });
}

function textOf(it, orig) {
  return it.options.find((o) => o.origIndex === orig)?.text || "?";
}

// ---------- Answer sheet (LLM grading) ----------
function buildAnswerSheetMarkdown() {
  const r = result, s = session;
  const lines = [];
  lines.push(`# Exam Answer Sheet — ${s.examTitle}`);
  lines.push("");
  lines.push(`- Date: ${new Date(r.date).toLocaleString()}`);
  lines.push(`- Mode: ${r.mode}`);
  lines.push(`- Written questions: ${r.writtenTotal ?? 0} (answered ${r.writtenAnswered ?? 0})`);
  lines.push(`- Time spent: ${fmtTime(r.timeSpentSec)}`);
  lines.push("");
  lines.push(`## Instructions for the LLM (paste this whole file into any LLM)`);
  lines.push("");
  lines.push(`> You are a strict but fair examiner. Grade ONLY the written answers below using your own domain knowledge.`);
  lines.push(`> For each written question: award a score, explain what was right/wrong in 1-2 sentences, and give 1-2 sentences of feedback.`);
  lines.push(`> Then output: (1) a table with one row per written question (marks + feedback), (2) a total written score.`);
  lines.push("");
  lines.push(`---`);
  lines.push("");
  let w = 0;
  s.items.forEach((it, i) => {
    if (it.kind !== "written") return; // answer sheet records written answers only
    w++;
    const ans = typeof s.answers[i] === "string" ? s.answers[i].trim() : "";
    lines.push(`### Written Q${w} [${it.topicName}]`);
    lines.push("");
    lines.push(`**Question:** ${it.question}`);
    lines.push("");
    lines.push(`**Student answer:**`);
    lines.push(ans ? "```\n" + ans + "\n```" : "_No answer given._");
    lines.push("");
  });
  if (!w) lines.push("_No written questions in this exam._\n");
  lines.push(`---`);
  lines.push(`LLM, please now grade the written answers as instructed above.`);
  lines.push("");
  return lines.join("\n");
}

function answerSheetFilename() {
  const title = (result?.examTitle || "exam").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "exam";
  const d = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `${title}-answer-sheet-${d}.md`;
}

function downloadAnswerSheet() {
  dl(new Blob([buildAnswerSheetMarkdown()], { type: "text/markdown" }), answerSheetFilename());
}

async function copyGradingPrompt() {
  try {
    await navigator.clipboard.writeText(buildAnswerSheetMarkdown());
    alert("Answer sheet copied — paste it into any LLM for grading.");
  } catch { alert("Copy blocked by the browser — use Download instead."); }
}
