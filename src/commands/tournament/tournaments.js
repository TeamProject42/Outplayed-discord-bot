const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { tournaments } = require('../../database/db');
const { infoEmbed, errorEmbed, tournamentEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tournaments')
        .setDescription('📋 View all active tournaments and join one'),

    async execute(interaction) {
        const guildId = interaction.guild.id;

        // Get all active tournaments (registration or active status)
        const activeTournaments = tournaments.getActive(guildId);

        if (activeTournaments.length === 0) {
            return interaction.reply({
                embeds: [infoEmbed('📋 No Active Tournaments', 'There are no active tournaments in this server right now.\n\nAsk the server owner to create one with `/createtournament`!')],
            });
        }

        // Build embeds + buttons for each tournament (max 5 due to Discord limits)
        const embeds = [];
        const rows = [];

        const displayTournaments = activeTournaments.slice(0, 5);

        for (const t of displayTournaments) {
            const regCount = tournaments.getRegistrationCount(t.id);

            const embed = tournamentEmbed(t);
            embed.addFields({ name: '📊 Registered', value: `${regCount} / ${t.max_teams} teams`, inline: true });

            if (t.status === 'registration') {
                embed.addFields({ name: '📌 Status', value: '🟢 Open for Registration', inline: true });
            } else {
                embed.addFields({ name: '📌 Status', value: '🔴 In Progress', inline: true });
            }

            embeds.push(embed);

            // Only show join buttons for tournaments still in registration
            if (t.status === 'registration' && regCount < t.max_teams) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`tourney_register_team_${t.id}`)
                        .setLabel(`🛡️ Register Team — ${t.name}`)
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`tourney_register_solo_${t.id}`)
                        .setLabel(`👤 Join Solo — ${t.name}`)
                        .setStyle(ButtonStyle.Primary),
                );
                rows.push(row);
            }
        }

        // Header text
        let header = `## 📋 Active Tournaments (${activeTournaments.length})\n`;
        if (activeTournaments.length > 5) {
            header += `*Showing 5 of ${activeTournaments.length} tournaments*\n`;
        }

        await interaction.reply({
            content: header,
            embeds,
            components: rows,
        });
    },
};
