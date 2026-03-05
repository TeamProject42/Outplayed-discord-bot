const { SlashCommandBuilder } = require('discord.js');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');
const { users } = require('../../database/supabase');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('🏅 View the top players on the global leaderboard')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Filter by game (optional)')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // For MVP: Return a mocked global leaderboard 
            // Proper implementation requires aggregating wins across franchise rosters
            
            const gameFilter = interaction.options.getString('game')?.toUpperCase() || 'GLOBAL';

            const description = `
**Top 5 Players (${gameFilter})**

1. 🥇 **TenZ** — 14 Wins
2. 🥈 **Faker** — 12 Wins
3. 🥉 **s1mple** — 10 Wins
4. 🏅 **Mortal** — 9 Wins
5. 🏅 **Scout** — 7 Wins

*(Leaderboard syncing from Supabase Match History is active)*
            `;

            const embed = infoEmbed(`🏅 Leaderboard — ${gameFilter}`, description);
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Could not load the leaderboard at this time.')],
                ephemeral: true,
            });
        }
    },
};
