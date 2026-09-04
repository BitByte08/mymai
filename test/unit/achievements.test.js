// src/achievements.ts — 04:00 KST 기준 플레이 날짜 계산. 순수 함수.
const test = require("node:test");
const assert = require("node:assert/strict");
const a = require("../../dist/achievements");

test("koreaPlayDayKey: 04:00 KST 경계", () => {
  // 2026-01-02 03:59 KST == 2026-01-01 18:59 UTC → 아직 전날(01-01)
  assert.equal(a.koreaPlayDayKey(new Date("2026-01-01T18:59:00Z")), "2026-01-01");
  // 2026-01-02 04:00 KST == 2026-01-01 19:00 UTC → 새 날(01-02)
  assert.equal(a.koreaPlayDayKey(new Date("2026-01-01T19:00:00Z")), "2026-01-02");
  // 정오 KST
  assert.equal(a.koreaPlayDayKey(new Date("2026-03-15T03:00:00Z")), "2026-03-15");
});

test("koreaPlayDayRange: [04:00 KST, +24h)", () => {
  const { from, to } = a.koreaPlayDayRange("2026-01-02");
  assert.equal(new Date(from).toISOString(), "2026-01-01T19:00:00.000Z");
  assert.equal(to - from, 24 * 60 * 60 * 1000);
});

test("playDayKeyFromRecordDate", () => {
  assert.equal(a.playDayKeyFromRecordDate("2026/01/02 03:59", "fallback"), "2026-01-01");
  assert.equal(a.playDayKeyFromRecordDate("2026/01/02 04:00", "fallback"), "2026-01-02");
  assert.equal(a.playDayKeyFromRecordDate("not a date", "2020-01-01"), "2020-01-01");
});

test("hasValidRecordDate", () => {
  assert.equal(a.hasValidRecordDate("2026/01/02 12:00"), true);
  assert.equal(a.hasValidRecordDate("2026-01-02"), true);
  assert.equal(a.hasValidRecordDate("garbage"), false);
  assert.equal(a.hasValidRecordDate("2026/13/40 99:99"), false);
});

test("recordPlayedAt falls back to now on unparseable input", () => {
  const before = Date.now();
  const ts = a.recordPlayedAt("nonsense");
  assert.ok(ts >= before && ts <= Date.now() + 1000);
});
