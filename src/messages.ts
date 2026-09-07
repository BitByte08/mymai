// 봇이 출력하는 사용자 대면 문구의 단일 카탈로그.
//
// 여기 있는 값이 "기본값"이고, 운영 중에는 /관리 페이지에서 키별로 덮어쓸 수 있다
// (bot_messages 테이블). 오버라이드가 없으면 항상 이 기본값이 쓰인다.
//
// 자리표시자는 {name} 형태로 쓴다. 허용 목록은 기본값에서 자동으로 추출되므로
// 키마다 따로 선언하지 않는다 — 오버라이드가 기본값에 없는 변수를 쓰면 거부된다.
//
// 슬래시 명령의 이름·설명은 기동 시 Discord에 등록되는 값이라 런타임 변경이
// 불가능하다. 그래서 여기 넣지 않는다.

export const MESSAGES = {
  // ── 공통 ────────────────────────────────────────────────────────────────
  "common.selfNotRegistered":
    "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요.",
  "common.otherNotRegistered": "{user} 님은 아직 프로필을 등록하지 않았습니다.",
  "common.profilePrivate": "{user} 님은 프로필을 비공개로 설정했습니다.",
  "common.adminGuildOnly": "이 명령어는 지정된 서버에서만 사용할 수 있습니다.",

  // ── /레이팅표 ───────────────────────────────────────────────────────────
  "ratingImage.noRecords": "레이팅 기록이 없습니다. 북마클릿을 다시 실행하세요.",
  "ratingImage.renderFailed": "이미지 생성에 실패했습니다.",

  // ── /관리 (별명·문구 관리) ───────────────────────────────────────────────
  "admin.embedTitle": "🛠 캐롤봇 관리",
  "admin.embedBody":
    "아래 버튼으로 관리 페이지를 엽니다.\n" +
    "곡 별명과 봇 출력 문구를 관리할 수 있습니다.\n\n" +
    "⏳ 링크는 **60분** 후 만료됩니다. (본인만 사용하세요)",
  "admin.buttonLabel": "관리 페이지 열기",
} as const;

export type MessageKey = keyof typeof MESSAGES;

export const MESSAGE_KEYS = Object.keys(MESSAGES) as MessageKey[];

// 기본값에서 {name} 자리표시자를 뽑는다. 오버라이드 검증의 허용 목록이 된다.
const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;

export function placeholdersOf(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(PLACEHOLDER), (m) => m[1]))];
}

export function defaultOf(key: MessageKey): string {
  return MESSAGES[key];
}

// 오버라이드 캐시. DB에서 loadMessages()로 채운다.
let overrides = new Map<string, string>();

export function applyMessageOverrides(rows: { key: string; text: string }[]): void {
  overrides = new Map(rows.filter((r) => (MESSAGES as Record<string, string>)[r.key] !== undefined).map((r) => [r.key, r.text]));
}

export function getOverride(key: MessageKey): string | null {
  return overrides.get(key) ?? null;
}

export function rawText(key: MessageKey): string {
  return overrides.get(key) ?? MESSAGES[key];
}

/** 문구를 가져와 {name} 자리표시자를 치환한다. 값이 없는 자리표시자는 그대로 둔다. */
export function msg(key: MessageKey, vars?: Record<string, string | number>): string {
  const text = rawText(key);
  if (!vars) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole,
  );
}

/** 오버라이드 유효성 검사. 문제가 없으면 null, 있으면 사유 문자열. */
export function validateOverride(key: MessageKey, text: string): string | null {
  if (typeof text !== "string") return "문자열이 아닙니다";
  if (!text.trim()) return "빈 문구는 저장할 수 없습니다";
  // Discord 임베드 설명 상한(4096)을 넘지 않게 막는다.
  if (text.length > 4000) return `너무 깁니다 (${text.length}자 / 최대 4000자)`;
  const allowed = new Set(placeholdersOf(MESSAGES[key]));
  const used = placeholdersOf(text);
  const unknown = used.filter((v) => !allowed.has(v));
  if (unknown.length) {
    return `기본값에 없는 자리표시자입니다: ${unknown.map((v) => `{${v}}`).join(", ")}`;
  }
  const missing = [...allowed].filter((v) => !used.includes(v));
  if (missing.length) {
    return `빠진 자리표시자가 있습니다: ${missing.map((v) => `{${v}}`).join(", ")}`;
  }
  return null;
}

// DB의 오버라이드를 읽어 캐시에 반영한다. 기동 시와 문구 수정 직후에 호출한다.
export async function loadMessages(): Promise<void> {
  const { getMessageOverrides } = await import("./storage");
  const rows = await getMessageOverrides();
  applyMessageOverrides(rows);
  console.log(`[messages] 문구 ${MESSAGE_KEYS.length}개 중 오버라이드 ${overrides.size}개 로드`);
}
