const { SlashCommandBuilder } = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, matches: matchDb, teams: teamDb } = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const { ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deletetournament')
        .setDescription('🗑️ Delete a tournament completely (Server Owner only)')
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
            return interaction.reply({
                embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)],
                ephemeral: true,
            });
        }

        await interaction.deferReply();

        const tournamentName = tournament.name;
        const guild = interaction.guild;

        // Clean up match channels
        const allMatches = matchDb.getByTournament(tournament.id);
        for (const match of allMatches) {
            if (match.channel_id) {
                try {
                    const ch = await guild.channels.fetch(match.channel_id);
                    if (ch) await ch.delete('Tournament deleted').catch(() => { });
                } catch (_) { }
            }
        }

        // Clean up team channels (text + voice)
        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);
        const categoryIds = new Set();

        for (const team of registeredTeams) {
            if (team.category_id) categoryIds.add(team.category_id);

            if (team.channel_id) {
                try {
                    const ch = await guild.channels.fetch(team.channel_id);
                    if (ch) await ch.delete('Tournament deleted').catch(() => { });
                } catch (_) { }
            }
            if (team.voice_channel_id) {
                try {
                    const vc = await guild.channels.fetch(team.voice_channel_id);
                    if (vc) await vc.delete('Tournament deleted').catch(() => { });
                } catch (_) { }
            }

            // Unregister team and clear its tournament link
            tournaments.unregisterTeam(tournament.id, team.id);
            teamDb.setTournament(team.id, null);
        }

        // Clean up empty game categories
        for (const catId of categoryIds) {
            try {
                const cat = await guild.channels.fetch(catId);
                if (cat && cat.type === ChannelType.GuildCategory && cat.children.cache.size === 0) {
                    await cat.delete('Empty category after tournament deletion').catch(() => { });
                }
            } catch (_) { }
        }

        // Delete all matches
        const db = require('../../database/db').getDb();
        db.prepare('DELETE FROM checkins WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = ?)').run(tournament.id);
        db.prepare('DELETE FROM matches WHERE tournament_id = ?').run(tournament.id);
        db.prepare('DELETE FROM tournament_registrations WHERE tournament_id = ?').run(tournament.id);
        db.prepare('DELETE FROM tournaments WHERE id = ?').run(tournament.id);

        logOwnerAction(interaction.guild.id, interaction.user.id, 'DELETE_TOURNAMENT', code, { name: tournamentName });
        logger.info(`Tournament deleted: ${tournamentName} (${code}) by ${interaction.user.tag}`);

        await interaction.editReply({
            embeds: [successEmbed('Tournament Deleted', `**${tournamentName}** (\`${code}\`) has been permanently deleted.\n\n🗑️ All match channels, team channels, and registrations have been cleaned up.`)],
        });
    },
};
