// 성과 이벤트 로그(achievement_play_event_log)로 현재 클리어 기록을 과거 시점으로
// 되돌린다. rating_snapshots 가 없던 시기(기능 배포 이전)의 레이팅표를 추정하기 위한 것으로,
// 아래 한계 때문에 결과는 "추정치"로만 쓴다.
//   - 성과 추적 시작 이전은 데이터 자체가 없다
//   - 동기화 사이에 여러 번 갱신하면 1건으로 뭉쳐 achievement_before 가 중간값을 놓친다
//   - 신곡/구곡 판정(isNewSong)과 상수는 현재 기준이라 버전이 바뀌었으면 어긋난다
import type { PlayRecord } from "./scraper";
import { chartKey } from "./scraper";
import { calcSongRating, getConstant, levelToNumber } from "./constants";
import type { MaimaiServer } from "./storage/types";

export interface RewindEvent {
  chartKey: string;
  playedAt: number;
  achievementBefore: number;
  sourcePlayId?: string;
  fc: string;
  sync: string;
}

export interface RewindResult {
  records: PlayRecord[];
  /** 실제로 되돌린 채보 수 */
  rewound: number;
  /** 기준선 따라잡기로 보이는 이벤트라 되돌리지 않은 수 */
  skipped: number;
}

// achievement_before 가 0 이면서 플레이 기록과 매칭되지 않은(clear: 접두어) 이벤트는,
// 실제 첫 플레이가 아니라 chart_clears 기준선이 뒤늦게 따라잡히며 생긴 것일 가능성이 높다.
// 이런 이벤트를 그대로 되돌리면 예전부터 갖고 있던 기록이 0 으로 사라져 과거 레이팅이
// 크게 낮아진다. 되돌리지 않고 현재값을 유지하는 쪽이 오차가 작다.
function isBaselineCatchUp(e: RewindEvent): boolean {
  return e.achievementBefore <= 0 && (e.sourcePlayId ?? "").startsWith("clear:");
}

/**
 * @param laterEvents 되돌릴 시점 이후에 일어난 이벤트 전부 (순서 무관)
 */
export function rewindClearRecords(
  clearRecords: readonly PlayRecord[],
  laterEvents: readonly RewindEvent[],
): RewindResult {
  // 채보별로 가장 이른 이벤트의 직전 달성률이 그 시점의 값이다.
  // 마크(FC/Sync)는 "이번에 새로 딴 것"만 기록되므로, 이후에 딴 마크는 그 시점엔 없던 것으로 본다.
  const earliest = new Map<string, RewindEvent>();
  const clearedFc = new Set<string>();
  const clearedSync = new Set<string>();
  let skipped = 0;
  for (const e of laterEvents) {
    if (isBaselineCatchUp(e)) { skipped++; continue; }
    const prev = earliest.get(e.chartKey);
    if (!prev || e.playedAt < prev.playedAt) earliest.set(e.chartKey, e);
    if (e.fc) clearedFc.add(e.chartKey);
    if (e.sync) clearedSync.add(e.chartKey);
  }
  const records = clearRecords
    .map((r) => {
      const key = chartKey(r);
      const ev = earliest.get(key);
      if (!ev && !clearedFc.has(key) && !clearedSync.has(key)) return r;
      return {
        ...r,
        achievementVal: ev ? Math.max(0, ev.achievementBefore) : r.achievementVal,
        fc: clearedFc.has(key) ? "" : r.fc,
        sync: clearedSync.has(key) ? "" : r.sync,
      };
    })
    .filter((r) => r.achievementVal > 0);
  return { records, rewound: earliest.size, skipped };
}

// 레이팅 대상곡의 곡 레이팅 합계. 카드 헤더에 표시할 총합 레이팅으로 쓴다.
export function totalRatingOf(records: readonly PlayRecord[], server: MaimaiServer): number {
  return records.reduce((sum, r) => {
    const constant = getConstant(r.title, r.musicKind, r.diff, server) ?? levelToNumber(r.level);
    return sum + calcSongRating(r.achievementVal, constant, r.fc);
  }, 0);
}
