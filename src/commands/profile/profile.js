const {
    SlashCommandBuilder,
    MessageFlags,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { errorEmbed, profileEmbed } = require('../../utils/embeds');
const { getGame, getGameKeys } = require('../../utils/gameConstants');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View a player profile')
        .addStringOption(opt =>
            opt.setName('username')
                .setDescription('Search by Outplayed username')
                .setRequired(false))
        .addUserOption(opt =>
            opt.setName('discordname')
                .setDescription('Search by Discord @mention')
                .setRequired(false)),

    async execute(interaction) {
        try {
            return await handleView(interaction);
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};

async function handleView(interaction) {
    const targetUsername = interaction.options.getString('username');
    const targetDiscordUser = interaction.options.getUser('discordname');
    const discordId = targetDiscordUser ? targetDiscordUser.id : interaction.user.id;

    try {
        await interaction.deferReply({ flags: targetUsername ? [] : [MessageFlags.Ephemeral] });
    } catch (err) {
        logger.warn('Interaction expired before deferReply in /profile view');
        return;
    }

    let query = supabase.from('User').select('*');

    if (targetUsername) {
        query = query.ilike('Username', targetUsername);
    } else {
        query = query.eq('Discord_ID', discordId);
    }

    const { data: user, error } = await query.single();

    if (error || !user) {
        return interaction.editReply({
            embeds: [errorEmbed(TITLES.NOT_FOUND, targetUsername
                ? `Player with username **${targetUsername}** hasn't registered on Outplayed.`
                : (targetDiscordUser
                    ? `${targetDiscordUser.tag} hasn't registered on Outplayed.`
                    : ERRORS.NOT_REGISTERED))],
        });
    }

    // Fetch game profiles
    const gameProfiles = [];
    for (const gameKey of getGameKeys()) {
        const game = getGame(gameKey);
        const { data: member } = await supabase
            .from(game.memberTable)
            .select('In_Game_Name, Game_ID, Role, Rank, Status')
            .eq('User_UUID', user.UUID)
            .single();

        if (member) {
            gameProfiles.push({
                game: `${game.emoji} ${game.name}`,
                ign: member.In_Game_Name,
                gameId: member.Game_ID,
                role: member.Role || 'N/A',
                rank: member.Rank || 'N/A',
                status: member.Status || 'N/A',
            });
        }
    }

    // Fetch franchise/team info
    let teamInfo = null;
    if (user.In_Team) {
        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_Name, Franchise_UUID')
            .eq('Owner_ID', user.UUID)
            .single();

        if (franchise) {
            teamInfo = franchise;
        }
    }

    const embed = profileEmbed(user, gameProfiles);

    if (teamInfo) {
        embed.addFields({ name: '🏠 Team', value: `**${teamInfo.Franchise_Name}** (Owner)`, inline: true });
    }

    // Fetch tournament participation count
    const { count: tournamentCount } = await supabase
        .from('User_Tournament_Participation')
        .select('*', { count: 'exact', head: true })
        .eq('User_UUID', user.UUID);

    embed.addFields({ name: '🏆 Tournaments', value: `${tournamentCount || 0} participated`, inline: true });

    return interaction.editReply({ embeds: [embed] });
}
