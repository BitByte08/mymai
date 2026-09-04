// src/games.ts — 타 게임 레이팅/점수/난이도 치환. 순수, DB 불필요.
const test = require("node:test");
const assert = require("node:assert/strict");
const g = require("../../dist/games");

test("getScoreRank (maimai)", () => {
  assert.equal(g.getScoreRank(100.5), "SSS+");
  assert.equal(g.getScoreRank(100.0), "SSS");
  assert.equal(g.getScoreRank(99.5), "SS+");
  assert.equal(g.getScoreRank(97.0), "S");
  assert.equal(g.getScoreRank(96.9), "AAA");
  assert.equal(g.getScoreRank(49.9), "D");
});

test("getChunithmScoreRank", () => {
  assert.equal(g.getChunithmScoreRank(101.0), "SSS+"); // 1,010,000
  assert.equal(g.getChunithmScoreRank(100.75), "SSS"); // 1,007,500
  assert.equal(g.getChunithmScoreRank(97.5), "S"); // 975,000
  assert.equal(g.getChunithmScoreRank(40), "D");
});

test("getArcaeaScoreRank", () => {
  assert.equal(g.getArcaeaScoreRank(99.99), "EX+");
  assert.equal(g.getArcaeaScoreRank(98.98), "EX");
  assert.equal(g.getArcaeaScoreRank(95.95), "AA");
  assert.equal(g.getArcaeaScoreRank(50), "D");
});

test("sdvxScoreOf: PUC는 만점 고정", () => {
  assert.equal(g.sdvxScoreOf(90.0, ["AP"]), g.SDVX_MAX_SCORE);
  assert.equal(g.sdvxScoreOf(90.0, ["AP+"]), g.SDVX_MAX_SCORE);
  // 비-PUC: round((achInt / 1010000) * 1e7)
  assert.equal(g.sdvxScoreOf(101.0, []), 10000000);
  assert.equal(g.sdvxScoreOf(0, []), 0);
});

test("convertScore", () => {
  assert.equal(g.convertScore(100.1234, "maimai"), "100.1234%");
  assert.equal(g.convertScore(100.5, "chunithm"), (1005000).toLocaleString());
  assert.equal(g.convertScore(90.0, "sdvx", ["AP"]), (10000000).toLocaleString());
});

test("convertDiff", () => {
  assert.equal(g.convertDiff("maimai", "MASTER"), "MASTER");
  assert.equal(g.convertDiff("chunithm", "Re:MASTER"), "ULTIMA");
  assert.equal(g.convertDiff("sdvx", "MASTER"), "MAXIMUM");
  assert.equal(g.convertDiff("sdvx", "Re:MASTER", 26500), "NABLA");
  assert.equal(g.convertDiff("arcaea", "MASTER"), "Future");
  assert.equal(g.convertDiff("arcaea", "BASIC"), "Past");
});

test("convertMarks", () => {
  assert.deepEqual(g.convertMarks(["AP"], "sdvx"), ["PUC"]);
  assert.deepEqual(g.convertMarks(["FC"], "sdvx"), ["UC"]);
  assert.deepEqual(g.convertMarks([], "sdvx"), ["CLEAR"]);
  assert.deepEqual(g.convertMarks(["AP+"], "chunithm"), ["AJC"]);
  assert.deepEqual(g.convertMarks(["AP"], "arcaea"), ["PM"]);
});

test("recordMarks / isGameId / isSdvxPuc", () => {
  assert.deepEqual(g.recordMarks("AP", "FS"), ["AP", "FS"]);
  assert.deepEqual(g.recordMarks("", undefined), []);
  assert.equal(g.isGameId("maimai"), true);
  assert.equal(g.isGameId("iidx"), false);
  assert.equal(g.isSdvxPuc(["AP"]), true);
  assert.equal(g.isSdvxPuc(["FC"]), false);
});

test("getDisplayLv: maimai는 그대로", () => {
  assert.equal(g.getDisplayLv(14.7, "maimai"), 14.7);
});
