const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const config = require('../../config');
const { players, teams, queue } = require('../../database/db');
const { generateTeamCode } = require('../../utils/codeGenerator');
const { successEmbed, errorEmbed, teamEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');
const selectHandler = require('../../interactions/selectMenus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createteam')
        .setDescription('🛡️ Create a new team')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Your team name')
                .setRequired(true)
                .setMaxLength(32)
        )
        .addIntegerOption(option =>
            option.setName('size')
                .setDescription('Team size (number of players, 2-10)')
                .setRequired(true)
                .setMinValue(2)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        const player = players.get(interaction.user.id);
        if (!player) {
            return interaction.reply({
                embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                ephemeral: true,
            });
        }

        // Block if already in a team
        const existingTeams = teams.getByPlayer(interaction.user.id);
        if (existingTeams.length > 0) {
            const currentTeam = existingTeams[0];
            return interaction.reply({
                embeds: [errorEmbed('Already in a Team', `You're already in **${currentTeam.name}**. Leave it first with \`/leaveteam\`.`)],
                ephemeral: true,
            });
        }

        // If player is in matchmaking queue, auto-remove (mutual exclusivity)
        if (queue.isQueued(interaction.user.id)) {
            queue.remove(interaction.user.id);
        }

        const teamName = interaction.options.getString('name');
        const size = interaction.options.getInteger('size');

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const code = generateTeamCode();

        // Get player's game for category
        const gameKey = Object.keys(config.games).find(k => config.games[k].name === player.game);
        const game = gameKey ? config.games[gameKey] : null;

        // Create team in DB (creator is always the captain)
        const result = teams.create(code, teamName, interaction.user.id, size);
        const teamId = result.lastInsertRowid;
        teams.addMember(teamId, interaction.user.id);

        let textChannel = null;
        let voiceChannel = null;
        let category = null;

        try {
            // Find or create game-specific category
            if (game) {
                category = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name === `${game.emoji} ${game.name}`
                );
                if (!category) {
                    category = await guild.channels.create({
                        name: `${game.emoji} ${game.name}`,
                        type: ChannelType.GuildCategory,
                        reason: `Outplayed game category for ${game.name}`,
                    });
                }
            }

            const permissionOverwrites = [
                { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
            ];

            // Create text channel under game category
            textChannel = await guild.channels.create({
                name: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
                type: ChannelType.GuildText,
                parent: category?.id || null,
                permissionOverwrites,
                reason: `Outplayed team channel for ${teamName}`,
            });

            // Create voice channel under game category
            voiceChannel = await guild.channels.create({
                name: `🔊 ${teamName}`,
                type: ChannelType.GuildVoice,
                parent: category?.id || null,
                permissionOverwrites,
                reason: `Outplayed team voice channel for ${teamName}`,
            });

            teams.updateChannel(teamId, textChannel.id, voiceChannel.id, category?.id || null);

            const team = teams.getById(teamId);
            const members = teams.getMembers(teamId);

            await textChannel.send({
                embeds: [teamEmbed(team, members)],
                content: `## 🛡️ Welcome to **${teamName}**!\n\nShare this code for others to join:\n# \`${code}\`\n\nThey can join with: \`/jointeam ${code}\``,
            });

            // Captain controls (server owner also gets access)
            const captainRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`team_kick_${teamId}_${interaction.user.id}`)
                    .setLabel('Kick Member')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('👢'),
                new ButtonBuilder()
                    .setCustomId(`team_disband_${teamId}_${interaction.user.id}`)
                    .setLabel('Disband Team')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('💣'),
            );

            await textChannel.send({
                content: '**👑 Captain Controls** *(Server Owner can also use these)*:',
                components: [captainRow],
            });
        } catch (err) {
            console.log(`⚠️ Could not create channels for team ${teamName}: ${err.message}. Team created without channels.`);
        }

        logger.info(`Team created: ${teamName} (${code}) by ${interaction.user.tag}`);

        const channelInfo = textChannel ? `\n📢 **Text Channel:** <#${textChannel.id}>` : '\n⚠️ *Could not create channels — bot needs Manage Channels permission*';
        const voiceInfo = voiceChannel ? `\n🔊 **Voice Channel:** <#${voiceChannel.id}>` : '';

        await interaction.editReply({
            embeds: [
                successEmbed('Team Created!', `**${teamName}** is ready!\n\n📋 **Team Code:** \`${code}\`${channelInfo}${voiceInfo}\n👥 **Size:** 1/${size}\n\nShare the code with your teammates!`),
            ],
        });
    },
};

// ─── Kick Member Button ──────────────────────────────────────
buttonHandler.register('team_kick_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const captainId = parts[3];

    // Allow captain OR server owner (owner is above captain)
    const isAdmin = interaction.member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator);
    if (interaction.user.id !== captainId && interaction.user.id !== interaction.guild.ownerId && !isAdmin) {
        return interaction.reply({ content: '⛔ Only the captain or server owner can kick members.', ephemeral: true });
    }

    const team = teams.getById(teamId);
    if (!team) {
        return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    }

    const members = teams.getMembers(teamId);
    const kickable = members.filter(m => m.discord_id !== team.captain_id);

    if (kickable.length === 0) {
        return interaction.reply({ content: '❌ No members to kick (captain is the only member).', ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`team_kickselect_${teamId}_${interaction.user.id}`)
        .setPlaceholder('Select member to kick...')
        .addOptions(kickable.map(m => ({
            label: m.player_id,
            description: `${m.game} — ${m.rank}`,
            value: m.discord_id,
            emoji: '👤',
        })));

    await interaction.reply({
        content: '## 👢 Kick Member\nSelect the member to remove:',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
    });
});

// ─── Kick Member Select ─────────────────────────────────────
selectHandler.register('team_kickselect_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const kickedId = interaction.values[0];
    const team = teams.getById(teamId);

    if (!team) {
        return interaction.update({ content: '❌ Team not found.', components: [] });
    }

    // Remove member from DB
    teams.removeMember(teamId, kickedId);
    teams.decrementSize(teamId);

    // If team was locked, unlock since a spot opened
    if (team.locked) {
        teams.unlock(teamId);
    }

    // Remove channel permissions
    const guild = interaction.guild;
    if (team.channel_id) {
        try {
            const channel = await guild.channels.fetch(team.channel_id);
            if (channel) {
                await channel.permissionOverwrites.delete(kickedId).catch(() => { });
                await channel.send({ content: `## 👢 Member Kicked\n<@${kickedId}> has been removed from the team by <@${interaction.user.id}>.` });
            }
        } catch (_) { }
    }
    if (team.voice_channel_id) {
        try {
            const vc = await guild.channels.fetch(team.voice_channel_id);
            if (vc) await vc.permissionOverwrites.delete(kickedId).catch(() => { });
        } catch (_) { }
    }

    logger.info(`Member kicked: ${kickedId} from ${team.name} (${team.code}) by ${interaction.user.tag}`);

    // Check if team is now empty after kick — auto-disband if so
    const updatedTeam = teams.getById(teamId);
    const remainingMembers = teams.getMembers(teamId);
    if (remainingMembers.length === 0) {
        // Delete channels
        if (updatedTeam.channel_id) {
            try {
                const ch = await guild.channels.fetch(updatedTeam.channel_id);
                if (ch) setTimeout(() => ch.delete('Team empty').catch(() => { }), 5_000);
            } catch (_) { }
        }
        if (updatedTeam.voice_channel_id) {
            try {
                const vc = await guild.channels.fetch(updatedTeam.voice_channel_id);
                if (vc) setTimeout(() => vc.delete('Team empty').catch(() => { }), 5_000);
            } catch (_) { }
        }
        teams.delete(teamId);
        logger.info(`Team auto-disbanded (empty after kick): ${team.name} (${team.code})`);
    }

    await interaction.update({
        content: `✅ <@${kickedId}> has been kicked from **${team.name}**.`,
        components: [],
    });
});

// ─── Disband Team ────────────────────────────────────────────
buttonHandler.register('team_disband_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const captainId = parts[3];

    // Allow captain OR server owner (owner is above captain)
    const isAdmin = interaction.member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator);
    if (interaction.user.id !== captainId && interaction.user.id !== interaction.guild.ownerId && !isAdmin) {
        return interaction.reply({ content: '⛔ Only the captain or server owner can disband this team.', ephemeral: true });
    }

    const team = teams.getById(teamId);
    if (!team) {
        return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    }

    await interaction.deferUpdate();
    const guild = interaction.guild;

    // Delete text channel
    if (team.channel_id) {
        try {
            const channel = await guild.channels.fetch(team.channel_id);
            if (channel) {
                await channel.send({ embeds: [errorEmbed('Team Disbanded', `**${team.name}** has been disbanded. This channel will be deleted in 10 seconds.`)] });
                setTimeout(() => channel.delete('Team disbanded').catch(() => { }), 10_000);
            }
        } catch (_) { }
    }

    // Delete voice channel
    if (team.voice_channel_id) {
        try {
            const vc = await guild.channels.fetch(team.voice_channel_id);
            if (vc) setTimeout(() => vc.delete('Team disbanded').catch(() => { }), 10_000);
        } catch (_) { }
    }

    teams.delete(teamId);
    logger.info(`Team disbanded: ${team.name} (${team.code}) by ${interaction.user.tag}`);
});
