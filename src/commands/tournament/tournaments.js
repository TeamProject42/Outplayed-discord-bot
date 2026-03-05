const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { tournaments } = require('../../database/supabase');
const { infoEmbed, errorEmbed, tournamentEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tournaments')
        .setDescription('📋 View all active tournaments and join one')
        .addStringOption(opt => opt.setName('game').setDescription('Filter by game abbreviation (optional)')),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const gameFilter = interaction.options.getString('game')?.toLowerCase();

            // Get all active tournaments (registration or active status)
            let activeTournaments = await tournaments.getActive();

            if (gameFilter) {
                activeTournaments = activeTournaments.filter(t => t.Game_ID?.toLowerCase() === gameFilter);
            }

            if (!activeTournaments || activeTournaments.length === 0) {
                return interaction.editReply({
                    embeds: [infoEmbed('📋 No Active Tournaments', gameFilter ? `There are no active tournaments for **${gameFilter}** right now.` : 'There are no active tournaments in this server right now.')],
                });
            }

            // Build embeds + buttons for each tournament (max 5 due to Discord limits)
            const embeds = [];
            const rows = [];

            const displayTournaments = activeTournaments.slice(0, 5);

            for (const t of displayTournaments) {
                const embed = tournamentEmbed(t);

                if (t.Status === 'registration' || t.Status?.toLowerCase() === 'upcoming') {
                    embed.addFields({ name: '📌 Status', value: '🟢 Open for Registration', inline: true });
                } else {
                    embed.addFields({ name: '📌 Status', value: '🔴 In Progress', inline: true });
                }

                embeds.push(embed);

                // Only show join buttons for open tournaments
                if (t.Status === 'registration' || t.Status?.toLowerCase() === 'upcoming') {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`tourney_register_${t.Tournament_UUID}`)
                            .setLabel(`🛡️ Register — ${t.Name}`)
                            .setStyle(ButtonStyle.Success)
                    );
                    rows.push(row);
                }
            }

            // Header text
            let header = `## 📋 Active Tournaments (${activeTournaments.length})\n`;
            if (activeTournaments.length > 5) {
                header += `*Showing 5 of ${activeTournaments.length} tournaments*\n`;
            }

            await interaction.editReply({
                content: header,
                embeds,
                components: rows,
            });

        } catch (error) {
            console.error('Error fetching tournaments:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Database Error', 'Could not load tournaments.')]
            });
        }
    },
};
