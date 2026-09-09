import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getAvatarBlob, getProfilePrivate, getTranslateTitles, getRatingSnapshot, getRatingSnapshotRange } from "../../storage";
import { getTopList, getClearList } from "../utils/embeds";
import { renderRatingCard } from "../utils/ratingCard";
import { GAMES, isGameId } from "../../games";
import { msg } from "../../messages";
import type { GameId } from "../../games";
import type { PlayRecord } from "../../scraper";

export const data = new SlashCommandBuilder()
  .setName("레이팅표")
  .setDescription("레이팅 대상곡을 이미지로 표시 (생략 시 본인)")
  .addUserOption((opt) =>
    opt.setName("user").setDescription("조회할 유저 (생략 시 본인)").setRequired(false),
  )
  .addStringOption((opt) =>
    opt
      .setName("게임")
      .setDescription("다른 리듬게임의 레이팅 체계로 환산 (생략 시 maimai DX)")
      .setRequired(false)
      .addChoices(
        ...Object.values(GAMES).map((g) => ({ name: g.label, value: g.id })),
      ),
  )
  .addStringOption((opt) =>
    opt
      .setName("date")
      .setDescription("과거 날짜의 레이팅표 (YYYY-MM-DD, 생략 시 최신)")
      .setRequired(false),
  );

function isPlayDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const gameOpt = interaction.options.getString("게임") ?? "maimai";
  const game: GameId = isGameId(gameOpt) ? gameOpt : "maimai";
  const dateOpt = (interaction.options.getString("date") ?? "").trim();
  const userId = target.id;
  if (target.id !== interaction.user.id && await getProfilePrivate(target.id)) {
    await interaction.reply({ content: msg("common.profilePrivate", { user: `<@${target.id}>` }), flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const text = target.id === interaction.user.id
      ? msg("common.selfNotRegistered")
      : msg("common.otherNotRegistered", { user: `<@${target.id}>` });
    await interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
    return;
  }
  // 과거 날짜: 하루치 스냅샷(레이팅 대상 50곡 + 총합 레이팅)으로 대체한다.
  // 스냅샷은 50곡만 보관하므로 전체 기록이 필요한 타 게임 환산은 지원하지 않는다.
  let snapshotDay = "";
  let profile = cached;
  let records = getTopList(cached);
  if (dateOpt) {
    if (!isPlayDayKey(dateOpt)) {
      await interaction.reply({ content: msg("ratingImage.snapshotBadDate"), flags: MessageFlags.Ephemeral });
      return;
    }
    if (game !== "maimai") {
      await interaction.reply({ content: msg("ratingImage.snapshotGameUnsupported"), flags: MessageFlags.Ephemeral });
      return;
    }
    const snap = await getRatingSnapshot(cached.profileKey, dateOpt);
    if (!snap) {
      const range = await getRatingSnapshotRange(cached.profileKey);
      const notice = range
        ? msg("ratingImage.snapshotMissing", { date: dateOpt, first: range.first, last: range.last })
        : msg("ratingImage.snapshotNone");
      await interaction.reply({ content: notice, flags: MessageFlags.Ephemeral });
      return;
    }
    let snapRecords: PlayRecord[] = [];
    try {
      const parsed = JSON.parse(snap.topJson);
      if (Array.isArray(parsed)) snapRecords = parsed;
    } catch { /* ignore */ }
    snapshotDay = dateOpt;
    records = snapRecords;
    // 스냅샷 레코드는 마크·ST/DX 보정이 끝난 상태라, clearJson 자리에 그대로 넣으면
    // 렌더 쪽 markMap/kindResolver 가 현재 프로필 대신 그날 상태를 본다.
    profile = { ...cached, rating: snap.rating, clearJson: snap.topJson, lastSyncedAt: snap.syncedAt };
  }
  // 치환 모드는 레이팅 대상 50곡이 아니라 전체 기록에서 다시 뽑으므로
  // 레이팅 대상이 비어 있어도 clear 기록만 있으면 그릴 수 있다.
  const hasSource =
    records.length > 0 || (game !== "maimai" && getClearList(profile).length > 0);
  if (!hasSource) {
    await interaction.reply({ content: msg("ratingImage.noRecords"), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  try {
    const png = await renderRatingCard(
      profile,
      records,
      await getAvatarBlob(userId, profile.server),
      await getTranslateTitles(interaction.user.id),
      game,
      !snapshotDay,
    );
    await interaction.editReply({
      content: snapshotDay ? msg("ratingImage.snapshotNotice", { date: snapshotDay }) : undefined,
      files: [new AttachmentBuilder(png, { name: snapshotDay ? `rating-${snapshotDay}.png` : `rating-${game}.png` })],
    });
  } catch (e) {
    console.error("[레이팅이미지]", e);
    await interaction.editReply({ content: msg("ratingImage.renderFailed") }).catch(() => {});
  }
}
