import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { RATING_ROLES } from "../utils/roles";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("레이팅기준표")
  .setDescription("레이팅 티어 기준표 보기");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const lines = RATING_ROLES.map(([min, name]) => `${min.toLocaleString()}~  :  **${name}**`);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(msg("ratingTable.title"))
        .setColor(0xbd5dc7)
        .setDescription(lines.join("\n"))
        .setFooter({ text: msg("ratingTable.footer") }),
    ],
  });
}
