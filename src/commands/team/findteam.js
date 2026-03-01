const {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const config = require('../../config');
const { players, teams, queue, tournaments } = require('../../database/db');
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
                .setDescription('Team size (2-10, default: 2)')
                .setRequired(false)
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

        if (queue.isQueued(interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed('Already Queued', 'You\'re already in the matchmaking queue! Please wait.')],
                ephemeral: true,
            });
        }

        // Mutual exclusivity: warn if player is already in active teams
        const existingTeams = teams.getByPlayer(interaction.user.id);
        // Only block if they're in teams that aren't from completed tournaments
        const activeTeams = existingTeams.filter(t => {
            if (!t.tournament_id) return true; // standalone team, counts
            const tourney = tournaments.getById(t.tournament_id);
            return tourney && tourney.status !== 'completed';
        });

        if (activeTeams.length > 0) {
            const teamList = activeTeams.map(t => `• **${t.name}** (\`${t.code}\`)`).join('\n');
            return interaction.reply({
                embeds: [errorEmbed('Already in a Team', `You're currently in a team. Leave your team(s) first before joining solo matchmaking.\n\n${teamList}\n\nUse \`/leaveteam\` to leave.`)],
                ephemeral: true,
            });
        }

        const teamSize = interaction.options.getInteger('size') || DEFAULT_TEAM_SIZE;

        await interaction.deferReply({ ephemeral: true });

        const gameKey = Object.keys(config.games).find(k => config.games[k].name === player.game) || 'valorant';
        const game = config.games[gameKey];
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

            // First queued player is the captain (not random)
            const captainPlayer = selectedPlayers[0];

            // Create team
            const result = teams.create(code, teamName, captainPlayer.player_id, teamSize);
            const teamId = result.lastInsertRowid;

            for (const qp of selectedPlayers) {
                teams.addMember(teamId, qp.player_id);
                queue.remove(qp.player_id);
            }

            const db = require('../../database/db').getDb();
            db.prepare('UPDATE teams SET current_size = ?, locked = 1 WHERE id = ?').run(teamSize, teamId);

            const guild = interaction.guild;

            // Find or create game-specific category
            let category = null;
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

            // Create channels with direct user permissions
            let textChannel = null;
            let voiceChannel = null;
            try {
                const permissionOverwrites = [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                ];

                for (const qp of selectedPlayers) {
                    permissionOverwrites.push({
                        id: qp.player_id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
                    });
                }

                textChannel = await guild.channels.create({
                    name: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
                    type: ChannelType.GuildText,
                    parent: category?.id || null,
                    permissionOverwrites,
                    reason: 'Outplayed auto-matched team',
                });

                voiceChannel = await guild.channels.create({
                    name: `🔊 ${teamName}`,
                    type: ChannelType.GuildVoice,
                    parent: category?.id || null,
                    permissionOverwrites,
                    reason: 'Outplayed auto-matched team voice',
                });

                teams.updateChannel(teamId, textChannel.id, voiceChannel.id, category?.id || null);

                const team = teams.getById(teamId);
                const members = teams.getMembers(teamId);

                const mentionList = selectedPlayers.map(qp => `<@${qp.player_id}>`).join(' ');
                await textChannel.send({
                    content: `## 🎉 Auto-Matched Team!\n${mentionList}\n\nYou've been matched into **${teamName}**!\n👑 Captain: <@${captainPlayer.player_id}> *(first to queue)*\n\nTeam Code: \`${code}\``,
                    embeds: [teamEmbed(team, members)],
                });

                // Captain controls (same as createteam)
                const captainRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`team_kick_${teamId}_${captainPlayer.player_id}`)
                        .setLabel('Kick Member')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('👢'),
                    new ButtonBuilder()
                        .setCustomId(`team_disband_${teamId}_${captainPlayer.player_id}`)
                        .setLabel('Disband Team')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('💣'),
                );

                await textChannel.send({
                    content: '**👑 Captain Controls** *(Server Owner can also use these)*:',
                    components: [captainRow],
                });
            } catch (err) {
                console.log(`⚠️ Could not create channels for auto-team ${teamName}: ${err.message}`);
            }

            logger.info(`Auto-matched team: ${teamName} (${code}) — ${selectedPlayers.length} players, captain: ${captainPlayer.player_id}`);

            const channelInfo = textChannel ? `\n📢 Channel: <#${textChannel.id}>` : '';
            const voiceInfo = voiceChannel ? `\n🔊 Voice: <#${voiceChannel.id}>` : '';

            await interaction.editReply({
                embeds: [
                    successEmbed('Team Found!', `You've been matched into **${teamName}**!${channelInfo}${voiceInfo}\n👥 ${teamSize} players matched\n🏅 Rank bucket: ${rankBucket}\n📋 Code: \`${code}\`\n👑 Captain: <@${captainPlayer.player_id}>`),
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
