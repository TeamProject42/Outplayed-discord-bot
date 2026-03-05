const { SlashCommandBuilder } = require('discord.js');
const { users, franchises, matches } = require('../../database/supabase');
const { infoEmbed, errorEmbed, matchEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('matches')
        .setDescription('⚔️ View your upcoming tournament matches')
        .addStringOption(option =>
            option.setName('tournament')
                .setDescription('The Tournament ID')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.editReply({
                    embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                });
            }

            const tournamentId = interaction.options.getString('tournament').trim();

            const ownedFranchises = await franchises.getByOwner(player.UUID);
            if (ownedFranchises.length === 0) {
                 return interaction.editReply({
                     embeds: [errorEmbed('No Team', 'You must own a team to view match schedules for now.')],
                 });
            }

            // Simplification: checking matches for the first owned franchise.
            const activeFranchise = ownedFranchises[0];

            const tournamentMatches = await matches.getByTournament(tournamentId);

            if (!tournamentMatches || tournamentMatches.length === 0) {
                return interaction.editReply({
                    embeds: [infoEmbed('No Matches', 'There are no generated matches for this tournament yet.')]
                });
            }

            const myMatches = tournamentMatches.filter(m => 
                m.Team_1_ID === activeFranchise.Franchise_UUID || 
                m.Team_2_ID === activeFranchise.Franchise_UUID
            );

            if (myMatches.length === 0) {
                return interaction.editReply({
                    embeds: [infoEmbed('No Matches', 'You have no scheduled matches in this tournament.')]
                });
            }

            const embeds = [];

            for (const match of myMatches) {
                 // For MVP display, we mock the team names since we don't eager-load franchise data in this step.
                 // In a full implementation, we'd query the team names from the Franchise_UUIDs.
                 const team1Mock = { name: match.Team_1_ID === activeFranchise.Franchise_UUID ? activeFranchise.Franchise_Name : 'Opponent' };
                 const team2Mock = { name: match.Team_2_ID === activeFranchise.Franchise_UUID ? activeFranchise.Franchise_Name : 'Opponent' };

                 embeds.push(matchEmbed({
                     status: match.Status || 'Scheduled',
                     match_number: match.Match_Number
                 }, team1Mock, team2Mock, match.Round));
            }

            await interaction.editReply({
                content: `## ⚔️ Your Matches for ${tournamentId}`,
                embeds: embeds.slice(0, 10) // Discord max embed limit
            });

        } catch (error) {
            console.error('Error fetching matches:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Could not load your match schedule.')],
            });
        }
    },
};
