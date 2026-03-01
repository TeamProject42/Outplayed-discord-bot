const { SlashCommandBuilder } = require('discord.js');
const { players, teams } = require('../../database/db');
const { profileEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('🎮 View your player profile or another player\'s profile')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The player to view (leave empty for yourself)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const player = players.get(targetUser.id);

        if (!player) {
            const isOther = targetUser.id !== interaction.user.id;
            return interaction.reply({
                embeds: [errorEmbed(
                    'No Profile Found',
                    isOther
                        ? `**${targetUser.displayName}** hasn't created a profile yet.`
                        : 'You don\'t have a profile yet! Use `/start` to create one.',
                )],
                ephemeral: true,
            });
        }

        // Get team history
        const playerTeams = teams.getByPlayer(targetUser.id);
        const embed = profileEmbed(player, targetUser);

        // Add team history
        if (playerTeams.length > 0) {
            const teamList = playerTeams.map(t =>
                `🛡️ **${t.name}** (${t.locked ? 'Locked' : 'Open'}) — Code: \`${t.code}\``
            ).join('\n');
            embed.addFields({ name: '📜 Team History', value: teamList });
        }

        // Add tournaments played count
        const totalTournaments = playerTeams.filter(t => t.tournament_id).length;
        embed.spliceFields(5, 0, { name: '🏟️ Tournaments', value: `${totalTournaments}`, inline: true });

        await interaction.reply({ embeds: [embed] });
    },
};
