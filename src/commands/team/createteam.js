const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const { players, teams } = require('../../database/db');
const { generateTeamCode } = require('../../utils/codeGenerator');
const { successEmbed, errorEmbed, teamEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createteam')
        .setDescription('🛡️ Create a new team')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Your team name')
                .setRequired(true)
                .setMaxLength(32)
        ),

    async execute(interaction) {
        const player = players.get(interaction.user.id);
        if (!player) {
            return interaction.reply({
                embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                ephemeral: true,
            });
        }

        const teamName = interaction.options.getString('name');

        const row = new ActionRowBuilder();
        for (let size = 2; size <= 5; size++) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`createteam_size_${size}_${teamName.replace(/[^a-zA-Z0-9]/g, '_')}_${interaction.user.id}`)
                    .setLabel(`${size} Players`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('👥')
            );
        }

        await interaction.reply({
            content: `## 🛡️ Create Team: **${teamName}**\nSelect your team size:`,
            components: [row],
            ephemeral: true,
        });
    },
};

// ─── Team Size Selected → Create Team ────────────────────────
buttonHandler.register('createteam_size_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const size = parseInt(parts[2]);
    const originalUserId = parts[parts.length - 1];
    const teamName = parts.slice(3, -1).join(' ');

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your team creation.', ephemeral: true });
    }

    await interaction.deferUpdate();

    const guild = interaction.guild;
    const code = generateTeamCode();

    // Create team in DB
    const result = teams.create(code, teamName, interaction.user.id, size);
    const teamId = result.lastInsertRowid;
    teams.addMember(teamId, interaction.user.id);

    // Try to create a private channel (skip role — use direct user permissions)
    let channel = null;
    try {
        channel = await guild.channels.create({
            name: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
            type: ChannelType.GuildText,
            permissionOverwrites: [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            ],
            reason: `Outplayed team channel for ${teamName}`,
        });

        teams.updateChannel(teamId, channel.id, null);

        const team = teams.getById(teamId);
        const members = teams.getMembers(teamId);

        await channel.send({
            embeds: [teamEmbed(team, members)],
            content: `## 🛡️ Welcome to **${teamName}**!\n\nShare this code for others to join:\n# \`${code}\`\n\nThey can join with: \`/jointeam ${code}\``,
        });

        // Captain controls
        const captainRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`team_disband_${teamId}_${interaction.user.id}`)
                .setLabel('Disband Team')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('💣'),
        );

        await channel.send({
            content: '**👑 Captain Controls:**',
            components: [captainRow],
        });
    } catch (err) {
        console.log(`⚠️ Could not create channel for team ${teamName}: ${err.message}. Team created without channel.`);
    }

    logger.info(`Team created: ${teamName} (${code}) by ${interaction.user.tag}`);

    const channelInfo = channel ? `\n📢 **Channel:** <#${channel.id}>` : '\n⚠️ *Could not create channel — bot needs Manage Channels permission*';

    await interaction.editReply({
        content: null,
        embeds: [
            successEmbed('Team Created!', `**${teamName}** is ready!\n\n📋 **Team Code:** \`${code}\`${channelInfo}\n👥 **Size:** 1/${size}\n\nShare the code with your teammates!`),
        ],
        components: [],
    });
});

// ─── Disband Team ────────────────────────────────────────────
buttonHandler.register('team_disband_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const captainId = parts[3];

    if (interaction.user.id !== captainId) {
        return interaction.reply({ content: '⛔ Only the captain can disband this team.', ephemeral: true });
    }

    const team = teams.getById(teamId);
    if (!team) {
        return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    }

    await interaction.deferUpdate();
    const guild = interaction.guild;

    if (team.channel_id) {
        try {
            const channel = await guild.channels.fetch(team.channel_id);
            if (channel) {
                await channel.send({ embeds: [errorEmbed('Team Disbanded', `**${team.name}** has been disbanded by the captain. This channel will be deleted in 10 seconds.`)] });
                setTimeout(() => channel.delete('Team disbanded').catch(() => { }), 10_000);
            }
        } catch (_) { }
    }

    teams.delete(teamId);
    logger.info(`Team disbanded: ${team.name} (${team.code}) by ${interaction.user.tag}`);
});
