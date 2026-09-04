// src/aliases.ts — 별명 매칭. loadAliases()는 DB 의존이라 순수 함수만 검증한다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeQuery, aliasMatches, displayTitle } = require("../../dist/aliases");

test("normalizeQuery: 공백 제거 + 소문자", () => {
  assert.equal(normalizeQuery("  Oshama  Scramble! "), "oshamascramble!");
  assert.equal(normalizeQuery("メランコリー"), "メランコリー");
  assert.equal(normalizeQuery("A B\tC\nD"), "abcd");
});

test("aliasMatches: 로드 전에는 항상 false (throw 없이)", () => {
  assert.equal(aliasMatches("Any Title", normalizeQuery("q")), false);
});

test("displayTitle: 번역 비활성 시 원제 그대로", () => {
  assert.equal(displayTitle("Original Title", false), "Original Title");
});
