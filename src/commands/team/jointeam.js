const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { users, gameProfiles, franchises } = require('../../database/supabase');
const { successEmbed, errorEmbed, teamEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jointeam')
        .setDescription('🤝 Join a team using a Franchise ID')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The Franchise UUID')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Game for this roster')
                .setRequired(true)
                .addChoices(
                    Object.keys(config.games).map(k => ({ name: config.games[k].name, value: k }))
                )
        ),

    async execute(interaction) {
        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.reply({
                    embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                    ephemeral: true,
                });
            }

            const code = interaction.options.getString('code').trim();
            const gameKey = interaction.options.getString('game');

            const franchise = await franchises.getByUUID(code);
            if (!franchise) {
                return interaction.reply({
                    embeds: [errorEmbed('Invalid Code', `No team found with Franchise ID \`${code}\`.\nDouble-check and try again.`)],
                    ephemeral: true,
                });
            }

            // Ensure player has a profile for this game
            const gameTable = getMemberTableName(gameKey);
            const userGameProfile = await gameProfiles.get(gameTable, player.UUID);

            if (!userGameProfile) {
                 return interaction.reply({
                     embeds: [errorEmbed('No Game Profile', `You must have a ${config.games[gameKey].name} profile to join this roster.`)],
                     ephemeral: true,
                 });
            }

            await interaction.deferReply({ ephemeral: true });

            // Proceed to join roster
            await franchises.joinRoster(franchise.Franchise_UUID, player.UUID, gameKey, userGameProfile.Rank);

            // Channel role granting logic (simplified to MVP scope text responses)
            // (If the guild channel architecture was fully integrated with DB maps this would go here)
            
            logger.info(`Player joined team: ${interaction.user.tag} → ${franchise.Franchise_Name} (${code})`);

            await interaction.editReply({
                embeds: [
                    successEmbed('Joined Team!', `You've successfully joined **${franchise.Franchise_Name}**'s ${config.games[gameKey].name} roster!`),
                ],
            });

        } catch (error) {
            logger.error(`Error joining team: ${error.message}`);
            
            let msg = 'Could not join the team. Check console.';
            if (error.message.includes('Roster is full')) msg = 'This roster is already full.';
            if (error.message.includes('Roster not found')) msg = 'This Franchise does not have a roster for the selected game.';
            if (error.code === '23505') msg = 'You are already in this team.'; // duplicate key value violates unique constraint

            return interaction.editReply({ embeds: [errorEmbed('Join Failed', msg)] });
        }
    },
};

function getMemberTableName(gameKey) {
    switch(gameKey) {
        case 'valo': return 'ValorantMember';
        case 'bgmi': return 'BgmiMember';
        case 'codm': return 'CODMobileMember';
        case 'mlbb': return 'MobaLegendsMember';
        default: return 'BgmiMember'; 
    }
}
