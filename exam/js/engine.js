// Exam session builder + scoring
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isWrittenQuestion(q) {
  if (!q || typeof q !== "object") return false;
  const t = String(q.type || q.kind || "").toLowerCase();
  if (["written", "essay", "short-answer", "short_answer", "free-text", "freetext", "open", "theory"].includes(t)) return true;
  // No options array => treated as written (backward compatible with MCQ files)
  if (!Array.isArray(q.options)) return true;
  return false;
}

export function buildSession(examData, { topicCounts, shuffleQ = true, shuffleO = false }) {
  const items = [];
  for (const topic of examData.topics) {
    const raw = topicCounts?.[topic.id] ?? topic.defaultQuestionCount ?? topic.questions.length;
    const n = Math.max(0, Math.min(Number(raw) || 0, topic.questions.length));
    let pool = shuffleQ ? shuffle(topic.questions) : [...topic.questions];
    pool.slice(0, n).forEach(q => {
      if (isWrittenQuestion(q)) {
        // Written: record-only. No answer key — just the prompt.
        // The student response is captured at exam time and exported for LLM grading.
        items.push({
          kind: "written",
          qid: q.id || Math.random().toString(36).slice(2),
          topicId: topic.id, topicName: topic.name,
          question: q.question,
        });
        return;
      }
      let options = q.options.map((text, idx) => ({ text, origIndex: idx }));
      if (shuffleO) options = shuffle(options);
      items.push({
        kind: "mcq",
        qid: q.id || Math.random().toString(36).slice(2),
        topicId: topic.id, topicName: topic.name,
        question: q.question, explanation: q.explanation || "",
        options, correctOrigIndex: q.correctOptionIndex,
      });
    });
  }
  const finalItems = shuffleQ ? shuffle(items) : items;
  return {
    examTitle: examData.examTitle,
    items: finalItems,
    answers: {},      // idx -> origIndex chosen (mcq) or free-text string (written)
    eliminated: {},   // idx -> Set(origIndex)
    flagged: new Set(),
    checked: {},      // practice-mode checked state
  };
}

export function isAnswered(session, idx) {
  const v = session.answers[idx];
  const it = session.items[idx];
  if (it?.kind === "written") return typeof v === "string" && v.trim().length > 0;
  return v !== undefined;
}

export function scoreSession(session) {
  let correct = 0, mcqTotal = 0, writtenTotal = 0, writtenAnswered = 0;
  const byTopic = {};
  session.items.forEach((it, i) => {
    if (it.kind === "written") {
      writtenTotal++;
      if (isAnswered(session, i)) writtenAnswered++;
      return; // written answers vary — never auto-scored, never in the tally
    }
    const t = (byTopic[it.topicId] = byTopic[it.topicId] || { name: it.topicName, total: 0, correct: 0 });
    t.total++;
    mcqTotal++;
    if (session.answers[i] === it.correctOrigIndex) { correct++; t.correct++; }
  });
  // Keep legacy field names: total/correct/pct refer to auto-scored (MCQ) questions only
  return {
    correct, total: mcqTotal, pct: mcqTotal ? Math.round(correct / mcqTotal * 100) : 0, byTopic,
    mcqTotal, writtenTotal, writtenAnswered,
    grandTotal: session.items.length,
  };
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}
