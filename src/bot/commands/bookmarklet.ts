import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from "discord.js";
import { getUserSyncToken } from "../../storage";
import { getBaseUrl } from "../../web";
import { PORT } from "../../config";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("북마클릿")
  .setDescription("프로필 동기화용 북마클릿 설치 가이드");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const token = await getUserSyncToken(interaction.user.id);
  const guideUrl = `${getBaseUrl(PORT)}/sync?code=${token}`;
  const btn = new ButtonBuilder()
    .setLabel(msg("bookmarklet.openButton"))
    .setStyle(ButtonStyle.Link)
    .setURL(guideUrl)
    .setEmoji("🔖");
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(btn);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(msg("bookmarklet.title"))
        .setColor(0x888888)
        .setDescription(msg("bookmarklet.body")),
    ],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
