import { renderInWorker } from "./renderPool";
import type { PlayRecord, ChartMarks, MaimaiServer } from "../../scraper";
import { buildMarkMap, buildKindResolver, chartKey } from "../../scraper";
import type { CachedProfile } from "../../storage";
import {
  getSongJacket,
  saveSongJacket,
  getRatingCardCache,
  saveRatingCardCache,
} from "../../storage";
import {
  getConstant,
  levelToNumber,
  calcSongRating,
  getJacketFile,
  isNewSong,
  getSongVersion,
} from "../../constants";
import { displayTitle } from "../../aliases";
import type { GameId } from "../../games";
import {
  GAMES,
  convertScore,
  convertDiff,
  buildDisplayMarks,
  getDisplayLv,
  recordMarks,
  GAME_CM_COLOR,
  GAME_DIFF_COLOR,
  MAI_DIFF_COLOR,
  RS_DEFAULT_COLOR,
  RS_DOUBLE_COLOR,
} from "../../games";

// ─── Design tokens (ported from mailog) ──────────────────────────────────
const CARD_W = 110;
const CARD_H = 115;
const GAP = 4;
const ACCENT = "#9333ea";
// 카드 레이아웃/계산이 바뀌면 올린다 → 기존 렌더 캐시가 자동 무효화됨
const CARD_VERSION = 8;

// ─── Satori element helper (no JSX) ───────────────────────────────────────
type El = {
  type: string;
  props: { style: Record<string, unknown>; children?: unknown };
};
function el(
  type: string,
  style: Record<string, unknown>,
  children?: unknown,
): El {
  return { type, props: { style, children } };
}

// ─── Per-song view model ──────────────────────────────────────────────────
interface CardVM {
  title: string;
  ach: string;
  rs: number;
  rsText: string;
  rsColor: string;
  lv: string;
  diff: string;
  diffColor: string;
  isDx: boolean;
  showKind: boolean;
  mark: string;
  clearMark: string;
  jacketFile: string | null;
}

const MAI_COMBO_MARKS = ["AP+", "AP", "FC+", "FC"];

function toVM(
  r: PlayRecord,
  markMap?: Map<string, ChartMarks>,
  server: MaimaiServer = "intl",
  translate = false,
  game: GameId = "maimai",
): CardVM {
  const constant = getConstant(r.title, r.musicKind, r.diff, server);
  const lvNum = constant !== null ? constant : levelToNumber(r.level);
  // 레이팅 대상 페이지엔 FC/AP·Sync 아이콘이 없어 clear 기록의 마크를 우선 사용
  const marks = markMap?.get(chartKey(r));
  const fc = marks?.fc ?? r.fc;
  const sync = marks?.sync ?? r.sync;
  const markList = recordMarks(fc, sync);
  const ach = r.achievementVal;

  // maimai는 캐롤봇 기존 계산식을, 나머지는 mai-log 원본 공식을 쓴다.
  const cfg = GAMES[game];
  const rs =
    game === "maimai"
      ? calcSongRating(ach, lvNum, fc)
      : cfg.calcRS(ach, lvNum, markList, r.title);

  const allMarks = buildDisplayMarks(ach, markList, game);
  const clearMark =
    game === "maimai"
      ? (allMarks.find((m) => MAI_COMBO_MARKS.includes(m)) ?? "")
      : (allMarks[1] ?? "");

  const version = getSongVersion(r.title) ?? undefined;
  const diffLabel = game === "maimai" ? r.diff : convertDiff(game, r.diff, version);
  const diffColor =
    game === "maimai"
      ? (MAI_DIFF_COLOR[r.diff] ?? "#888")
      : (GAME_DIFF_COLOR[game][diffLabel] ?? "#888");

  return {
    title: displayTitle(r.title, translate),
    ach:
      game === "maimai"
        ? ach > 0
          ? ach.toFixed(4) + "%"
          : r.achievement
        : convertScore(ach, game, markList),
    rs,
    rsText: game === "maimai" ? String(rs) : cfg.formatRS(rs),
    rsColor: RS_DEFAULT_COLOR,
    lv:
      game === "maimai"
        ? constant !== null
          ? constant.toFixed(1)
          : r.level
        : getDisplayLv(lvNum, game, r.title).toFixed(1),
    diff: diffLabel,
    diffColor,
    isDx: r.musicKind === "DX",
    showKind: game === "maimai",
    mark: allMarks[0] ?? "",
    clearMark,
    jacketFile: getJacketFile(r.title),
  };
}

// ─── Jacket prefetch (in-memory → DB cache → otoge-db) ────────────────────
// 레이팅 대상곡 페이지엔 자켓이 없어 otoge-db의 image_url(파일명)로 받아온다.
// 자켓은 곡 단위라 프로필마다 겹치는 게 대부분이다. 매 렌더마다 DB 조회 + base64
// 인코딩을 반복하지 않도록 파일명 → data URL(또는 null) 결과를 프로세스 메모리에
// 캐시한다. 곡 수만큼(수천 개)만 늘어나고 갱신될 일이 없어 상한은 두지 않는다.
const jacketDataUrlCache = new Map<string, string | null>();
async function fetchJacketDataUrl(file: string): Promise<string | null> {
  const memo = jacketDataUrlCache.get(file);
  if (memo !== undefined) return memo;
  const key = file.replace(/\.png$/, "");
  let buf = await getSongJacket(key);
  if (!buf) {
    try {
      const res = await fetch(`https://otoge-db.net/maimai/jacket/${file}`);
      if (res.ok) {
        buf = Buffer.from(await res.arrayBuffer());
        await saveSongJacket(key, buf);
      }
    } catch {
      /* ignore */
    }
  }
  const dataUrl = buf ? `data:image/png;base64,${buf.toString("base64")}` : null;
  jacketDataUrlCache.set(file, dataUrl);
  return dataUrl;
}

// ─── Card component ───────────────────────────────────────────────────────
function jacketCard(
  vm: CardVM,
  rank: number,
  jacketUrl: string | null,
  cmColor: Record<string, string>,
): El {
  const layers: El[] = [];

  layers.push(
    jacketUrl
      ? (el(
          "img",
          {
            position: "absolute",
            top: 0,
            left: 0,
            width: CARD_W,
            height: CARD_H,
            objectFit: "cover",
          },
          undefined,
        ) as any)
      : el("div", {
          position: "absolute",
          top: 0,
          left: 0,
          width: CARD_W,
          height: CARD_H,
          background: "#1c1c1c",
        }),
  );
  if (jacketUrl) (layers[0] as any).props.src = jacketUrl;

  // gradient overlay
  layers.push(
    el("div", {
      position: "absolute",
      top: 0,
      left: 0,
      width: CARD_W,
      height: CARD_H,
      backgroundImage:
        "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.05) 28%, rgba(0,0,0,0.65) 55%, rgba(0,0,0,0.93) 100%)",
    }),
  );

  // rank badge
  layers.push(
    el(
      "div",
      { position: "absolute", top: 5, left: 6, display: "flex" },
      el(
        "span",
        { fontSize: 8, color: "rgba(255,255,255,0.7)", fontWeight: 600 },
        `#${rank}`,
      ),
    ),
  );

  // bottom info block
  const infoRows: El[] = [];
  // 자릿수가 많으면(예: Arcaea의 소수 3자리) 카드 폭에 맞게 살짝 줄인다.
  const rsFontSize = vm.rsText.length >= 6 ? 17 : 19;
  // 스코어 랭크(SSS+ 등)는 하단 구석에서 잘 안 보여 레이팅 숫자 옆에 크게 붙인다.
  infoRows.push(
    el("div", { display: "flex", alignItems: "baseline", width: "100%" }, [
      el(
        "span",
        {
          fontSize: rsFontSize,
          fontWeight: 800,
          color: vm.rsColor,
          lineHeight: 1,
          textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
        },
        vm.rsText,
      ),
      ...(vm.mark
        ? [
            el(
              "span",
              {
                fontSize: 12,
                fontWeight: 800,
                color: cmColor[vm.mark] ?? "rgba(255,255,255,0.75)",
                marginLeft: 5,
                lineHeight: 1,
                // 밝은 자켓 위에서도 읽히도록 어두운 그림자로 분리한다.
                textShadow: "0 1px 2px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8)",
              },
              vm.mark,
            ),
          ]
        : []),
    ]),
  );

  infoRows.push(
    el("div", { display: "flex", alignItems: "baseline", width: "100%" }, [
      el(
        "span",
        { fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.9)" },
        vm.lv,
      ),
      el(
        "span",
        {
          fontSize: 8,
          fontWeight: 600,
          color: "rgba(255,255,255,0.78)",
          marginLeft: 4,
        },
        vm.ach,
      ),
      ...(vm.showKind
        ? [
            el(
              "span",
              {
                fontSize: 7,
                fontWeight: 800,
                color: vm.isDx ? "#f97316" : "rgba(255,255,255,0.65)",
                marginLeft: "auto",
              },
              vm.isDx ? "DX" : "ST",
            ),
          ]
        : []),
    ]),
  );

  infoRows.push(
    el(
      "div",
      {
        fontSize: 9,
        fontWeight: 600,
        color: "#ddd",
        lineHeight: 1.25,
        width: "100%",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      },
      vm.title,
    ),
  );

  // 하단: 좌측 난이도 · 우측 [콤보마크(AP/FC) + 스코어랭크] (mailog 다운로드 카드와 동일 배치)
  const rightMarks: El[] = [];
  if (vm.clearMark)
    rightMarks.push(
      el(
        "span",
        {
          fontSize: 7,
          fontWeight: 700,
          color: cmColor[vm.clearMark] ?? "rgba(255,255,255,0.55)",
        },
        vm.clearMark,
      ),
    );
  infoRows.push(
    el(
      "div",
      {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      },
      [
        el(
          "span",
          { fontSize: 7, fontWeight: 700, color: vm.diffColor },
          vm.diff,
        ),
        el(
          "div",
          { display: "flex", gap: 3, alignItems: "center" },
          rightMarks,
        ),
      ],
    ),
  );

  layers.push(
    el(
      "div",
      {
        position: "absolute",
        bottom: 0,
        left: 0,
        width: CARD_W,
        display: "flex",
        flexDirection: "column",
        padding: "5px 6px 6px",
      },
      infoRows,
    ),
  );

  return el(
    "div",
    {
      position: "relative",
      display: "flex",
      width: CARD_W,
      height: CARD_H,
      overflow: "hidden",
      border: "1px solid #252525",
      borderTop: `3px solid ${vm.diffColor}`,
    },
    layers,
  );
}

function sectionLabel(
  label: string,
  count: number,
  avg: number,
  formatRS: (v: number) => string,
): El {
  return el(
    "div",
    {
      display: "flex",
      alignItems: "baseline",
      width: "100%",
      padding: "8px 0 4px",
      borderBottom: "1px solid #202020",
      marginTop: 8,
    },
    [
      el("span", { fontSize: 10, fontWeight: 700, color: "#aaa" }, label),
      el("span", { fontSize: 9, color: "#666", marginLeft: 8 }, `TOP ${count}`),
      el(
        "span",
        { fontSize: 9, color: "#777", marginLeft: "auto" },
        `avg ${formatRS(avg)}`,
      ),
    ],
  );
}

function cardGrid(
  vms: CardVM[],
  cols: number,
  startRank: number,
  jackets: Map<string, string>,
  cmColor: Record<string, string>,
): El {
  const width = CARD_W * cols + GAP * (cols - 1);
  const cards = vms.map((vm, i) =>
    jacketCard(
      vm,
      startRank + i,
      vm.jacketFile ? (jackets.get(vm.jacketFile) ?? null) : null,
      cmColor,
    ),
  );
  return el(
    "div",
    { display: "flex", flexWrap: "wrap", width, marginTop: 5, gap: GAP },
    cards,
  );
}

function avg(vms: CardVM[]): number {
  if (!vms.length) return 0;
  return vms.reduce((s, v) => s + v.rs, 0) / vms.length;
}

// ─── Public: render rating target card as PNG ─────────────────────────────
export async function renderRatingCard(
  profile: CachedProfile,
  records: PlayRecord[],
  avatarBuf: Buffer | null,
  translate = false,
  game: GameId = "maimai",
): Promise<Buffer> {
  const cfg = GAMES[game];
  const cmColor = GAME_CM_COLOR[game];
  // 곡별 RS는 게임별 포맷을 쓰되, 섹션 평균은 maimai만 기존 표기(소수 1자리)를 유지
  const formatAvg = game === "maimai" ? (v: number) => v.toFixed(1) : cfg.formatRS;
  // ─── Render cache: return cached PNG if profile and card version unchanged ─
  // 번역 표시본은 뷰어별로 달라 공유 캐시(원제 기준)를 쓰지 않고 매번 새로 렌더한다.
  // 타 게임 치환본도 마찬가지로 maimai 기준 캐시를 공유하지 않는다.
  const cacheable = !translate && game === "maimai";
  const cached = cacheable ? await getRatingCardCache(profile.profileKey) : null;
  if (
    cached &&
    cached.syncedAt === profile.lastSyncedAt &&
    cached.version === CARD_VERSION
  ) {
    return cached.blob;
  }

  // 레이팅 대상 페이지엔 FC/AP·Sync 마크가 없어 clear 기록에서 마크를 끌어옴
  let clearRecords: PlayRecord[] = [];
  try {
    const parsed = JSON.parse(profile.clearJson || "[]");
    if (Array.isArray(parsed)) clearRecords = parsed;
  } catch {
    /* ignore */
  }
  const markMap = buildMarkMap(clearRecords);
  // 레이팅 대상 페이지의 ST/DX가 부정확할 수 있어 clear 기록으로 보정
  const resolveKind = buildKindResolver(clearRecords);
  const fix = (r: PlayRecord): PlayRecord => ({
    ...r,
    musicKind: resolveKind(r),
  });

  const vmOf = (r: PlayRecord) =>
    toVM(fix(r), markMap, profile.server, translate, game);

  // 섹션 구성. maimai는 기존 동작(레이팅 대상 50곡)을 그대로 유지하고,
  // 타 게임은 mai-log와 동일하게 전체 기록에서 게임별 규칙으로 다시 뽑는다.
  const sections: { label: string; cols: number; vms: CardVM[] }[] = [];
  let totalRs: string;

  if (game === "maimai") {
    // 국제판: maimai net 파싱 순서(신곡 15 + 구곡 35)를 그대로 신뢰.
    // JP: 전체 기록에서 직접 산출하므로 버전(isNewSong)으로 분류(15/35 미만 오분류 방지).
    const newRecords =
      profile.server === "jp"
        ? records.filter((r) => isNewSong(r.title, "jp")).slice(0, 15)
        : records.slice(0, 15);
    const otherRecords =
      profile.server === "jp"
        ? records.filter((r) => !isNewSong(r.title, "jp")).slice(0, 35)
        : records.slice(15, 50);
    const newVms = newRecords.map(vmOf);
    const otherVms = otherRecords.map(vmOf);
    sections.push({ label: "NEW", cols: 3, vms: newVms });
    sections.push({ label: "OTHERS", cols: 7, vms: otherVms });
    // 헤더에는 프로필에 저장된 실제 레이팅을 표시
    totalRs = String(
      profile.rating || newVms.concat(otherVms).reduce((s, v) => s + v.rs, 0),
    );
  } else {
    // 치환 대상은 레이팅 대상 50곡이 아니라 전체 기록 풀에서 고른다.
    // clear 기록이 없으면(수집 전) 레이팅 대상곡으로 대체한다.
    const pool = clearRecords.length > 0 ? clearRecords : records;
    const rated = pool
      .filter((r) => r.achievementVal > 0)
      .map((r) => ({ r, vm: vmOf(r) }));
    const byRs = (a: { vm: CardVM }, b: { vm: CardVM }) => b.vm.rs - a.vm.rs;
    const [first, second] = cfg.sections;

    if (cfg.select === "newOld") {
      const news = rated
        .filter((x) => isNewSong(x.r.title, profile.server))
        .sort(byRs)
        .slice(0, first.count)
        .map((x) => x.vm);
      const olds = rated
        .filter((x) => !isNewSong(x.r.title, profile.server))
        .sort(byRs)
        .slice(0, second.count)
        .map((x) => x.vm);
      sections.push({ label: first.label, cols: first.cols, vms: news });
      sections.push({ label: second.label, cols: second.cols, vms: olds });
    } else if (cfg.select === "top") {
      const top = rated
        .sort(byRs)
        .slice(0, first.count)
        .map((x) => x.vm);
      sections.push({ label: first.label, cols: first.cols, vms: top });
    }

    // 2배 가중치가 붙는 상위 N곡은 레이팅 숫자를 강조색으로 표시 (Arcaea 7.0)
    if (cfg.doubleCount) {
      for (const vm of sections[0].vms.slice(0, cfg.doubleCount))
        vm.rsColor = RS_DOUBLE_COLOR;
    }

    const allVms = sections.flatMap((sec) => sec.vms);
    totalRs = cfg.formatTotal(cfg.calcTotal(allVms.map((v) => v.rs)));
  }

  // prefetch all jacket images
  const files = [
    ...new Set(
      sections.flatMap((sec) =>
        sec.vms.flatMap((v) => (v.jacketFile ? [v.jacketFile] : [])),
      ),
    ),
  ];
  const jackets = new Map<string, string>();
  await Promise.all(
    files.map(async (file) => {
      const url = await fetchJacketDataUrl(file);
      if (url) jackets.set(file, url);
    }),
  );

  const gridWidth = (cols: number) => CARD_W * cols + GAP * (cols - 1);
  // 첫 섹션을 살짝 밝은 패널로 감싸고 두 섹션 사이에 구분선
  const NEW_PAD = 6; // 패널 안쪽 여백 (틴트가 카드 둘레로 보이게)
  const DIV_W = 1; // 섹션 구분선 두께
  const COL_GAP = 12;
  const twoCol = sections.length > 1;
  const leftWidth = gridWidth(sections[0].cols);
  const rightWidth = twoCol ? gridWidth(sections[1].cols) : 0;
  const newPanelWidth = leftWidth + NEW_PAD * 2;
  const bodyWidth = twoCol
    ? newPanelWidth + COL_GAP + DIV_W + COL_GAP + rightWidth
    : leftWidth;
  const PAD = 16;
  const totalWidth = bodyWidth + PAD * 2;

  // header
  const avatarUrl = avatarBuf
    ? `data:image/png;base64,${avatarBuf.toString("base64")}`
    : null;
  const profileBlock = el(
    "div",
    { display: "flex", alignItems: "center", gap: 10 },
    [
      avatarUrl
        ? ({
            type: "img",
            props: {
              src: avatarUrl,
              style: { width: 38, height: 38, objectFit: "cover" },
            },
          } as any)
        : el("div", {
            width: 38,
            height: 38,
            background: "#242424",
            display: "flex",
          }),
      el("div", { display: "flex", flexDirection: "column" }, [
        ...(profile.trophy
          ? [
              el(
                "span",
                { fontSize: 8, color: "#888", marginBottom: 1 },
                profile.trophy,
              ),
            ]
          : []),
        el(
          "span",
          { fontSize: 12, fontWeight: 700, color: "#fff" },
          profile.playerName || "—",
        ),
      ]),
    ],
  );

  const wordmark = el("div", { display: "flex", alignItems: "baseline" }, [
    el(
      "span",
      { fontSize: 13, fontWeight: 700, color: "#888", marginRight: 6 },
      "Created by",
    ),
    el("span", { fontSize: 13, fontWeight: 800, color: "#fff" }, "carol"),
    el("span", { fontSize: 13, fontWeight: 800, color: ACCENT }, "bot"),
  ]);

  const ratingBlock = el(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "flex-end" },
    [
      el("span", { fontSize: 8, color: "#777" }, cfg.ratingLabel),
      el(
        "span",
        { fontSize: 20, fontWeight: 800, color: cfg.accent, lineHeight: 1.1 },
        totalRs,
      ),
    ],
  );

  // 3등분 컬럼: 가운데 칸이 이미지 정중앙에 고정되도록 각 칸 flex:1
  const header = el(
    "div",
    {
      display: "flex",
      alignItems: "center",
      width: bodyWidth,
      paddingBottom: 10,
      borderBottom: "1px solid #1e1e1e",
    },
    [
      el(
        "div",
        { display: "flex", flex: 1, justifyContent: "flex-start" },
        profileBlock,
      ),
      el(
        "div",
        { display: "flex", flex: 1, justifyContent: "center" },
        wordmark,
      ),
      el(
        "div",
        { display: "flex", flex: 1, justifyContent: "flex-end" },
        ratingBlock,
      ),
    ],
  );

  const sectionPanel = (
    sec: { label: string; cols: number; vms: CardVM[] },
    tinted: boolean,
  ): El =>
    el(
      "div",
      tinted
        ? {
            display: "flex",
            flexDirection: "column",
            width: gridWidth(sec.cols) + NEW_PAD * 2,
            padding: NEW_PAD,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 6,
          }
        : {
            display: "flex",
            flexDirection: "column",
            width: gridWidth(sec.cols),
            // 틴트 패널의 상하 패딩만큼 맞춰 섹션 라벨/카드 높이를 정렬 (가로 패딩은 없음 → 폭 유지)
            paddingTop: NEW_PAD,
            paddingBottom: NEW_PAD,
          },
      [
        sectionLabel(sec.label, sec.vms.length, avg(sec.vms), formatAvg),
        cardGrid(sec.vms, sec.cols, 1, jackets, cmColor),
      ],
    );

  const body = twoCol
    ? el(
        "div",
        {
          display: "flex",
          marginTop: 10,
          gap: COL_GAP,
          alignItems: "flex-start",
        },
        [
          sectionPanel(sections[0], true),
          // 섹션 구분선
          el("div", {
            width: DIV_W,
            alignSelf: "stretch",
            background: "rgba(255,255,255,0.12)",
          }),
          sectionPanel(sections[1], false),
        ],
      )
    : el(
        "div",
        { display: "flex", flexDirection: "column", marginTop: 10 },
        [sectionPanel(sections[0], false)],
      );

  const root = el(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      background: "#0d0d0d",
      padding: PAD,
    },
    [header, body],
  );

  const buf = await renderInWorker(root, totalWidth);

  // ─── Persist render cache ─────────────────────────────────────────────────
  // 번역본·치환본은 공유 캐시(maimai 원제 기준)를 덮어쓰지 않는다.
  if (cacheable) {
    await saveRatingCardCache(
      profile.profileKey,
      buf,
      profile.lastSyncedAt,
      CARD_VERSION,
    );
  }

  return buf;
}
