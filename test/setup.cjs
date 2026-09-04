// 유닛 테스트 프리로드. src/* 를 로드하면 config.ts 가 즉시 config.json 을 require 하고
// DATABASE_URL 을 요구하므로, 실제 값이 없을 때만 안전한 placeholder 를 채워준다.
// (config.json 이 이미 있으면 건드리지 않는다 — 개발 머신 보호)
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const configPath = path.join(root, "config.json");
if (!fs.existsSync(configPath)) {
  fs.copyFileSync(path.join(root, "config.json.example"), configPath);
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://placeholder:placeholder@127.0.0.1:5432/placeholder";
}
