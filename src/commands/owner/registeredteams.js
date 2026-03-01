const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { ownerOnly } = require('../../middleware/ownerOnly');
const { tournaments, teams: teamDb } = require('../../database/db');
const { errorEmbed } = require('../../utils/embeds');
const { embedColor, botName } = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registeredteams')
        .setDescription('📋 View all registered teams in a tournament (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id').setDescription('Tournament code (e.g. OUT-XXXXX)').setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);

        if (registeredTeams.length === 0) {
            return interaction.reply({
                embeds: [errorEmbed('No Teams', `No teams have registered for **${tournament.name}** yet.`)],
                ephemeral: true,
            });
        }

        const teamLines = [];
        for (let i = 0; i < registeredTeams.length; i++) {
            const team = registeredTeams[i];
            const members = teamDb.getMembers(team.id);
            const memberList = members.map(m => `<@${m.discord_id}>`).join(', ');
            const captainTag = `<@${team.captain_id}>`;

            teamLines.push(
                `**${i + 1}. ${team.name}** (\`${team.code}\`)\n` +
                `👑 Captain: ${captainTag}\n` +
                `👥 Members (${team.current_size}/${team.size}): ${memberList}\n` +
                `${team.locked ? '🔒 Locked' : '🔓 Open'}`
            );
        }

        // Split into chunks if too long (embed field limit)
        const embed = new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(`📋 Registered Teams — ${tournament.name}`)
            .setDescription(teamLines.join('\n\n'))
            .setFooter({ text: `${botName} • ${registeredTeams.length}/${tournament.max_teams} teams • ${code}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};
