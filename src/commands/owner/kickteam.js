const { SlashCommandBuilder } = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, teams: teamDb } = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kickteam')
        .setDescription('🚫 Remove a team from a tournament (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id').setDescription('Tournament code (e.g. OUT-XXXXX)').setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('team_name').setDescription('Name of the team to kick').setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const teamName = interaction.options.getString('team_name');

        const tournament = tournaments.getByCode(code);
        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        // Find team by name in this tournament
        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);
        const team = registeredTeams.find(t => t.name.toLowerCase() === teamName.toLowerCase());

        if (!team) {
            const available = registeredTeams.map(t => `\`${t.name}\``).join(', ') || 'None';
            return interaction.reply({
                embeds: [errorEmbed('Team Not Found', `No team named **${teamName}** in this tournament.\n\n**Registered teams:** ${available}`)],
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        // Unregister from tournament
        tournaments.unregisterTeam(tournament.id, team.id);
        teamDb.setTournament(team.id, null);

        // Remove channel access
        if (team.role_id) {
            try {
                const guild = interaction.guild;
                // Find match channels and remove team's role permissions
                const { matches: matchDb } = require('../../database/db');
                const allMatches = matchDb.getByTournament(tournament.id);
                for (const match of allMatches) {
                    if (match.channel_id && (match.team1_id === team.id || match.team2_id === team.id)) {
                        try {
                            const channel = await guild.channels.fetch(match.channel_id);
                            if (channel) {
                                await channel.permissionOverwrites.delete(team.role_id);
                                await channel.send({ content: `## 🚫 Team Kicked\n**${team.name}** has been removed from this tournament by the server owner.` });
                            }
                        } catch (_) { }
                    }
                }
            } catch (_) { }
        }

        logOwnerAction(interaction.guild.id, interaction.user.id, 'KICK_TEAM', team.name, {
            teamId: team.id,
            tournamentCode: code,
        });

        logger.info(`Team kicked: ${team.name} from ${tournament.name} (${code})`);

        await interaction.editReply({
            embeds: [successEmbed('Team Kicked', `**${team.name}** has been removed from **${tournament.name}**.\n\nThis action has been logged.`)],
        });
    },
};
