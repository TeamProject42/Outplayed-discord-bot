const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, profileEmbed } = require('../../utils/embeds');
const { getGame, getGameKeys } = require('../../utils/gameConstants');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View or edit your player profile')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View a player profile')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('The user to view (defaults to you)')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('edit')
                .setDescription('Edit your profile')
                .addStringOption(opt =>
                    opt.setName('field')
                        .setDescription('Which field to edit')
                        .setRequired(true)
                        .addChoices(
                            { name: '📝 Display Name', value: 'name' },
                            { name: '🌍 Region', value: 'region' },
                            { name: '🏳️ Country', value: 'country' },
                            { name: '📧 Email', value: 'email' },
                            { name: '🏫 Institute', value: 'institute' },
                        ))),

    async execute(interaction) {
        let sub;
        try {
            sub = interaction.options.getSubcommand();
        } catch {
            sub = 'view'; // Default to view if no subcommand (cached old command)
        }

        if (sub === 'view') {
            return handleView(interaction);
        } else if (sub === 'edit') {
            return handleEdit(interaction);
        }
    },
};

async function handleView(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const discordId = targetUser.id;

    await interaction.deferReply();

    // Fetch user from Supabase (Discord ID stored in PWA_Notification_Subscription)
    const { data: user, error } = await supabase
        .from('User')
        .select('*')
        .eq('PWA_Notification_Subscription', discordId)
        .single();

    if (error || !user) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Found', targetUser.id === interaction.user.id
                ? 'You haven\'t registered yet. Run `/start` first.'
                : `${targetUser.tag} hasn't registered on Outplayed.`)],
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

async function handleEdit(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    const field = interaction.options.getString('field');

    const fieldLabels = {
        name: 'Display Name',
        region: 'Region',
        country: 'Country',
        email: 'Email',
        institute: 'Institute',
    };

    const dbColumns = {
        name: 'Name',
        region: 'Region',
        country: 'Country',
        email: 'Email',
        institute: 'Institute',
    };

    const modal = new ModalBuilder()
        .setCustomId(`profile_edit_modal_${field}`)
        .setTitle(`Edit ${fieldLabels[field]}`);

    const input = new TextInputBuilder()
        .setCustomId('edit_value')
        .setLabel(`New ${fieldLabels[field]}`)
        .setPlaceholder(`Enter your new ${fieldLabels[field].toLowerCase()}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100);

    if (user[dbColumns[field]]) {
        input.setValue(user[dbColumns[field]]);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
}

/**
 * Handle profile edit modal submission.
 */
async function handleProfileEditModal(interaction) {
    const field = interaction.customId.replace('profile_edit_modal_', '');
    const newValue = interaction.fields.getTextInputValue('edit_value');
    const discordId = interaction.user.id;

    const dbColumns = {
        name: 'Name',
        region: 'Region',
        country: 'Country',
        email: 'Email',
        institute: 'Institute',
    };

    await interaction.deferReply({ ephemeral: true });

    const { error } = await supabase
        .from('User')
        .update({
            [dbColumns[field]]: newValue,
            Updated_At: new Date().toISOString(),
        })
        .eq('PWA_Notification_Subscription', discordId);

    if (error) {
        logger.error('Profile edit error:', error);
        return interaction.editReply({
            embeds: [errorEmbed('Update Failed', `Could not update your ${field}: ${error.message}`)],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed('Profile Updated', `Your **${field}** has been updated to: **${newValue}**`)],
    });
}

module.exports.handleProfileEditModal = handleProfileEditModal;
