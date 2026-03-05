const { SlashCommandBuilder } = require('discord.js');
const { users, gameProfiles, franchises } = require('../../database/supabase');
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
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        try {
            const player = await users.getByDiscordId(targetUser.id);

            if (!player) {
                const isOther = targetUser.id !== interaction.user.id;
                return interaction.editReply({
                    embeds: [errorEmbed(
                        'No Profile Found',
                        isOther
                            ? `**${targetUser.displayName}** hasn't created a profile yet.`
                            : 'You don\'t have a profile yet! Use `/start` to create one.',
                    )],
                });
            }

            let linkedGamesCount = 0;
            const bgmiProfile = await gameProfiles.get('BgmiMember', player.UUID);
            if (bgmiProfile) linkedGamesCount++;
            
            const valoProfile = await gameProfiles.get('ValorantMember', player.UUID);
            if (valoProfile) linkedGamesCount++;

            let ownedFranchises = [];
            if (player.Is_Owner) {
                ownedFranchises = await franchises.getByOwner(player.UUID);
            }

            const embed = profileEmbed(player, targetUser);
            
            if (linkedGamesCount > 0) {
                 embed.addFields({ name: '🎮 Connected Games', value: `${linkedGamesCount} profiles`, inline: true });
            }

            if (ownedFranchises.length > 0) {
                const teamList = ownedFranchises.map(t =>
                    `🛡️ **${t.Franchise_Name}**`
                ).join('\n');
                embed.addFields({ name: '📜 Owned Franchises', value: teamList });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching profile:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Database Error', 'Could not load the profile from the database.')],
            });
        }
    },
};
