// src/constants.ts — 레이팅 산식 등 순수 함수. (곡 상수 맵은 네트워크 로드라 여기선 미검증)
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../dist/constants");

test("calcSongRating: 알려진 값", () => {
  // SSS+ (100.5%) · 상수 15.0 → floor(15.0 * 1.005 * 22.4) = floor(337.68) = 337
  assert.equal(c.calcSongRating(100.5, 15.0), 337);
  // AP 보너스 +1
  assert.equal(c.calcSongRating(100.5, 15.0, "AP"), 338);
  assert.equal(c.calcSongRating(100.5, 15.0, "AP+"), 338);
  assert.equal(c.calcSongRating(100.5, 15.0, "FC"), 337); // FC엔 보너스 없음
  // S (97%) · 상수 13.0 → floor(13 * 0.97 * 20.0) = floor(252.2) = 252
  assert.equal(c.calcSongRating(97.0, 13.0), 252);
  // 계수 0 구간(달성률 < 10%) → 0
  assert.equal(c.calcSongRating(5.0, 13.0), 0);
});

test("levelToNumber", () => {
  assert.equal(c.levelToNumber("14"), 14);
  assert.equal(c.levelToNumber("14+"), 14.6);
  assert.equal(c.levelToNumber("7"), 7);
  assert.equal(c.levelToNumber(""), 0);
});

test("constantToDisplayLevel: X.0~X.5 → 'X', X.6~X.9 → 'X+'", () => {
  assert.equal(c.constantToDisplayLevel(13.0), "13");
  assert.equal(c.constantToDisplayLevel(13.5), "13");
  assert.equal(c.constantToDisplayLevel(13.6), "13+");
  assert.equal(c.constantToDisplayLevel(13.9), "13+");
  assert.equal(c.constantToDisplayLevel(14.0), "14");
});
