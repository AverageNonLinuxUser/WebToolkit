// Cross-page bridge. The old SPA kept the live exam in module memory;
// the multi-page app persists it in localStorage so exam.html / results.html
// can pick up where index.html left off (works over http(s) and file://).
const ACTIVE_KEY = "lpea.active.v1";
const LAST_KEY = "lpea.lastResult.v1";

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Session holds Sets (flagged, eliminated values) which JSON can't store.
export function serializeSession(s) {
  return {
    ...s,
    flagged: [...(s.flagged || [])],
    eliminated: Object.fromEntries(
      Object.entries(s.eliminated || {}).map(([k, v]) => [k, [...(v instanceof Set ? v : [])]])
    ),
  };
}

export function deserializeSession(s) {
  return {
    ...s,
    answers: s.answers || {},
    eliminated: Object.fromEntries(
      Object.entries(s.eliminated || {}).map(([k, v]) => [k, new Set(v || [])])
    ),
    flagged: new Set(s.flagged || []),
    checked: s.checked || {},
  };
}

// Active payload: { session, current, mode, examId, timeLimitMin, passPct, endAt }
export function saveActive(payload) {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...payload, session: serializeSession(payload.session) }));
}

export function loadActive() {
  const raw = readJSON(ACTIVE_KEY);
  if (!raw?.session) return null;
  return { ...raw, session: deserializeSession(raw.session) };
}

export function clearActive() {
  localStorage.removeItem(ACTIVE_KEY);
}

// Last result payload: { result, session } — rendered by results.html.
export function saveLastResult(lr) {
  localStorage.setItem(LAST_KEY, JSON.stringify({ result: lr.result, session: serializeSession(lr.session) }));
}

export function loadLastResult() {
  const raw = readJSON(LAST_KEY);
  if (!raw?.session || !raw?.result) return null;
  return { result: raw.result, session: deserializeSession(raw.session) };
}
