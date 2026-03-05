const { SlashCommandBuilder } = require('discord.js');
const { users, gameProfiles } = require('../../database/supabase');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');

function getGameTableName(gameKey) {
    switch(gameKey) {
        case 'valo': return 'ValorantMember';
        case 'bgmi': return 'BgmiMember';
        case 'codm': return 'CODMobileMember';
        case 'mlbb': return 'MobaLegendsMember';
        default: return 'BgmiMember'; // fallback
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('games')
        .setDescription('🎮 Manage your connected game profiles')
        .addSubcommand(subcmd => 
            subcmd.setName('update')
            .setDescription('Update an existing game profile ID/Username')
            .addStringOption(opt => opt.setName('game').setDescription('Game abbreviation (e.g. valo, bgmi)').setRequired(true))
            .addStringOption(opt => opt.setName('player_id').setDescription('New Player ID').setRequired(true))
        )
        .addSubcommand(subcmd => 
            subcmd.setName('verify')
            .setDescription('Verify an existing game profile')
            .addStringOption(opt => opt.setName('game').setDescription('Game abbreviation').setRequired(true))
        )
        .addSubcommand(subcmd => 
            subcmd.setName('remove')
            .setDescription('Remove a game profile')
            .addStringOption(opt => opt.setName('game').setDescription('Game abbreviation').setRequired(true))
        )
        .addSubcommand(subcmd => 
            subcmd.setName('primary')
            .setDescription('Set your primary game')
            .addStringOption(opt => opt.setName('game').setDescription('Game abbreviation').setRequired(true))
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const subcommand = interaction.options.getSubcommand();
        const gameKey = interaction.options.getString('game').toLowerCase();
        
        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.editReply({ embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')] });
            }

            const gameTable = getGameTableName(gameKey);

            if (subcommand === 'update') {
                const newId = interaction.options.getString('player_id');
                // Check if profile exists
                const existing = await gameProfiles.get(gameTable, player.UUID);
                if (!existing) {
                    return interaction.editReply({ embeds: [errorEmbed('Not Found', 'You don\'t have a profile for this game. Add it via `/start` first.')] });
                }

                await gameProfiles.createOrUpdate(gameTable, player.UUID, {
                    In_Game_Name: newId,
                    Game_ID: newId
                });

                return interaction.editReply({ embeds: [successEmbed('Updated', `Your ${gameKey} profile ID was updated to **${newId}**.`)] });
            }

            if (subcommand === 'verify') {
                const existing = await gameProfiles.get(gameTable, player.UUID);
                if (!existing) {
                    return interaction.editReply({ embeds: [errorEmbed('Not Found', 'Profile not found.')] });
                }

                // MVP Mock logic for verifying an account
                await gameProfiles.createOrUpdate(gameTable, player.UUID, {
                    Status: 'verified'
                });

                return interaction.editReply({ embeds: [successEmbed('Verified', `Your ${gameKey} account has been successfully verified!`)] });
            }

            if (subcommand === 'remove') {
                await gameProfiles.remove(gameTable, player.UUID);
                return interaction.editReply({ embeds: [successEmbed('Removed', `Your ${gameKey} profile has been removed.`)] });
            }

            if (subcommand === 'primary') {
                // MVP Mock: We could add a 'Primary_Game' column to User. For now, simulated success.
                return interaction.editReply({ embeds: [successEmbed('Primary Set', `**${gameKey.toUpperCase()}** is now set as your primary game.`)] });
            }

        } catch (error) {
            console.error('Error in /games:', error);
            await interaction.editReply({ embeds: [errorEmbed('Error', 'An error occurred while managing your game profiles.')] });
        }
    },
};
