const { SlashCommandBuilder } = require('discord.js');
const { users, franchises, matches } = require('../../database/supabase');
const { infoEmbed, errorEmbed, successEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('submitresult')
        .setDescription('🏆 Submit the result of your tournament match')
        .addStringOption(option =>
            option.setName('match_id')
                .setDescription('The Match ID (UUID or number) you won')
                .setRequired(true)
        )
        .addAttachmentOption(option =>
            option.setName('screenshot')
                .setDescription('Upload screenshot proof of your victory')
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

            const matchId = interaction.options.getString('match_id').trim();
            const proof = interaction.options.getAttachment('screenshot');

            const ownedFranchises = await franchises.getByOwner(player.UUID);
            if (ownedFranchises.length === 0) {
                 return interaction.editReply({
                     embeds: [errorEmbed('No Team', 'You must own a team to submit match results.')],
                 });
            }

            // Assume the user is reporting their active franchise won.
            const activeFranchise = ownedFranchises[0];

            await matches.updateWinner(matchId, activeFranchise.Franchise_UUID);

            const embed = successEmbed('Submitted', `**Match ${matchId}** reported as Won by **${activeFranchise.Franchise_Name}**.`);
            if (proof) {
                embed.setImage(proof.url);
                embed.addFields({ name: '📸 Proof Uploaded', value: 'Attached successfully.' });
            }

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('Error submitting result:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Could not submit your match result. Ensure the Match ID is correct.')],
            });
        }
    },
};
