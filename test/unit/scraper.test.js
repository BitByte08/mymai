// src/scraper.ts — DX NET 마크업 파싱. 여기선 네트워크 없이 검증 가능한 순수 파서만 다룬다.
process.env.DATABASE_URL ||= "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";

const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../../dist/scraper");

const detailHtml = (inner) => `<div class="playlog_rating_detail_block">${inner}</div>`;

test("parsePlaylogDetail: 정상 (+N) 파싱", () => {
  assert.equal(s.parsePlaylogDetail(detailHtml("RATING 13234 (+21)")).ratingUp, 21);
  assert.equal(s.parsePlaylogDetail(detailHtml("(+0)")).ratingUp, 0);
});

test("parsePlaylogDetail: 블록 없으면 undefined", () => {
  assert.equal(s.parsePlaylogDetail("<div>no rating here</div>").ratingUp, undefined);
});

test("parsePlaylogDetail: 다른 모드 상세 페이지의 비현실적 (+N) 은 버린다", () => {
  // 宴/코스 등에서 (+N) 이 레이팅 증가분이 아닌 값으로 잘못 잡히는 경우
  assert.equal(s.parsePlaylogDetail(detailHtml("(+9999)")).ratingUp, undefined);
  assert.equal(s.parsePlaylogDetail(detailHtml("(+401)")).ratingUp, undefined);
  // 이론상 단일 채보 최대치(약 338) 부근까지는 통과 (신규 유저 첫 플레이 등)
  assert.equal(s.parsePlaylogDetail(detailHtml("(+338)")).ratingUp, 338);
});
