// Run: node --test skills/mule-development/upgrade-mule-app/lib/step-timing.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeReport, formatMs, isValidLabel, nextLabel, readEvents, recordDescribe,
  renderReport, timingActive, appendEvent,
} from './step-timing.mjs';

const m = (step, ts) => ({ t: 'mark', step, ts });
const row = (report, label) => report.rows.find((r) => r.label === label);

test('step duration is the time to the next mark; the last step runs to the report time', () => {
  const r = computeReport([m('1', 0), m('2', 5000), m('3', 8000)], 20000);
  assert.equal(row(r, '1').ms, 5000);
  assert.equal(row(r, '2').ms, 3000);
  assert.equal(row(r, '3').ms, 12000);
  assert.equal(r.totalMs, 20000);
});

test('repeat visits to a label are summed and counted (loop-back from Step 12.4)', () => {
  const r = computeReport([m('7', 0), m('12.4', 1000), m('7', 4000), m('12.4', 6000)], 7000);
  assert.equal(row(r, '7').ms, 1000 + 2000);
  assert.equal(row(r, '12.4').ms, 3000 + 1000);
  assert.equal(row(r, '7').visits, 2);
  assert.equal(row(r, '12.4').visits, 2);
});

test('user wait is carved out of its step and reported separately', () => {
  const events = [
    m('12.4', 0),
    { t: 'wait', kind: 'start', ts: 2000 },
    { t: 'wait', kind: 'end', ts: 92000 },
    m('13', 100000),
  ];
  const r = computeReport(events, 110000);
  assert.equal(row(r, '12.4').ms, 10000);
  assert.equal(row(r, '12.4').waitMs, 90000);
  assert.match(renderReport(r), /12\.4 \(user wait\) \| 1m 30s/);
});

test('an unpaired wait-start is closed at the report time', () => {
  const r = computeReport([m('12.4', 0), { t: 'wait', kind: 'start', ts: 1000 }], 5000);
  assert.equal(row(r, '12.4').waitMs, 4000);
  assert.equal(row(r, '12.4').ms, 1000);
});

test('steps 16/17 attempts are numbered by the script and listed separately', () => {
  let events = [];
  for (const step of ['16', '16', '17']) events.push(m(nextLabel(step, events), events.length * 5000));
  assert.deepEqual(events.map((e) => e.step), ['16#1', '16#2', '17#1']);
  assert.equal(nextLabel('7a', events), '7a');
  const r = computeReport(events, 20000);
  assert.deepEqual(r.rows.map((x) => x.label), ['16#1', '16#2', '17#1']);
});

test('unmarked steps before the last mark are "no mark"; later ones are "not reached"', () => {
  const r = computeReport([m('1', 0), m('2', 1), m('4', 2)], 3);
  assert.ok(r.noMark.includes('3'));
  assert.ok(r.noMark.includes('3.5'));
  assert.ok(!r.noMark.includes('13'));
  assert.ok(r.notReached.includes('13'));
  assert.ok(!r.notReached.includes('3'));
});

test('labels outside the expected list are flagged as unrecognized', () => {
  const r = computeReport([m('1', 0), m('99', 1)], 2);
  assert.deepEqual(r.unknown, ['99']);
});

test('isValidLabel accepts step labels and rejects path-like input', () => {
  for (const ok of ['1', '3.5', '12.4', '16#2', '7a']) assert.equal(isValidLabel(ok), true, ok);
  for (const bad of ['', '../x', 'a/b', 'a\\b', 'x'.repeat(21), undefined, '.1', '1 2']) assert.equal(isValidLabel(bad), false, String(bad));
});

test('formatMs renders ms, seconds and minutes', () => {
  assert.equal(formatMs(850), '850ms');
  assert.equal(formatMs(12300), '12.3s');
  assert.equal(formatMs(247000), '4m 07s');
});

test('marks fired less than 1s apart are merged into one row with the work that followed', () => {
  const r = computeReport([m('7b', 0), m('8', 5000), m('9', 5100), m('10', 5200), m('11a', 13200)], 20000);
  assert.deepEqual(r.rows.map((x) => x.label), ['7b', '8 + 9 + 10', '11a']);
  assert.equal(row(r, '8 + 9 + 10').ms, 8200);
  assert.equal(row(r, '7b').ms, 5000);
  assert.equal(r.merged, true);
  assert.match(renderReport(r), /\| 8 \+ 9 \+ 10 \| 8\.2s \|/);
  assert.match(renderReport(r), /cannot be split/);
});

test('a short step is not merged when its time is user wait, and the last step stands alone', () => {
  const events = [m('12.4', 0), { t: 'wait', kind: 'start', ts: 100 }, { t: 'wait', kind: 'end', ts: 59000 }, m('13', 60000), m('19', 70000)];
  const r = computeReport(events, 70050);
  assert.deepEqual(r.rows.map((x) => x.label), ['12.4', '13', '19']);
  assert.equal(r.merged, false);
});

test('describe records are summarised in the report', () => {
  const events = [
    m('7b', 0),
    { t: 'describe', nick: 'http-new', mode: 'B', name: 'request', durationMs: 4000 },
    { t: 'describe', nick: 'kafka-new', mode: 'C', name: 'sasl', configName: 'cfg', durationMs: 9000 },
  ];
  const text = renderReport(computeReport(events, 20000));
  assert.match(text, /2 calls, 13\.0s total, slowest 9\.0s \(kafka-new \/ mode C \/ sasl \/ cfg\)/);
});

test('recordDescribe is a no-op unless timing is on, and never throws', () => {
  const dir = mkdtempSync(join(tmpdir(), 'step-timing-'));
  try {
    recordDescribe(dir, { nick: 'x', durationMs: 1 });
    assert.equal(timingActive(dir), false);
    appendEvent(dir, { t: 'init', ts: 1 });
    recordDescribe(dir, { nick: 'x', mode: 'A', durationMs: 5 });
    const events = readEvents(dir);
    assert.equal(events.length, 2);
    assert.equal(events[1].t, 'describe');
    recordDescribe('/nonexistent/\0bad', { nick: 'x' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
