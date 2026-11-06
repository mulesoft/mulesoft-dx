// step-timing.mjs — opt-in per-step wall-clock timing (debug mode): event log
// (append-only JSONL), report computation, and markdown rendering. Used by
// scripts/step_timer.mjs and scripts/describe_connector.mjs.
//
// Timing is ON for a run iff the timing file exists (created by
// `step_timer.mjs init`). The file lives in the app directory, OUTSIDE tmp/,
// because Step 19 deletes tmp/. Nothing here may ever break an upgrade: callers
// swallow errors.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const TIMING_FILE_ENV = 'UPGRADE_MULE_APP_TIMING_FILE';
export const DEFAULT_TIMING_FILE = 'upgrade-timing.jsonl';

// Expected steps, in workflow order. Steps 5 and 11 are marked at sub-step level
// only (5a/5b, 11a/11b); 2 and 4 cover their lettered sub-steps. Steps 16/17 are
// marked once per attempt (16#1, 16#2, ...).
export const EXPECTED_STEPS = [
  '1', '2', '3', '3b', '3c', '3.5', '4', '5a', '5b', '6', '6.5', '7', '7a', '7b',
  '8', '9', '10', '11a', '11b', '11.5', '12.0', '12.1', '12.2', '12.3', '12.4',
  '13', '14', '14.5', '15', '16', '17', '18', '19',
];

const LABEL_RE = /^[0-9A-Za-z][0-9A-Za-z.#_-]{0,19}$/;

/** @param {string} label @returns {boolean} True iff label is safe to record. */
export function isValidLabel(label) {
  return typeof label === 'string' && LABEL_RE.test(label);
}

/** @param {string} label @returns {string} Label without the `#<attempt>` suffix. */
export function baseLabel(label) {
  return String(label).split('#')[0];
}

/** @param {string} [projectDir] @returns {string} Absolute path of the timing JSONL file. */
export function timingPath(projectDir = '.') {
  const override = process.env[TIMING_FILE_ENV];
  return override ? path.resolve(override) : path.resolve(projectDir, DEFAULT_TIMING_FILE);
}

/** @param {string} jsonlPath @returns {string} Path of the rendered table next to the JSONL. */
export function reportPath(jsonlPath) {
  return jsonlPath.replace(/\.jsonl$/, '') + '.md';
}

/** @param {string} [projectDir] @returns {boolean} True iff timing mode is on for this project. */
export function timingActive(projectDir = '.') {
  return existsSync(timingPath(projectDir));
}

/** @returns {number} Epoch ms; STEP_TIMER_NOW overrides the clock (tests only). */
export function now() {
  const injected = Number(process.env.STEP_TIMER_NOW);
  return Number.isFinite(injected) && process.env.STEP_TIMER_NOW ? injected : Date.now();
}

/** @param {string} projectDir @param {object} event Appended as one JSON line. */
export function appendEvent(projectDir, event) {
  const p = timingPath(projectDir);
  mkdirSync(path.dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(event) + '\n');
}

/** @param {string} projectDir @returns {object[]} Parsed events; unparseable lines are skipped. */
export function readEvents(projectDir) {
  const p = timingPath(projectDir);
  if (!existsSync(p)) return [];
  const events = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* skip a torn line */ }
  }
  return events;
}

/**
 * Resolve the label to record. Steps 16/17 are numbered by the script
 * (`16` -> `16#<n>`), so the model never has to track the attempt count.
 * @param {string} step @param {object[]} events @returns {string}
 */
export function nextLabel(step, events) {
  if (step !== '16' && step !== '17') return step;
  const n = events.filter((e) => e.t === 'mark' && baseLabel(e.step) === step).length + 1;
  return `${step}#${n}`;
}

/**
 * Best-effort record of one describe-connector CLI call. Never throws.
 * No-op unless timing mode is on.
 */
export function recordDescribe(projectDir, rec) {
  try {
    if (!timingActive(projectDir)) return;
    appendEvent(projectDir, { t: 'describe', ts: now(), ...rec });
  } catch { /* timing must never affect the upgrade */ }
}

// Marks closer together than this were fired in one batch (the work came after
// them), so their individual times are meaningless and the rows are merged.
export const BATCH_GAP_MS = 1000;

function orderKey(label) {
  const first = String(label).split(' + ')[0];
  const idx = EXPECTED_STEPS.indexOf(baseLabel(first));
  const attempt = Number(first.split('#')[1] ?? 0);
  return [idx === -1 ? Infinity : idx, attempt];
}

/**
 * Compute the per-step table from the event log.
 * Step duration = time from its mark to the next mark (the last step runs to
 * `endTs`). Repeat visits to a label are summed. User-wait intervals are carved
 * out of the step they happened in and reported as their own rows.
 * @param {object[]} events @param {number} endTs Epoch ms the report was requested.
 */
export function computeReport(events, endTs) {
  const marks = events.filter((e) => e.t === 'mark');
  const raw = marks.map((m, i) => ({
    label: m.step,
    start: m.ts,
    end: marks[i + 1] ? marks[i + 1].ts : endTs,
  }));
  // Merge each run of batched marks (gap < BATCH_GAP_MS) with the interval that
  // follows it — that is where the batch's work actually landed. The last
  // interval stands alone.
  const intervals = [];
  let merged = false;
  for (let i = 0; i < raw.length; i++) {
    let iv = { ...raw[i], waitMs: 0 };
    while (iv.end - iv.start < BATCH_GAP_MS && i + 1 < raw.length) {
      i += 1;
      const labels = iv.label.split(' + ');
      if (!labels.includes(raw[i].label)) labels.push(raw[i].label);
      iv = { label: labels.join(' + '), start: iv.start, end: raw[i].end, waitMs: 0 };
      merged = true;
    }
    intervals.push(iv);
  }

  const waits = [];
  let open = null;
  for (const e of events) {
    if (e.t === 'wait' && e.kind === 'start' && open === null) open = e.ts;
    else if (e.t === 'wait' && e.kind === 'end' && open !== null) { waits.push([open, e.ts]); open = null; }
  }
  if (open !== null) waits.push([open, endTs]);

  for (const [ws, we] of waits) {
    let iv = null;
    for (const cand of intervals) if (cand.start <= ws && ws <= cand.end) iv = cand;
    if (!iv) continue;
    iv.waitMs += Math.max(0, Math.min(we, iv.end) - ws);
  }

  const byLabel = new Map();
  for (const iv of intervals) {
    const row = byLabel.get(iv.label) ?? { label: iv.label, ms: 0, visits: 0, waitMs: 0, waitVisits: 0 };
    row.ms += Math.max(0, iv.end - iv.start - iv.waitMs);
    row.visits += 1;
    if (iv.waitMs > 0) { row.waitMs += iv.waitMs; row.waitVisits += 1; }
    byLabel.set(iv.label, row);
  }
  const rows = [...byLabel.values()].sort((a, b) => {
    const [ai, aa] = orderKey(a.label);
    const [bi, ba] = orderKey(b.label);
    return ai - bi || aa - ba;
  });

  const totalMs = marks.length ? Math.max(0, endTs - marks[0].ts) : 0;

  const markedBases = new Set(marks.map((m) => baseLabel(m.step)));
  const lastIdx = Math.max(-1, ...[...markedBases].map((b) => EXPECTED_STEPS.indexOf(b)));
  const noMark = [];
  const notReached = [];
  EXPECTED_STEPS.forEach((s, i) => {
    if (markedBases.has(s)) return;
    (i < lastIdx ? noMark : notReached).push(s);
  });
  const unknown = [...markedBases].filter((b) => !EXPECTED_STEPS.includes(b));

  const describes = events.filter((e) => e.t === 'describe');
  const describeTotalMs = describes.reduce((s, d) => s + (d.durationMs ?? 0), 0);
  const slowest = describes.reduce((best, d) => (!best || (d.durationMs ?? 0) > (best.durationMs ?? 0) ? d : best), null);

  return { rows, totalMs, noMark, notReached, unknown, describes, describeTotalMs, slowest, merged };
}

/** @param {number} ms @returns {string} e.g. `850ms`, `12.3s`, `4m 07s`. */
export function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 59950) return `${(ms / 1000).toFixed(1)}s`;
  const totalSec = Math.round(ms / 1000);
  return `${Math.floor(totalSec / 60)}m ${String(totalSec % 60).padStart(2, '0')}s`;
}

function describeName(d) {
  const parts = [d.nick, d.mode ? `mode ${d.mode}` : null, d.name, d.configName].filter(Boolean);
  return parts.join(' / ');
}

/** @param {ReturnType<typeof computeReport>} report @returns {string} Markdown. */
export function renderReport(report) {
  const { rows, totalMs } = report;
  const pct = (ms) => (totalMs > 0 ? `${((ms / totalMs) * 100).toFixed(1)}%` : '-');
  const out = [];
  out.push('# upgrade-mule-app step timing', '');
  out.push(`Total wall time (first mark to report): **${formatMs(totalMs)}**. Wall-clock: includes the mark calls themselves and any time the machine slept.`, '');
  out.push('| Step | Time | % of total | Visits |', '| --- | --- | --- | --- |');
  for (const r of rows) {
    out.push(`| ${r.label} | ${formatMs(r.ms)} | ${pct(r.ms)} | ${r.visits} |`);
    if (r.waitVisits > 0) out.push(`| ${r.label} (user wait) | ${formatMs(r.waitMs)} | ${pct(r.waitMs)} | ${r.waitVisits} |`);
  }
  if (rows.length === 0) out.push('| (no marks recorded) | - | - | - |');
  out.push('');
  if (report.merged) out.push('Rows joined with `+` were marked less than 1s apart (several marks in one command), so their time cannot be split between them.', '');
  if (report.noMark.length) out.push(`No mark (skipped, or the mark was missed): ${report.noMark.join(', ')}`, '');
  if (report.notReached.length) out.push(`Not reached before the report: ${report.notReached.join(', ')}`, '');
  if (report.unknown.length) out.push(`Unrecognized labels: ${report.unknown.join(', ')}`, '');
  if (report.describes.length) {
    out.push('## describe_connector calls', '');
    out.push(`${report.describes.length} calls, ${formatMs(report.describeTotalMs)} total, slowest ${formatMs(report.slowest.durationMs ?? 0)} (${describeName(report.slowest)}).`, '');
  }
  return out.join('\n');
}
