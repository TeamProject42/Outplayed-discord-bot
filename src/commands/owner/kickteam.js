const { SlashCommandBuilder } = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, teams: teamDb, matches: matchDb } = require('../../database/db');
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

        const guild = interaction.guild;

        // Unregister from tournament
        tournaments.unregisterTeam(tournament.id, team.id);
        teamDb.setTournament(team.id, null);

        // Remove from match channels
        const allMatches = matchDb.getByTournament(tournament.id);
        for (const match of allMatches) {
            if (match.channel_id && (match.team1_id === team.id || match.team2_id === team.id)) {
                try {
                    const channel = await guild.channels.fetch(match.channel_id);
                    if (channel) {
                        await channel.send({ content: `## 🚫 Team Kicked\n**${team.name}** has been removed from this tournament by the server owner.` });
                    }
                } catch (_) { }
            }
        }

        // Delete team text channel
        if (team.channel_id) {
            try {
                const ch = await guild.channels.fetch(team.channel_id);
                if (ch) {
                    await ch.send({ content: `## 🚫 Team Kicked\n**${team.name}** has been kicked from **${tournament.name}**. Channel will be deleted in 10 seconds.` });
                    setTimeout(() => ch.delete('Team kicked from tournament').catch(() => { }), 10_000);
                }
            } catch (_) { }
        }

        // Delete team voice channel
        if (team.voice_channel_id) {
            try {
                const vc = await guild.channels.fetch(team.voice_channel_id);
                if (vc) setTimeout(() => vc.delete('Team kicked from tournament').catch(() => { }), 10_000);
            } catch (_) { }
        }

        // Delete the team and release all players
        teamDb.delete(team.id);

        logOwnerAction(interaction.guild.id, interaction.user.id, 'KICK_TEAM', team.name, {
            teamId: team.id,
            tournamentCode: code,
        });

        logger.info(`Team kicked: ${team.name} from ${tournament.name} (${code})`);

        await interaction.editReply({
            embeds: [successEmbed('Team Kicked', `**${team.name}** has been removed from **${tournament.name}**.\n\n🗑️ Team text & voice channels will be deleted.\n📝 This action has been logged.`)],
        });
    },
};
