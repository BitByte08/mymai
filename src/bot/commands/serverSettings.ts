import {
  SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder,
  MessageFlags, PermissionsBitField, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, ButtonInteraction,
} from "discord.js";
import { getGuildSetting, setGuildSetting } from "../../storage";
import { msg } from "../../messages";

export const data = new SlashCommandBuilder()
  .setName("서버설정")
  .setDescription("서버 설정 관리 (관리자 전용)");

async function buildSettingsContent(guildId: string) {
  const autoRole = await getGuildSetting(guildId);
  const embed = new EmbedBuilder()
    .setTitle(msg("serverSettings.title"))
    .setColor(0x5865f2)
    .addFields({ name: msg("serverSettings.autoRoleField"), value: autoRole ? msg("serverSettings.enabled") : msg("serverSettings.disabled") });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("serverset:autorole:on")
      .setLabel(msg("serverSettings.enableButton"))
      .setStyle(autoRole ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(autoRole),
    new ButtonBuilder()
      .setCustomId("serverset:autorole:off")
      .setLabel(msg("serverSettings.disableButton"))
      .setStyle(!autoRole ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setDisabled(!autoRole),
  );

  return { embeds: [embed], components: [row] };
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({ content: msg("common.guildOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
    await interaction.reply({ content: msg("common.guildAdminOnly"), flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.reply({ ...(await buildSettingsContent(interaction.guild.id)), flags: MessageFlags.Ephemeral });
}

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;
  const parts = interaction.customId.split(":");
  await setGuildSetting(interaction.guild.id, parts[2] === "on");
  await interaction.update(await buildSettingsContent(interaction.guild.id));
}
