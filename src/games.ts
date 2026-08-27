// mai-log(app/(v3)/lib/{ratingCalc,scoreConvert,games}.ts)의 타 게임 치환 로직 이식.
// 레이팅 계산식은 mai-log 원본을 그대로 유지한다 (수치·반올림 순서 포함).
// maimai 기록(달성률 0~101%, 상수 0~15.0)을 각 게임 스케일로 선형 보간해 환산한다.

import type { PlayRecord } from "./scraper";

export type GameId = "maimai" | "chunithm" | "sdvx" | "arcaea";

export const GAME_IDS: GameId[] = ["maimai", "chunithm", "sdvx", "arcaea"];

// ─── 레이팅 계산식 (mai-log ratingCalc.ts 원본) ───────────────────────────────

// ── CHUNITHM ─────────────────────────────────────────────────────────────────
// 레벨: maimai 1~14.9 → CHUNITHM 1~15.7 선형 보간. 단 maimai 유일의 15.0 채보
//       3곡은 서로 구분되도록 개별 고정 (SDVX의 lv15 보정 사례와 동일한 방식).
// 점수: maimai achievement 정수 그대로 (두 게임 최대 점수 동일)
// 보정값: 구간별 Math.floor 스텝
const CHUNITHM_LV15_MAP: Record<string, number> = {
  "Xaleid◆scopiX": 16.0,
  系ぎて: 15.9,
  "PANDORA PARADOXXX": 15.8,
};

export function chunithmLevel(lv: number, title?: string): number {
  if (lv >= 15 && title !== undefined && CHUNITHM_LV15_MAP[title] !== undefined)
    return CHUNITHM_LV15_MAP[title];
  return Math.round((1 + (lv - 1) * (14.7 / 13.9)) * 10) / 10;
}
function getChunithmBonus(score: number): number {
  if (score >= 1009000) return 2.15;
  if (score >= 1007500) return 2.0 + Math.floor((score - 1007500) / 100) * 0.01;
  if (score >= 1005000) return 1.5 + Math.floor((score - 1005000) / 50) * 0.01;
  if (score >= 1000000) return 1.0 + Math.floor((score - 1000000) / 100) * 0.01;
  if (score >= 990000) return 0.6 + Math.floor((score - 990000) / 250) * 0.01;
  if (score >= 975000) return 0.0 + Math.floor((score - 975000) / 250) * 0.01;
  if (score >= 950000) return -1.67 + Math.floor((score - 950000) / 150) * 0.01;
  if (score >= 925000) return -3.34 + Math.floor((score - 925000) / 150) * 0.01;
  return -5.0;
}

export function chunithmRS(
  ach: number,
  lv: number,
  _marks: string[] = [],
  title?: string,
): number {
  const chuniScore = Math.round(ach * 10000); // achievement 정수 그대로
  const chuniLevel = chunithmLevel(lv, title);
  const bonus = getChunithmBonus(chuniScore);
  return Math.max(0, Math.floor((chuniLevel + bonus) * 100) / 100);
}

// ── SOUND VOLTEX ─────────────────────────────────────────────────────────────
// 반환값: 밀리-VF (정수). 표시 시 / 1000 → 소수점 3자리
// 공식: floor(sdvxLevel × 10 × 2 × (sdvxScore / 10,000,000) × 클리어 보정 × 랭크 보정)
function getSdvxClearBonus(marks: string[]): number {
  if (marks.includes("AP+")) return 1.10;
  if (marks.includes("AP") || marks.includes("FC+") || marks.includes("FC")) return 1.06;
  return 1.0;
}

function getSdvxRankBonus(achInt: number): number {
  if (achInt >= 1010000) return 1.05;
  if (achInt >= 1000000) return 1.02;
  if (achInt >= 990000) return 1.00;
  if (achInt >= 970000) return 0.97;
  if (achInt >= 940000) return 0.94;
  if (achInt >= 900000) return 0.91;
  if (achInt >= 800000) return 0.88;
  if (achInt >= 750000) return 0.85;
  if (achInt >= 700000) return 0.82;
  return 0.80;
}

export function sdvxRS(ach: number, lv: number, marks: string[] = []): number {
  const achInt = Math.round(ach * 10000);
  const sdvxLevel = Math.round((lv / 15.0) * 20.9 * 10) / 10;
  const sdvxScore = Math.round((achInt / 1010000) * 10000000);
  const clearBon = getSdvxClearBonus(marks);
  const rankBon = getSdvxRankBonus(achInt);
  return Math.floor(sdvxLevel * 10 * 2 * (sdvxScore / 10000000) * clearBon * rankBon);
}

// ── Arcaea (7.0 기준) ────────────────────────────────────────────────────────
// 7.0에서 Recent가 폐지되고 Best 30 → Best 50으로 변경되었으며,
// 50곡 중 상위 10곡에는 포텐셜 2배가 적용된다 (총합은 곡 수 50으로 나눔).
// 레벨: maimai 1~14.9 → Arcaea 1~11.7 선형 보간. 단 maimai 유일의 15.0 채보
//       3곡은 개별 고정 (CHUNITHM·SDVX의 lv15 보정과 동일한 방식).
// 점수: (achInt / 1010000) × 10000000 선형 보간
// 단일 포텐셜: PM(10M) +2.0 / ≥9.8M: +1.0+(x-9.8M)/200K / 그 외: (x-9.5M)/300K
const ARCAEA_LV15_MAP: Record<string, number> = {
  "Xaleid◆scopiX": 12.0,
  系ぎて: 11.9,
  "PANDORA PARADOXXX": 11.9,
};

export function arcaeaLevel(lv: number, title?: string): number {
  if (lv >= 15 && title !== undefined && ARCAEA_LV15_MAP[title] !== undefined)
    return ARCAEA_LV15_MAP[title];
  return Math.round((1 + (lv - 1) * (10.7 / 13.9)) * 10) / 10;
}

export function arcaeaRS(
  ach: number,
  lv: number,
  _marks: string[] = [],
  title?: string,
): number {
  const achInt = Math.round(ach * 10000);
  const basePotential = arcaeaLevel(lv, title);
  const score = Math.round((achInt / 1010000) * 10000000);

  let potential: number;
  if (score >= 10000000) {
    potential = basePotential + 2.0;
  } else if (score >= 9800000) {
    potential = basePotential + 1.0 + (score - 9800000) / 200000;
  } else {
    potential = basePotential + (score - 9500000) / 300000; // 9.5M 미만 시 음수 가능
  }

  return Math.floor(potential * 100) / 100;
}

// ─── 점수 / 난이도 / 마크 치환 (mai-log scoreConvert.ts 원본) ─────────────────

const SCORE_RANKS = ["SSS+","SSS","SS+","SS","S+","S","AAA","AA","A","BBB","BB","B","C","D"];

export function getScoreRank(ach: number): string {
  if (ach >= 100.5) return "SSS+";
  if (ach >= 100.0) return "SSS";
  if (ach >= 99.5) return "SS+";
  if (ach >= 99.0) return "SS";
  if (ach >= 98.0) return "S+";
  if (ach >= 97.0) return "S";
  if (ach >= 94.0) return "AAA";
  if (ach >= 90.0) return "AA";
  if (ach >= 80.0) return "A";
  if (ach >= 75.0) return "BBB";
  if (ach >= 70.0) return "BB";
  if (ach >= 60.0) return "B";
  if (ach >= 50.0) return "C";
  return "D";
}

export function getChunithmScoreRank(ach: number): string {
  const score = Math.round(ach * 10000);
  if (score >= 1009000) return "SSS+";
  if (score >= 1007500) return "SSS";
  if (score >= 1005000) return "SS+";
  if (score >= 1000000) return "SS";
  if (score >= 990000) return "S+";
  if (score >= 975000) return "S";
  if (score >= 950000) return "AAA";
  if (score >= 925000) return "AA";
  if (score >= 900000) return "A";
  if (score >= 800000) return "BBB";
  if (score >= 700000) return "BB";
  if (score >= 600000) return "B";
  if (score >= 500000) return "C";
  return "D";
}

export function getSdvxScoreRank(ach: number): string {
  if (ach >= 99.99) return "S";
  if (ach >= 98.98) return "AAA+";
  if (ach >= 97.97) return "AAA";
  if (ach >= 95.95) return "AA+";
  if (ach >= 93.93) return "AA";
  if (ach >= 90.90) return "A+";
  if (ach >= 87.87) return "A";
  if (ach >= 75.75) return "B";
  if (ach >= 65.65) return "C";
  return "D";
}

export function getArcaeaScoreRank(ach: number): string {
  if (ach >= 99.99) return "EX+";
  if (ach >= 98.98) return "EX";
  if (ach >= 95.95) return "AA";
  if (ach >= 92.92) return "A";
  if (ach >= 89.89) return "B";
  if (ach >= 86.86) return "C";
  return "D";
}

// 달성률 → 각 게임 점수 표기
export function convertScore(ach: number, game: GameId): string {
  if (game === "maimai") return ach.toFixed(4) + "%";

  let score: number;
  if (game === "chunithm") {
    score = Math.round(ach * 10000);
  } else {
    // sdvx / arcaea: 선형 보간 (achInt / 1010000) × 10,000,000
    score = Math.round((Math.round(ach * 10000) / 1010000) * 10000000);
  }
  return score.toLocaleString();
}

function getSdvxReMasterName(version: number): string {
  if (version >= 26500) return "NABLA";
  if (version >= 22000) return "EXCEED";
  if (version >= 20000) return "VIVID";
  if (version >= 18000) return "HEAVENLY";
  if (version >= 14000) return "GRAVITY";
  return "INFINITE";
}

export function convertDiff(game: GameId, diff: string, version?: number): string {
  if (game === "maimai") return diff;
  if (game === "chunithm") {
    if (diff === "Re:MASTER") return "ULTIMA";
    return diff;
  }
  if (game === "sdvx") {
    if (diff === "Re:MASTER") return getSdvxReMasterName(version ?? 0);
    if (diff === "MASTER") return "MAXIMUM";
    if (diff === "EXPERT") return "EXHAUST";
    if (diff === "ADVANCED") return "ADVANCED";
    return "NOVICE";
  }
  // arcaea
  if (diff === "Re:MASTER") return "Eternal";
  if (diff === "MASTER") return "Future";
  if (diff === "EXPERT") return "Present";
  return "Past";
}

export function convertMarks(marks: string[], game: GameId): string[] {
  if (game === "maimai") return marks;

  const hasAP = marks.includes("AP+") || marks.includes("AP");
  const hasFC = marks.includes("FC+") || marks.includes("FC");
  const hasFS = ["FSD+", "FSD", "FS+", "FS"].some((m) => marks.includes(m));

  if (game === "chunithm") {
    return marks
      .filter((m) => !["SYNC", "FS", "FS+", "FSD", "FSD+"].includes(m))
      .map((m) => (m === "AP+" ? "AJC" : m === "AP" ? "AJ" : m));
  }
  if (game === "sdvx") {
    if (hasAP) return ["PUC"];
    if (hasFC) return ["UC"];
    if (hasFS) return ["HC"];
    return ["CLEAR"];
  }
  // arcaea
  if (hasAP) return ["PM"];
  if (hasFC) return ["FR"];
  return ["CLEAR"];
}

// 카드 우측에 실제로 찍히는 마크 목록 (스코어랭크 + 클리어 마크)
export function buildDisplayMarks(ach: number, marks: string[], game: GameId): string[] {
  if (game === "sdvx") {
    const rank = getSdvxScoreRank(ach);
    const hasAP = marks.includes("AP+") || marks.includes("AP");
    const hasFC = marks.includes("FC+") || marks.includes("FC");
    const clearMark = hasAP ? "PUC" : hasFC ? "UC" : ach >= 80.8 ? "COMP" : "PLAYED";
    return [rank, clearMark];
  }
  if (game === "arcaea") {
    const rank = getArcaeaScoreRank(ach);
    const hasAP = marks.includes("AP+") || marks.includes("AP");
    const hasFC = marks.includes("FC+") || marks.includes("FC");
    const clearMark = hasAP ? "P" : hasFC ? "F" : ach >= 80.8 ? "C" : "L";
    return [rank, clearMark];
  }
  const scoreRank = game === "chunithm" ? getChunithmScoreRank(ach) : getScoreRank(ach);
  const baseMarks = [scoreRank, ...marks.filter((m) => !SCORE_RANKS.includes(m))];
  return convertMarks(baseMarks, game);
}

// ─── 색상 팔레트 (mai-log scoreConvert.ts 원본) ───────────────────────────────

export const MAI_CM_COLOR: Record<string, string> = {
  "SSS+":"#d97706","SSS":"#f59e0b","SS+":"#fbbf24","SS":"#fbbf24",
  "S+":"#fb923c","S":"#fb923c","AAA":"#60a5fa","AA":"#60a5fa","A":"#93c5fd",
  "BBB":"#7dd3fc","BB":"#bae6fd","B":"#e0f2fe",
  "C":"#d1d5db","D":"#9ca3af",
  "AP+":"#d946ef","AP":"#d946ef","FC+":"#3b82f6","FC":"#60a5fa",
  "FS+":"#22c55e","FS":"#4ade80","FSD+":"#10b981","FSD":"#34d399",
  "SYNC":"#94a3b8",
};

export const GAME_CM_COLOR: Record<GameId, Record<string, string>> = {
  maimai: MAI_CM_COLOR,
  chunithm: {
    ...MAI_CM_COLOR,
    "AJC":"#ca8a04","AJ":"#f59e0b",
  },
  sdvx: {
    "PUC":"#ca8a04","UC":"#f59e0b","COMP":"#3b82f6","PLAYED":"#6b7280",
    "S":"#d97706","AAA+":"#f59e0b","AAA":"#fbbf24",
    "AA+":"#fb923c","AA":"#fb923c",
    "A+":"#60a5fa","A":"#93c5fd",
    "B":"#4ade80","C":"#9ca3af","D":"#6b7280",
  },
  arcaea: {
    "EX+":"#d97706","EX":"#a855f7","AA":"#c084fc","A":"#d8b4fe",
    "B":"#60a5fa","D":"#6b7280",
    "P":"#ca8a04","F":"#f59e0b","C":"#3b82f6","L":"#6b7280",
  },
};

export const MAI_DIFF_COLOR: Record<string, string> = {
  "BASIC":"#16a34a",
  "ADVANCED":"#ea580c",
  "EXPERT":"#dc2626",
  "MASTER":"#9333ea",
  "Re:MASTER":"#c084fc",
};

export const GAME_DIFF_COLOR: Record<GameId, Record<string, string>> = {
  maimai: MAI_DIFF_COLOR,
  chunithm: {
    "BASIC":"#16a34a","ADVANCED":"#d97706","EXPERT":"#dc2626",
    "MASTER":"#9333ea","ULTIMA":"#555555",
  },
  sdvx: {
    "NOVICE":"#16a34a","ADVANCED":"#2563eb","EXHAUST":"#dc2626","MAXIMUM":"#7c3aed",
    "INFINITE":"#c026d3","GRAVITY":"#ea580c","HEAVENLY":"#0ea5e9",
    "VIVID":"#ec4899","EXCEED":"#d97706","NABLA":"#0d9488",
  },
  arcaea: {
    "Past":"#64748b","Present":"#059669","Future":"#7c3aed","Beyond":"#dc2626",
    "Eternal":"#dc2626",
  },
};

// ─── 게임 설정 (mai-log games.ts 원본 기준) ───────────────────────────────────
// sections: 카드 그리드 구성. count/cols는 모두 5행이 되도록 맞춰 카드 폭을 유지한다.
//   maimai 15@3 + 35@7 / chunithm 20@4 + 30@6 / sdvx 50@10 / arcaea 10@2 + 30@6

export type SelectMode = "newOld" | "top";

export interface GameSection {
  readonly label: string;
  readonly count: number;
  readonly cols: number;
}

export interface GameConfig {
  readonly id: GameId;
  readonly label: string;
  readonly accent: string;
  readonly ratingLabel: string;
  readonly select: SelectMode;
  readonly sections: readonly GameSection[];
  /** 곡 단위 레이팅 (mai-log 원본 공식). title은 곡별 레벨 보정에만 쓰인다. */
  readonly calcRS: (
    ach: number,
    lv: number,
    marks: string[],
    title?: string,
  ) => number;
  /** 선택된 곡들의 RS 합 → 총 레이팅 */
  readonly calcTotal: (rsList: number[]) => number;
  readonly formatRS: (v: number) => string;
  readonly formatTotal: (v: number) => string;
}

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

// Arcaea 7.0: Best 50 중 상위 몇 곡에 2배 가중치를 주는지
export const ARCAEA_DOUBLE_COUNT = 10;

export const GAMES: Record<GameId, GameConfig> = {
  maimai: {
    id: "maimai",
    label: "maimai DX",
    accent: "#9333ea",
    ratingLabel: "RATING",
    select: "newOld",
    sections: [
      { label: "NEW", count: 15, cols: 3 },
      { label: "OTHERS", count: 35, cols: 7 },
    ],
    // maimai는 캐롤봇 기존 계산식(calcSongRating)을 그대로 쓰므로 여기서는 참조되지 않는다.
    calcRS: () => 0,
    calcTotal: sum,
    formatRS: (v) => String(v),
    formatTotal: (v) => String(v),
  },
  chunithm: {
    id: "chunithm",
    label: "CHUNITHM",
    accent: "#f97316",
    ratingLabel: "RATING",
    select: "newOld",
    sections: [
      { label: "NEW", count: 20, cols: 4 },
      { label: "OTHERS", count: 30, cols: 6 },
    ],
    calcRS: chunithmRS,
    calcTotal: (rs) => Math.floor((sum(rs) / 50) * 100) / 100,
    formatRS: (v) => v.toFixed(2),
    formatTotal: (v) => v.toFixed(2),
  },
  sdvx: {
    id: "sdvx",
    label: "SOUND VOLTEX",
    accent: "#38bdf8",
    ratingLabel: "VOLFORCE",
    select: "top",
    sections: [{ label: "VOLFORCE", count: 50, cols: 10 }],
    calcRS: sdvxRS,
    calcTotal: sum,
    // 밀리-VF → VF (/ 1000)
    formatRS: (v) => (v / 1000).toFixed(3),
    formatTotal: (v) => (v / 1000).toFixed(3),
  },
  arcaea: {
    id: "arcaea",
    label: "Arcaea",
    accent: "#a855f7",
    ratingLabel: "POTENTIAL",
    select: "top",
    sections: [{ label: "BEST", count: 50, cols: 10 }],
    calcRS: arcaeaRS,
    // 상위 10곡은 2배로 계산한 뒤 곡 수 50으로 나눈다.
    calcTotal: (rs) => {
      const sorted = [...rs].sort((a, b) => b - a);
      const weighted = sorted.reduce(
        (acc, v, i) => acc + (i < ARCAEA_DOUBLE_COUNT ? v * 2 : v),
        0,
      );
      return Math.floor((weighted / 50) * 100) / 100;
    },
    formatRS: (v) => v.toFixed(2),
    formatTotal: (v) => v.toFixed(2),
  },
};

export function isGameId(v: string): v is GameId {
  return (GAME_IDS as string[]).includes(v);
}

// PlayRecord의 fc/sync 필드를 mai-log의 marks 배열 형태로 변환
export function recordMarks(fc: string | undefined, sync: string | undefined): string[] {
  const marks: string[] = [];
  if (fc) marks.push(fc);
  if (sync) marks.push(sync);
  return marks;
}

export type { PlayRecord };

// 카드에 표시할 레벨 (mai-log download/page.tsx의 getDisplayLv 원본)
// 레이팅 공식이 쓰는 환산 스케일과 동일하게 맞춘다.
export function getDisplayLv(lv: number, game: GameId, title?: string): number {
  if (game === "chunithm") return chunithmLevel(lv, title);
  if (game === "sdvx") return Math.round((lv / 15.0) * 20.9 * 10) / 10;
  if (game === "arcaea") return arcaeaLevel(lv, title);
  return lv;
}
