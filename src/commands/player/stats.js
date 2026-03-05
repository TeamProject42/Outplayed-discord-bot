const { SlashCommandBuilder } = require('discord.js');
const { users, franchises, matches } = require('../../database/supabase');
const { infoEmbed, errorEmbed, matchEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('📊 View your Match Stats and History')
        .addStringOption(option =>
            option.setName('tournament')
                .setDescription('Filter stats by Tournament ID (Optional)')
                .setRequired(false)
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

            const ownedFranchises = await franchises.getByOwner(player.UUID);
            if (ownedFranchises.length === 0) {
                 return interaction.editReply({
                     embeds: [infoEmbed('No Stats', 'You must be part of a team that has played matches to see stats.')],
                 });
            }

            const activeFranchise = ownedFranchises[0];
            const filterTournament = interaction.options.getString('tournament')?.trim();

            let allMatches = [];
            
            // MVP Simplification: If a tournament ID is provided, query it. Otherwise we'd need a broader history query.
            if (filterTournament) {
                const tournamentMatches = await matches.getByTournament(filterTournament);
                allMatches = tournamentMatches.filter(m => 
                    m.Team_1_ID === activeFranchise.Franchise_UUID || 
                    m.Team_2_ID === activeFranchise.Franchise_UUID
                );
            } else {
                 return interaction.editReply({
                     embeds: [infoEmbed('WIP', 'Global match history is still in progress. Please provide a `tournament` ID to view your stats for a specific event.')]
                 });
            }

            const completedMatches = allMatches.filter(m => m.Status === 'Completed');
            
            const wins = completedMatches.filter(m => m.Winner_ID === activeFranchise.Franchise_UUID).length;
            const losses = completedMatches.length - wins;

            let historyText = completedMatches.length > 0 ? '' : 'No completed matches found.';
            
            completedMatches.slice(0, 5).forEach((m, idx) => {
                const isWin = m.Winner_ID === activeFranchise.Franchise_UUID;
                historyText += `${idx + 1}. Match ${m.Match_ID} - ${isWin ? '✅ **WIN**' : '❌ **LOSS**'}\n`;
            });

            const embed = infoEmbed(`Stats for ${activeFranchise.Franchise_Name}`, `**Wins**: ${wins}\n**Losses**: ${losses}\n\n**Recent Match History:**\n${historyText}`);

            await interaction.editReply({
                embeds: [embed],
            });

        } catch (error) {
            console.error('Error fetching stats:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Could not load your stats.')],
            });
        }
    },
};
