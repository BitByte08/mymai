// src/crypto.ts — AES-256-GCM 헬퍼. 비어있지 않은 키를 주면 config.json은 건드리지 않는다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { initEncryption, encrypt, decrypt } = require("../../dist/crypto");

initEncryption("unit-test-key-not-a-real-secret");

test("encrypt → decrypt 라운드트립", () => {
  for (const plain of ["", "hello", '{"cookie":"세션 값 😀"}', "a".repeat(5000)]) {
    assert.equal(decrypt(encrypt(plain)), plain);
  }
});

test("암호문 형식: iv:ciphertext:tag (hex)", () => {
  const enc = encrypt("payload");
  const parts = enc.split(":");
  assert.equal(parts.length, 3);
  parts.forEach((p) => assert.match(p, /^[0-9a-f]*$/));
});

test("변조된 태그는 복호화 실패", () => {
  const [iv, ct] = encrypt("payload").split(":");
  assert.throws(() => decrypt(`${iv}:${ct}:${"0".repeat(32)}`));
});

test("형식이 틀리면 예외", () => {
  assert.throws(() => decrypt("not-valid"));
});
