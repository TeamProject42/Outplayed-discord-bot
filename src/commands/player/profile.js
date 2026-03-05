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
        const targetUser = interaction.options.getUser('user') || interaction.user;
        
        try {
            const player = await users.getByDiscordId(targetUser.id);

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

            // Fetch linked game profiles
            let linkedGamesCount = 0;
            // E.g., BGMI
            const bgmiProfile = await gameProfiles.get('BgmiMember', player.UUID);
            if (bgmiProfile) linkedGamesCount++;
            
            // E.g., Valorant
            const valoProfile = await gameProfiles.get('ValorantMember', player.UUID);
            if (valoProfile) linkedGamesCount++;

            // Get team history (Franchises owned)
            let ownedFranchises = [];
            if (player.Is_Owner) {
                ownedFranchises = await franchises.getByOwner(player.UUID);
            }

            // We adapt profileEmbed because it used to take my simple 'players' schema
            const embed = profileEmbed(player, targetUser);
            
            if (linkedGamesCount > 0) {
                 embed.addFields({ name: '🎮 Connected Games', value: `${linkedGamesCount} profiles`, inline: true });
            }

            // Add team history
            if (ownedFranchises.length > 0) {
                const teamList = ownedFranchises.map(t =>
                    `🛡️ **${t.Franchise_Name}**`
                ).join('\n');
                embed.addFields({ name: '📜 Owned Franchises', value: teamList });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching profile:', error);
            await interaction.reply({
                embeds: [errorEmbed('Database Error', 'Could not load the profile from the database.')],
                ephemeral: true,
            });
        }
    },
};
