/**
 * 목표(todo) 도메인 모델 + 동기화 데이터 기반 자동 평가.
 *
 * 프레임워크 독립 모듈이다(discord.js / http 의존 금지). 저장은 storage 계층이,
 * 커맨드 표현은 bot 계층이 담당하고 여기서는 "무엇이 목표이고 지금 얼마나
 * 달성했는가"만 계산한다.
 *
 * 3종류:
 *  - rating   : 전체 레이팅 N 도달
 *  - chart    : 특정 곡/난이도의 달성률·콤보·싱크 목표
 *  - aggregate: 표시 레벨 구간의 채보들을 일정 기준 이상으로 N개(또는 전곡)
 */
import type { CachedProfile } from "./storage/types";
import type { PlayRecord } from "./scraper";
import { getChartsInConstantRange, constantToDisplayLevel } from "./constants";

export type GoalKind = "rating" | "chart" | "aggregate";
export const GOAL_KINDS: readonly GoalKind[] = ["rating", "chart", "aggregate"] as const;

export const DIFFICULTIES = ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

// 달성률 스코어 랭크 → 하한 달성률(%). 목표에서 "SSS 이상" 같은 표현을 쓸 때 사용.
export const SCORE_RANK_THRESHOLD: Record<string, number> = {
  A: 80, AA: 90, AAA: 94, S: 97, "S+": 98, SS: 99, "SS+": 99.5, SSS: 100, "SSS+": 100.5,
};
export const COMBO_MARKS = ["FC", "FC+", "AP", "AP+"] as const;
export const SYNC_MARKS = ["FS", "FS+", "FDX", "FDX+"] as const;
export type ComboMark = (typeof COMBO_MARKS)[number];
export type SyncMark = (typeof SYNC_MARKS)[number];

export type ChartCriterion =
  | { type: "achievement"; value: number; rank?: string }
  | { type: "combo"; value: ComboMark }
  | { type: "sync"; value: SyncMark };

export interface RatingGoalSpec {
  kind: "rating";
  target: number;
}
export interface ChartGoalSpec {
  kind: "chart";
  title: string;
  diff: Difficulty;
  musicKind?: "ST" | "DX";
  criterion: ChartCriterion;
}
export interface AggregateGoalSpec {
  kind: "aggregate";
  criterion: ChartCriterion;
  levelLabel: string; // "13" · "13+" · "13-14+" (표시용 원문)
  constantMin: number;
  constantMax: number;
  count: number | null; // null = 구간 전곡
}
export type GoalSpec = RatingGoalSpec | ChartGoalSpec | AggregateGoalSpec;

export interface GoalEvaluation {
  progress: number; // 0..1
  done: boolean;
  valueText: string;
  targetText: string;
  detail?: string;
}

// ─── 마크 랭크 (postgres.ts 와 동일 규칙, 이 모듈은 프레임워크 독립이라 재정의) ──
function comboRank(v: string): number {
  const x = v.trim().toUpperCase().replace(/\s+/g, "");
  return x === "AP+" || x === "APP" ? 4 : x === "AP" ? 3 : x === "FC+" || x === "FCP" ? 2 : x === "FC" ? 1 : 0;
}
function syncRank(v: string): number {
  const x = v.trim().toUpperCase().replace(/\s+/g, "");
  return x === "FDX+" || x === "FDXP" ? 4 : x === "FDX" ? 3 : x === "FS+" || x === "FSP" ? 2 : x === "FS" ? 1 : 0;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function parseClearRecords(profile: Pick<CachedProfile, "clearJson">): PlayRecord[] {
  try {
    const parsed = JSON.parse(profile.clearJson || "[]");
    return Array.isArray(parsed) ? (parsed as PlayRecord[]) : [];
  } catch {
    return [];
  }
}

// "13" → [13.0, 13.5] · "13+" → [13.6, 13.9] · "13-14+" → [13.0, 14.9]
export function parseLevelRange(text: string): { min: number; max: number; label: string } | null {
  const cleaned = text.replace(/\s+/g, "");
  const token = /^(\d{1,2})(\+?)$/;
  const bounds = (base: number, plus: boolean): [number, number] =>
    plus ? [base + 0.6, base + 0.9] : [base, base + 0.5];
  const range = cleaned.match(/^(\d{1,2}\+?)-(\d{1,2}\+?)$/);
  if (range) {
    const lo = range[1].match(token);
    const hi = range[2].match(token);
    if (!lo || !hi) return null;
    const [min] = bounds(Number(lo[1]), lo[2] === "+");
    const [, max] = bounds(Number(hi[1]), hi[2] === "+");
    if (max < min) return null;
    return { min, max, label: `${range[1]}-${range[2]}` };
  }
  const single = cleaned.match(token);
  if (!single) return null;
  const base = Number(single[1]);
  if (base < 1 || base > 15) return null;
  const [min, max] = bounds(base, single[2] === "+");
  return { min, max, label: `${single[1]}${single[2]}` };
}

export function criterionLabel(c: ChartCriterion): string {
  if (c.type === "achievement") return c.rank ? `${c.rank} 이상` : `${c.value}% 이상`;
  if (c.type === "combo") return `${c.value} 이상`;
  return `${c.value} 이상`;
}

function meetsCriterion(best: { achievementVal: number; fc: string; sync: string }, c: ChartCriterion): boolean {
  if (c.type === "achievement") return best.achievementVal >= c.value - 1e-9;
  if (c.type === "combo") return comboRank(best.fc) >= comboRank(c.value);
  return syncRank(best.sync) >= syncRank(c.value);
}

// 같은 채보의 여러 기록에서 "가장 좋은" 값들을 뽑아 하나로 합친다.
function bestOf(records: PlayRecord[]): { achievementVal: number; fc: string; sync: string } | null {
  if (records.length === 0) return null;
  let achievementVal = 0;
  let fc = "";
  let sync = "";
  for (const r of records) {
    if (r.achievementVal > achievementVal) achievementVal = r.achievementVal;
    if (comboRank(r.fc) > comboRank(fc)) fc = r.fc;
    if (syncRank(r.sync) > syncRank(sync)) sync = r.sync;
  }
  return { achievementVal, fc, sync };
}

function criterionProgress(best: { achievementVal: number; fc: string; sync: string } | null, c: ChartCriterion): number {
  if (!best) return 0;
  if (c.type === "achievement") return clamp01(best.achievementVal / c.value);
  if (c.type === "combo") return clamp01(comboRank(best.fc) / comboRank(c.value));
  return clamp01(syncRank(best.sync) / syncRank(c.value));
}

export function describeGoal(spec: GoalSpec): string {
  if (spec.kind === "rating") return `레이팅 ${spec.target} 도달`;
  if (spec.kind === "chart") {
    const kind = spec.musicKind ? ` [${spec.musicKind}]` : "";
    return `${spec.title} ${spec.diff}${kind} — ${criterionLabel(spec.criterion)}`;
  }
  const scope = spec.count == null ? "전곡" : `${spec.count}개`;
  return `Lv${spec.levelLabel} · ${criterionLabel(spec.criterion)} ${scope}`;
}

export interface EvaluationContext {
  profile: Pick<CachedProfile, "rating" | "clearJson" | "server">;
  clearRecords?: PlayRecord[];
}

export function evaluateGoal(spec: GoalSpec, ctx: EvaluationContext): GoalEvaluation {
  const clearRecords = ctx.clearRecords ?? parseClearRecords(ctx.profile);

  if (spec.kind === "rating") {
    const value = ctx.profile.rating || 0;
    return {
      progress: clamp01(value / spec.target),
      done: value >= spec.target,
      valueText: String(value),
      targetText: String(spec.target),
    };
  }

  if (spec.kind === "chart") {
    const matches = clearRecords.filter(
      (r) =>
        r.title === spec.title &&
        r.diff === spec.diff &&
        (!spec.musicKind || (r.musicKind || "") === spec.musicKind),
    );
    const best = bestOf(matches);
    const done = best ? meetsCriterion(best, spec.criterion) : false;
    let valueText = "미기록";
    if (best) {
      valueText =
        spec.criterion.type === "achievement"
          ? `${best.achievementVal.toFixed(4)}%`
          : spec.criterion.type === "combo"
            ? best.fc || "—"
            : best.sync || "—";
    }
    return {
      progress: done ? 1 : criterionProgress(best, spec.criterion),
      done,
      valueText,
      targetText:
        spec.criterion.type === "achievement"
          ? spec.criterion.rank ?? `${spec.criterion.value}%`
          : spec.criterion.value,
    };
  }

  // aggregate
  const pool = getChartsInConstantRange(spec.constantMin, spec.constantMax);
  const target = spec.count == null ? pool.length : Math.min(spec.count, pool.length || spec.count);
  const byChart = new Map<string, PlayRecord[]>();
  for (const r of clearRecords) {
    const key = `${r.title}|${r.musicKind || ""}|${r.diff}`;
    const arr = byChart.get(key);
    if (arr) arr.push(r);
    else byChart.set(key, [r]);
  }
  let satisfied = 0;
  for (const chart of pool) {
    const best =
      bestOf(byChart.get(`${chart.title}|${chart.kind}|${chart.diff}`) ?? []) ??
      // clear 기록의 musicKind 가 비어있는 경우를 대비해 타입 무시 매칭도 시도
      bestOf(clearRecords.filter((r) => r.title === chart.title && r.diff === chart.diff));
    if (best && meetsCriterion(best, spec.criterion)) satisfied++;
  }
  return {
    progress: target > 0 ? clamp01(satisfied / target) : 0,
    done: target > 0 && satisfied >= target,
    valueText: String(satisfied),
    targetText: `${target}곡`,
    detail: pool.length > 0 ? `구간 내 채보 ${pool.length}개` : "곡 상수 데이터 없음",
  };
}

// 진행률 바 (임베드 표시용). 아직 달성하지 않았으면(progress < 1) 절대로 꽉 찬 바를
// 보여주지 않는다 — 99.9% 를 반올림해 100% 처럼 보이던 버그 방지.
export function progressBar(progress: number, width = 12): string {
  const p = clamp01(progress);
  let filled = Math.round(p * width);
  if (p < 1 && filled >= width) filled = width - 1;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// 표시용 진행률 퍼센트(정수). 달성 시에만 100 을 반환하고, 미달성이면 99 로 상한을
// 두어 내림 처리한다 (13500/13600, 96.9999/97 이 100% 로 뜨던 버그 방지).
export function progressPercent(progress: number, done: boolean): number {
  if (done) return 100;
  return Math.min(99, Math.max(0, Math.floor(clamp01(progress) * 100)));
}

export function displayLevelOf(constant: number): string {
  return constantToDisplayLevel(constant);
}
