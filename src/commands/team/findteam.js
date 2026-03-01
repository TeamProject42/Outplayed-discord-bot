const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const config = require('../../config');
const { players, teams, queue } = require('../../database/db');
const { generateTeamCode } = require('../../utils/codeGenerator');
const { successEmbed, errorEmbed, infoEmbed, teamEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

// Default team size for auto-match (used when no tournament context)
const DEFAULT_TEAM_SIZE = 2;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('findteam')
        .setDescription('🔍 Auto-matchmake into a team based on your rank')
        .addIntegerOption(opt =>
            opt.setName('size')
                .setDescription('Team size (2-5, default: 2)')
                .setRequired(false)
                .setMinValue(2)
                .setMaxValue(5)
        ),

    async execute(interaction) {
        const player = players.get(interaction.user.id);
        if (!player) {
            return interaction.reply({
                embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                ephemeral: true,
            });
        }

        if (queue.isQueued(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Already Queued', 'You\'re already in the matchmaking queue! Please wait.')],
                ephemeral: true,
            });
        }

        const teamSize = interaction.options.getInteger('size') || DEFAULT_TEAM_SIZE;

        await interaction.deferReply({ ephemeral: true });

        const gameKey = Object.keys(config.games).find(k => config.games[k].name === player.game) || 'valorant';
        const rankBucket = config.getRankBucket(gameKey, player.rank);

        // Add to queue
        queue.add(interaction.user.id, player.game, player.rank, rankBucket);

        // Check if enough players in the same bucket
        const queuedPlayers = queue.getByBucket(player.game, rankBucket);

        if (queuedPlayers.length >= teamSize) {
            // Enough players — create a team!
            const selectedPlayers = queuedPlayers.slice(0, teamSize);
            const teamName = `Auto-${rankBucket.charAt(0).toUpperCase() + rankBucket.slice(1)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
            const code = generateTeamCode();

            const captainIndex = Math.floor(Math.random() * selectedPlayers.length);

            // Create team
            const result = teams.create(code, teamName, selectedPlayers[captainIndex].player_id, teamSize);
            const teamId = result.lastInsertRowid;

            for (const qp of selectedPlayers) {
                teams.addMember(teamId, qp.player_id);
                queue.remove(qp.player_id);
            }

            const db = require('../../database/db').getDb();
            db.prepare('UPDATE teams SET current_size = ?, locked = 1 WHERE id = ?').run(teamSize, teamId);

            const guild = interaction.guild;

            // Create channel with direct user permissions (no roles needed)
            let channel = null;
            try {
                const permissionOverwrites = [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
                ];

                for (const qp of selectedPlayers) {
                    permissionOverwrites.push({
                        id: qp.player_id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
                    });
                }

                channel = await guild.channels.create({
                    name: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites,
                    reason: 'Outplayed auto-matched team',
                });

                teams.updateChannel(teamId, channel.id, null);

                const team = teams.getById(teamId);
                const members = teams.getMembers(teamId);

                const mentionList = selectedPlayers.map(qp => `<@${qp.player_id}>`).join(' ');
                await channel.send({
                    content: `## 🎉 Auto-Matched Team!\n${mentionList}\n\nYou've been matched into **${teamName}**!\n👑 Captain: <@${selectedPlayers[captainIndex].player_id}>\n\nTeam Code: \`${code}\``,
                    embeds: [teamEmbed(team, members)],
                });
            } catch (err) {
                console.log(`⚠️ Could not create channel for auto-team ${teamName}: ${err.message}`);
            }

            logger.info(`Auto-matched team: ${teamName} (${code}) — ${selectedPlayers.length} players`);

            const channelInfo = channel ? `\n📢 Channel: <#${channel.id}>` : '';

            await interaction.editReply({
                embeds: [
                    successEmbed('Team Found!', `You've been matched into **${teamName}**!${channelInfo}\n👥 ${teamSize} players matched\n🏅 Rank bucket: ${rankBucket}\n📋 Code: \`${code}\``),
                ],
            });
        } else {
            logger.info(`Player queued: ${interaction.user.tag} → ${player.game} (${rankBucket}) — ${queuedPlayers.length}/${teamSize}`);

            await interaction.editReply({
                embeds: [
                    infoEmbed('🔍 Added to Matchmaking Queue', `You're in the queue!\n\n🎮 **Game:** ${player.game}\n🏅 **Rank Bucket:** ${rankBucket}\n👥 **Queue:** ${queuedPlayers.length}/${teamSize} players\n\nYou'll be notified when a team is formed.`),
                ],
            });
        }
    },
};
