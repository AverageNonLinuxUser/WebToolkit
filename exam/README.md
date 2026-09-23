# Local Practice Exam Web App

Single-user, zero-backend exam app. Open `index.html` directly in a browser (or serve statically).

## Run
- Option A: double-click `index.html`
- Option B (recommended, avoids `fetch` file:// limits for sample): `npx serve .` or `python -m http.server`, then open the URL.

## Pages
- `index.html` — Select Exam: upload/select exam file, mode & timer, topics & counts, start.
- `exam.html` — Live exam: timer, progress, navigator, flag/eliminate, practice check, submit.
- `results.html` — Results: score hero, LLM answer-sheet download/copy, topic breakdown, review, retry missed.
- `history.html` — Score history: stats, trend chart, attempts table, 🎯 focus list (most-missed questions per exam with explanations).

Flow state (active exam, last result) is passed between pages via localStorage (`lpea.active.v1`, `lpea.lastResult.v1`), so serve over http(s) for best results.

## JSON schema
See `sample-exam.json`: `examTitle, version, defaultTimeLimitMinutes, topics[{id,name,defaultQuestionCount,questions[]}]`.
- MCQ: `{id, question, options[], correctOptionIndex, explanation}` (auto-scored, included in the score tally).
- Written: `{id, type:"written", question}` (record-only — no answer key needed, never scored by the app).

## Answer sheet (LLM grading)
Written answers are only recorded, never scored by the app. After submitting, use **⬇ Download Answer Sheet (.md)** (or **📋 Copy for LLM**) on the results screen. The file contains the written questions with your answers plus an instruction block — paste the whole file into any LLM and have it evaluate your written score.

## Storage keys
- `lpea.exams.v1` — uploaded exam templates
- `lpea.history.v1` — attempt records
