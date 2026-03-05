const { SlashCommandBuilder } = require('discord.js');
const { users } = require('../../database/supabase');
const { successEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setbio')
        .setDescription('📝 Write a short bio for your player profile')
        .addStringOption(option =>
            option.setName('bio')
                .setDescription('A short description about yourself')
                .setRequired(true)
                .setMaxLength(250)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const bioText = interaction.options.getString('bio').trim();

        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.editReply({
                    embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                });
            }

            // Update user bio in Supabase. 
            // Note: If Bio column does not exist in schema, this might fail unless added.
            await users.createOrUpdate(interaction.user.id, {
                Bio: bioText
            });

            await interaction.editReply({
                embeds: [successEmbed('Bio Updated', `Your bio has been updated to:\n\n*${bioText}*`)],
            });

        } catch (error) {
            console.error('Error updating bio:', error);
            
            // Handle specific Supabase error if column doesn't exist
            if (error.code === 'PGRST204' || error.message.includes('column "Bio" of relation')) {
                 return interaction.editReply({
                    embeds: [errorEmbed('Database Missing Column', 'The `Bio` column has not been added to your Supabase `User` table yet.')],
                });
            }
            
            await interaction.editReply({
                embeds: [errorEmbed('Update Failed', 'Could not save your bio.')],
            });
        }
    },
};
