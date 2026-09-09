// src/ratingRewind.ts — 성과 이벤트 로그로 클리어 기록을 과거 시점으로 되돌리는 순수 함수.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { rewindClearRecords } = require("../../dist/ratingRewind");

const rec = (title, ach, over = {}) => ({
  title, diff: "MASTER", level: "13.5", musicKind: "DX", date: "", jacketUrl: "",
  achievementVal: ach, track: 0, fc: "", sync: "", ...over,
});
const key = (title) => `${title}|DX|MASTER`;
const ev = (title, before, over = {}) => ({
  chartKey: key(title), playedAt: 2000, achievementBefore: before,
  sourcePlayId: "12,345", fc: "", sync: "", ...over,
});

test("rewind: 이후 이벤트가 있는 채보는 직전 달성률로 되돌린다", () => {
  const out = rewindClearRecords([rec("A", 100.5), rec("B", 99.0)], [ev("A", 98.2)]);
  assert.equal(out.records.find((r) => r.title === "A").achievementVal, 98.2);
  assert.equal(out.records.find((r) => r.title === "B").achievementVal, 99.0);
  assert.equal(out.rewound, 1);
});

test("rewind: 같은 채보에 여러 이벤트면 가장 이른 것의 직전 값을 쓴다", () => {
  const out = rewindClearRecords([rec("A", 100.5)], [
    ev("A", 99.9, { playedAt: 5000 }),
    ev("A", 97.1, { playedAt: 3000 }), // 가장 이름
    ev("A", 100.0, { playedAt: 9000 }),
  ]);
  assert.equal(out.records[0].achievementVal, 97.1);
});

test("rewind: 이후에 딴 마크는 그 시점엔 없던 것으로 지운다", () => {
  const out = rewindClearRecords(
    [rec("A", 100.5, { fc: "AP", sync: "FSD" })],
    [ev("A", 99.0, { fc: "AP" })],
  );
  assert.equal(out.records[0].fc, "");
  assert.equal(out.records[0].sync, "FSD", "이후에 딴 적 없는 마크는 유지");
});

test("rewind: 되돌린 결과 0% 인 채보는 목록에서 빠진다 (그 시점엔 미플레이)", () => {
  const out = rewindClearRecords([rec("A", 100.5), rec("B", 99.0)], [ev("A", 0)]);
  assert.deepEqual(out.records.map((r) => r.title), ["B"]);
});

test("rewind: 기준선 따라잡기 이벤트(before=0 + clear: id)는 되돌리지 않는다", () => {
  // 예전부터 갖고 있던 기록이 0 으로 사라지는 것을 막는 heuristic
  const out = rewindClearRecords(
    [rec("A", 100.5)],
    [ev("A", 0, { sourcePlayId: "clear:A|DX|MASTER:100.5000:1" })],
  );
  assert.equal(out.records[0].achievementVal, 100.5);
  assert.equal(out.skipped, 1);
  assert.equal(out.rewound, 0);
});

test("rewind: 이벤트가 없으면 현재 기록 그대로", () => {
  const now = [rec("A", 100.5), rec("B", 99.0)];
  const out = rewindClearRecords(now, []);
  assert.deepEqual(out.records.map((r) => r.achievementVal), [100.5, 99.0]);
  assert.equal(out.rewound, 0);
});
