const { SlashCommandBuilder } = require('discord.js');
const { users, franchises } = require('../../database/supabase');
const { errorEmbed, teamEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('myteam')
        .setDescription('🛡️ View your current team roster and franchise details'),

    async execute(interaction) {
        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.reply({
                    embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                    ephemeral: true,
                });
            }

            // A user can own franchises, or be part of rosters. 
            // Finding their active team: we'd need to check the roster tables for their UUID.
            // Since this is MVP, let's first check if they own a franchise.
            const ownedFranchises = await franchises.getByOwner(player.UUID);

            if (ownedFranchises.length === 0) {
                 return interaction.reply({
                     embeds: [errorEmbed('No Team', 'You are not the owner of any Franchise. Use `/profile` to view other details.')],
                     ephemeral: true,
                 });
            }

            const activeFranchise = ownedFranchises[0];

            // In a full implementation, we'd query all game rosters here.
            // For the MVP UI, we'll format a basic embed showing the Franchise ID.
            
            // Reusing teamEmbed style with modified shape
            const mockTeamObj = {
                name: activeFranchise.Franchise_Name,
                code: activeFranchise.Franchise_UUID,
                size: 5, // Default placeholder
                current_size: 1, // Default placeholder MVP
                locked: false
            };

            const mockMembers = [
                { discord_id: interaction.user.id, rank: 'Owner' }
            ];

            await interaction.reply({
                embeds: [teamEmbed(mockTeamObj, mockMembers)],
                ephemeral: true
            });

        } catch (error) {
            console.error('Error fetching team:', error);
            await interaction.reply({
                embeds: [errorEmbed('Error', 'Could not load your team information.')],
                ephemeral: true,
            });
        }
    },
};
