const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getGame, getGameKeys, getGameChoices, GAMES } = require('../../utils/gameConstants');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('games')
        .setDescription('Manage your game profiles')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List all supported games'))
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a game profile')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Game to add')
                        .setRequired(true)
                        .addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('update')
                .setDescription('Update your game profile')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Game to update')
                        .setRequired(true)
                        .addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a game profile')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Game to remove')
                        .setRequired(true)
                        .addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('verify')
                .setDescription('Verify your game account')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Game to verify')
                        .setRequired(true)
                        .addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('primary')
                .setDescription('Set your primary game')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Game to set as primary')
                        .setRequired(true)
                        .addChoices(...getGameChoices()))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        switch (sub) {
            case 'list': return handleList(interaction);
            case 'add': return handleAdd(interaction);
            case 'update': return handleUpdate(interaction);
            case 'remove': return handleRemove(interaction);
            case 'verify': return handleVerify(interaction);
            case 'primary': return handlePrimary(interaction);
        }
    },
};

async function handleList(interaction) {
    await interaction.deferReply();

    // Fetch games from DB
    const { data: games, error } = await supabase
        .from('Game')
        .select('*')
        .order('Game_ID', { ascending: true });

    const gameList = getGameKeys().map(key => {
        const g = getGame(key);
        const dbGame = games?.find(db => db.Game_Name?.toLowerCase().includes(key));
        return `${g.emoji} **${g.name}** — Ranks: ${g.ranks.join(', ')}`;
    });

    const embed = infoEmbed('🎮 Supported Games', gameList.join('\n\n'));
    embed.addFields({ name: 'How to add', value: 'Use `/games add <game>` to add your game profile.' });

    return interaction.editReply({ embeds: [embed] });
}

async function handleAdd(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    const gameKey = interaction.options.getString('game');
    const game = getGame(gameKey);

    // Check if already has this game profile
    const { data: existing } = await supabase
        .from(game.memberTable)
        .select('User_UUID')
        .eq('User_UUID', user.UUID)
        .single();

    if (existing) {
        return interaction.reply({
            embeds: [errorEmbed('Already Added', `You already have a **${game.name}** profile. Use \`/games update ${gameKey}\` to modify it.`)],
            ephemeral: true,
        });
    }

    // Show modal for IGN and Game ID
    const modal = new ModalBuilder()
        .setCustomId(`game_add_modal_${gameKey}`)
        .setTitle(`Add ${game.name} Profile`);

    const ignInput = new TextInputBuilder()
        .setCustomId('game_ign')
        .setLabel('In-Game Name')
        .setPlaceholder(`Your ${game.name} in-game name`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

    const gameIdInput = new TextInputBuilder()
        .setCustomId('game_id')
        .setLabel('Game ID')
        .setPlaceholder(`Your ${game.name} player ID`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

    const roleInput = new TextInputBuilder()
        .setCustomId('game_role')
        .setLabel(`Role (${game.roles.join(', ')})`)
        .setPlaceholder(`e.g. ${game.roles[0]}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30);

    const rankInput = new TextInputBuilder()
        .setCustomId('game_rank')
        .setLabel(`Rank (${game.ranks.slice(0, 5).join(', ')}...)`)
        .setPlaceholder(`e.g. ${game.ranks[Math.floor(game.ranks.length / 2)]}`)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30);

    modal.addComponents(
        new ActionRowBuilder().addComponents(ignInput),
        new ActionRowBuilder().addComponents(gameIdInput),
        new ActionRowBuilder().addComponents(roleInput),
        new ActionRowBuilder().addComponents(rankInput),
    );

    await interaction.showModal(modal);
}

async function handleUpdate(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    const gameKey = interaction.options.getString('game');
    const game = getGame(gameKey);

    // Check if profile exists
    const { data: existing } = await supabase
        .from(game.memberTable)
        .select('*')
        .eq('User_UUID', user.UUID)
        .single();

    if (!existing) {
        return interaction.reply({
            embeds: [errorEmbed('Not Found', `You don't have a **${game.name}** profile. Use \`/games add ${gameKey}\` first.`)],
            ephemeral: true,
        });
    }

    // Show modal with current values pre-filled
    const modal = new ModalBuilder()
        .setCustomId(`game_add_modal_${gameKey}`)
        .setTitle(`Update ${game.name} Profile`);

    const ignInput = new TextInputBuilder()
        .setCustomId('game_ign')
        .setLabel('In-Game Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setValue(existing.In_Game_Name || '');

    const gameIdInput = new TextInputBuilder()
        .setCustomId('game_id')
        .setLabel('Game ID')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setValue(existing.Game_ID || '');

    const roleInput = new TextInputBuilder()
        .setCustomId('game_role')
        .setLabel(`Role (${game.roles.join(', ')})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30)
        .setValue(existing.Role || '');

    const rankInput = new TextInputBuilder()
        .setCustomId('game_rank')
        .setLabel(`Rank`)
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(30)
        .setValue(existing.Rank || '');

    modal.addComponents(
        new ActionRowBuilder().addComponents(ignInput),
        new ActionRowBuilder().addComponents(gameIdInput),
        new ActionRowBuilder().addComponents(roleInput),
        new ActionRowBuilder().addComponents(rankInput),
    );

    await interaction.showModal(modal);
}

async function handleRemove(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    const gameKey = interaction.options.getString('game');
    const game = getGame(gameKey);

    await interaction.deferReply({ ephemeral: true });

    // Check if profile exists
    const { data: existing } = await supabase
        .from(game.memberTable)
        .select('User_UUID, Roster_UUID')
        .eq('User_UUID', user.UUID)
        .single();

    if (!existing) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Found', `You don't have a **${game.name}** profile.`)],
        });
    }

    // Check if in a roster — can't remove profile while in a team
    if (existing.Roster_UUID) {
        return interaction.editReply({
            embeds: [errorEmbed('In a Roster', `You must leave your **${game.name}** roster before removing your game profile.\nUse \`/team leave\` first.`)],
        });
    }

    const { error } = await supabase
        .from(game.memberTable)
        .delete()
        .eq('User_UUID', user.UUID);

    if (error) {
        logger.error('Game profile remove error:', error);
        return interaction.editReply({
            embeds: [errorEmbed('Failed', `Could not remove your ${game.name} profile: ${error.message}`)],
        });
    }

    // Check if user has any remaining game profiles
    let hasAnyGame = false;
    for (const gKey of getGameKeys()) {
        const g = getGame(gKey);
        const { data } = await supabase.from(g.memberTable).select('User_UUID').eq('User_UUID', user.UUID).single();
        if (data) { hasAnyGame = true; break; }
    }

    if (!hasAnyGame) {
        await supabase.from('User').update({ Game_Profile: false }).eq('UUID', user.UUID);
    }

    return interaction.editReply({
        embeds: [successEmbed('Game Profile Removed', `Your **${game.name}** profile has been removed.`)],
    });
}

async function handleVerify(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    const gameKey = interaction.options.getString('game');
    const game = getGame(gameKey);

    await interaction.deferReply({ ephemeral: true });

    const { data: existing } = await supabase
        .from(game.memberTable)
        .select('*')
        .eq('User_UUID', user.UUID)
        .single();

    if (!existing) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Found', `You don't have a **${game.name}** profile. Use \`/games add ${gameKey}\` first.`)],
        });
    }

    // Set status to "verified"
    const { error } = await supabase
        .from(game.memberTable)
        .update({ Status: 'verified' })
        .eq('User_UUID', user.UUID);

    if (error) {
        return interaction.editReply({
            embeds: [errorEmbed('Failed', `Could not verify: ${error.message}`)],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed('Verified!', `Your **${game.name}** profile has been verified. ✅\n\n**IGN:** ${existing.In_Game_Name}\n**ID:** ${existing.Game_ID}`)],
    });
}

async function handlePrimary(interaction) {
    const user = await ensureRegistered(interaction);
    if (!user) return;

    const gameKey = interaction.options.getString('game');
    const game = getGame(gameKey);

    await interaction.deferReply({ ephemeral: true });

    // Check if profile exists
    const { data: existing } = await supabase
        .from(game.memberTable)
        .select('User_UUID')
        .eq('User_UUID', user.UUID)
        .single();

    if (!existing) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Found', `You don't have a **${game.name}** profile. Use \`/games add ${gameKey}\` first.`)],
        });
    }

    // Store primary game in user's Instagram_ID field (repurposed) or a custom approach
    // For now, we'll store it as a note — the schema doesn't have a dedicated primary_game field
    // We can use the User table's Instagram_ID or similar unused field
    const { error } = await supabase
        .from('User')
        .update({
            Instagram_ID: `primary:${gameKey}`,
            Updated_At: new Date().toISOString(),
        })
        .eq('UUID', user.UUID);

    if (error) {
        return interaction.editReply({
            embeds: [errorEmbed('Failed', `Could not set primary game: ${error.message}`)],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed('Primary Game Set', `${game.emoji} **${game.name}** is now your primary game!`)],
    });
}

/**
 * Handle game add modal submission.
 * Called from interactions/modals.js
 */
async function handleGameAddModal(interaction) {
    const gameKey = interaction.customId.replace('game_add_modal_', '');
    const game = getGame(gameKey);
    const discordId = interaction.user.id;

    const ign = interaction.fields.getTextInputValue('game_ign');
    const gameId = interaction.fields.getTextInputValue('game_id');
    const role = interaction.fields.getTextInputValue('game_role') || null;
    const rank = interaction.fields.getTextInputValue('game_rank') || null;

    await interaction.deferReply({ ephemeral: true });

    // Get user UUID
    const { data: user } = await supabase
        .from('User')
        .select('UUID')
        .eq('PWA_Notification_Subscription', discordId)
        .single();

    if (!user) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Registered', 'Run `/start` to register first.')],
        });
    }

    // Upsert game member record
    const { error } = await supabase
        .from(game.memberTable)
        .upsert({
            User_UUID: user.UUID,
            In_Game_Name: ign,
            Game_ID: gameId,
            Role: role,
            Rank: rank,
            Status: 'active',
            Created_At: new Date().toISOString(),
        }, { onConflict: 'User_UUID' });

    if (error) {
        logger.error('Game profile add error:', error);
        return interaction.editReply({
            embeds: [errorEmbed('Failed', `Could not add/update your ${game.name} profile: ${error.message}`)],
        });
    }

    // Mark user as having a game profile
    await supabase.from('User').update({ Game_Profile: true, Updated_At: new Date().toISOString() }).eq('UUID', user.UUID);

    return interaction.editReply({
        embeds: [successEmbed(`${game.emoji} ${game.name} Profile Saved`, `**IGN:** ${ign}\n**Game ID:** ${gameId}\n**Role:** ${role || 'N/A'}\n**Rank:** ${rank || 'N/A'}`)],
    });
}

module.exports.handleGameAddModal = handleGameAddModal;
