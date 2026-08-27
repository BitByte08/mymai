import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, AttachmentBuilder } from "discord.js";
import { getCachedProfile, getUserFriendCode, getAvatarBlob, getProfilePrivate, getTranslateTitles } from "../../storage";
import { getTopList, getClearList } from "../utils/embeds";
import { renderRatingCard } from "../utils/ratingCard";
import { GAMES, isGameId } from "../../games";
import type { GameId } from "../../games";

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
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") ?? interaction.user;
  const gameOpt = interaction.options.getString("게임") ?? "maimai";
  const game: GameId = isGameId(gameOpt) ? gameOpt : "maimai";
  const userId = target.id;
  if (target.id !== interaction.user.id && await getProfilePrivate(target.id)) {
    await interaction.reply({ content: `<@${target.id}> 님은 프로필을 비공개로 설정했습니다.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const friendCode = await getUserFriendCode(userId);
  const cached = friendCode ? await getCachedProfile(friendCode) : null;
  if (!cached) {
    const msg = target.id === interaction.user.id
      ? "아직 프로필이 등록되지 않았습니다. `/북마클릿` 명령어로 먼저 등록해주세요."
      : `<@${target.id}> 님은 아직 프로필을 등록하지 않았습니다.`;
    await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    return;
  }
  const records = getTopList(cached);
  // 치환 모드는 레이팅 대상 50곡이 아니라 전체 기록에서 다시 뽑으므로
  // 레이팅 대상이 비어 있어도 clear 기록만 있으면 그릴 수 있다.
  const hasSource =
    records.length > 0 || (game !== "maimai" && getClearList(cached).length > 0);
  if (!hasSource) {
    await interaction.reply({ content: "레이팅 기록이 없습니다. 북마클릿을 다시 실행하세요.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply();
  try {
    const png = await renderRatingCard(
      cached,
      records,
      await getAvatarBlob(userId, cached.server),
      await getTranslateTitles(interaction.user.id),
      game,
    );
    await interaction.editReply({
      files: [new AttachmentBuilder(png, { name: `rating-${game}.png` })],
    });
  } catch (e) {
    console.error("[레이팅이미지]", e);
    await interaction.editReply({ content: "이미지 생성에 실패했습니다." }).catch(() => {});
  }
}
