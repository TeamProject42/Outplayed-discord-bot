const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb, checkins } = require('../../database/db');
const { generateBracket } = require('../../utils/bracketEngine');
const { successEmbed, errorEmbed, matchEmbed, infoEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('starttournament')
        .setDescription('🚀 Start a tournament and generate the bracket (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id')
                .setDescription('Tournament code (e.g. OUT-XXXXX)')
                .setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        if (tournament.status !== 'registration') {
            return interaction.reply({ embeds: [errorEmbed('Invalid State', `This tournament is already **${tournament.status}**.`)], ephemeral: true });
        }

        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);

        if (registeredTeams.length < 2) {
            return interaction.reply({
                embeds: [errorEmbed('Not Enough Teams', `Need at least 2 teams to start. Currently registered: ${registeredTeams.length}`)],
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        // Update status
        tournaments.updateStatus(tournament.id, 'active');

        // Generate bracket
        const teamIds = registeredTeams.map(t => t.id);
        const { matchesCreated, totalRounds, bracketSize } = generateBracket(tournament.id, teamIds);

        logOwnerAction(interaction.guild.id, interaction.user.id, 'START_TOURNAMENT', code, {
            teams: registeredTeams.length,
            bracketSize,
            totalRounds,
        });

        // Create match channels for Round 1 (non-bye matches)
        const guild = interaction.guild;
        const activeMatches = matchesCreated.filter(m => !m.isBye);

        for (const match of activeMatches) {
            const team1 = teamDb.getById(match.team1Id);
            const team2 = teamDb.getById(match.team2Id);

            if (!team1 || !team2) continue;

            // Create match channel
            const channel = await guild.channels.create({
                name: `match-${match.matchNumber}-${team1.name.toLowerCase()}-vs-${team2.name.toLowerCase()}`.replace(/\s+/g, '-').substring(0, 100),
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    ...(team1.role_id ? [{ id: team1.role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
                    ...(team2.role_id ? [{ id: team2.role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
                ],
                reason: `Tournament match: ${tournament.name}`,
            });

            matchDb.setChannel(match.id, channel.id);

            // Check-in buttons
            const checkinRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`match_checkin_${match.id}_${match.team1Id}`)
                    .setLabel(`✅ ${team1.name} Check-in`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`match_checkin_${match.id}_${match.team2Id}`)
                    .setLabel(`✅ ${team2.name} Check-in`)
                    .setStyle(ButtonStyle.Success),
            );

            const mEmbed = matchEmbed({ ...match, status: 'pending', match_number: match.matchNumber }, team1, team2, 1);

            await channel.send({
                content: `## ⚔️ Match ${match.matchNumber} — Round 1\n<@&${team1.role_id}> vs <@&${team2.role_id}>\n\n**Both teams must check in to begin!**`,
                embeds: [mEmbed],
                components: [checkinRow],
            });
        }

        // Build bracket display
        let bracketText = `## 🏆 ${tournament.name} — Bracket\n\n`;
        bracketText += `📊 **${registeredTeams.length} teams** | **${totalRounds} rounds** | **${tournament.format}**\n\n`;
        bracketText += '### Round 1 Matches:\n';

        for (const match of matchesCreated) {
            const t1 = match.team1Id ? teamDb.getById(match.team1Id) : null;
            const t2 = match.team2Id ? teamDb.getById(match.team2Id) : null;

            if (match.isBye) {
                const advancedTeam = t1 || t2;
                bracketText += `- Match ${match.matchNumber}: **${advancedTeam?.name || 'TBD'}** → *BYE (auto-advance)* ✅\n`;
            } else {
                bracketText += `- Match ${match.matchNumber}: **${t1?.name || 'TBD'}** vs **${t2?.name || 'TBD'}**\n`;
            }
        }

        await interaction.editReply({
            content: bracketText,
            embeds: [successEmbed('Tournament Started!', `**${tournament.name}** is live!\n\n${activeMatches.length} match channels created. Let the games begin!`)],
        });

        logger.info(`Tournament started: ${tournament.name} (${code}) — ${registeredTeams.length} teams, ${totalRounds} rounds`);
    },
};

// ─── Check-in Button Handler ─────────────────────────────────
const buttonHandler = require('../../interactions/buttons');

buttonHandler.register('match_checkin_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const matchId = parseInt(parts[2]);
    const teamId = parseInt(parts[3]);

    const team = teamDb.getById(teamId);
    if (!team) {
        return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    }

    // Verify the user is on this team
    const members = teamDb.getMembers(teamId);
    const isMember = members.some(m => m.discord_id === interaction.user.id);

    if (!isMember) {
        return interaction.reply({ content: '⛔ You\'re not on this team.', ephemeral: true });
    }

    // Check if already checked in
    if (checkins.hasCheckedIn(matchId, teamId)) {
        return interaction.reply({ content: '✅ Your team has already checked in!', ephemeral: true });
    }

    checkins.create(matchId, teamId);

    await interaction.reply({
        content: `## ✅ ${team.name} has checked in!\n<@${interaction.user.id}> confirmed attendance.`,
    });

    // Check if both teams are checked in
    const matchCheckins = checkins.getForMatch(matchId);
    if (matchCheckins.length >= 2) {
        await interaction.channel.send({
            content: '## 🟢 Both teams checked in!\nThe match is ready to begin. Good luck!',
        });
        matchDb.updateStatus(matchId, 'active');
    }
});
