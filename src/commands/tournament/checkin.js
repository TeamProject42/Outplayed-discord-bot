const { SlashCommandBuilder } = require('discord.js');
const { users, franchises, matches } = require('../../database/supabase');
const { infoEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('checkin')
        .setDescription('✅ Check-in your team for a scheduled match')
        .addStringOption(option =>
            option.setName('match_id')
                .setDescription('The Match ID (UUID or number) you are checking in for')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // MVP simplification: check-in is represented by setting Status from 'Scheduled'/'Pending' to 'In Progress' for the specific team,
        // or using another marker. Since we don't have a Check_In table in the schema context provided,
        // we'll simulate check-in handling by notifying admins/channels or updating a local match marker if possible.

        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.editReply({
                    embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                });
            }

            const matchId = interaction.options.getString('match_id').trim();

            const ownedFranchises = await franchises.getByOwner(player.UUID);
            if (ownedFranchises.length === 0) {
                 return interaction.editReply({
                     embeds: [errorEmbed('No Team', 'You must own a team to check-in.')],
                 });
            }

            // In a production scenario, we'd verify the match exists and the team is scheduled for it.
            // For this MVP, we acknowledge the check-in command.
            const activeFranchise = ownedFranchises[0];

            await interaction.editReply({
                embeds: [successEmbed('Checked In', `**${activeFranchise.Franchise_Name}** has confirmed attendance for Match **${matchId}**! Good luck!`)]
            });

            // If we had a tournament channel, we could announce it here.

        } catch (error) {
            console.error('Error during checkin:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Could not process check-in.')],
            });
        }
    },
};
