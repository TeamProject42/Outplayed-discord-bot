const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getGame, getGameKeys, getGameChoices, GAMES } = require('../../utils/gameConstants');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
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
        try {
            const sub = interaction.options.getSubcommand();

            switch (sub) {
                case 'list': return await handleList(interaction);
                case 'add': return await handleAdd(interaction);
                case 'update': return await handleUpdate(interaction);
                case 'remove': return await handleRemove(interaction);
                case 'verify': return await handleVerify(interaction);
                case 'primary': return await handlePrimary(interaction);
            }
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};

async function handleList(interaction) {
    try {
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

        const embed = infoEmbed(`🎮 Supported ${TITLES.GAMES}`, gameList.join('\n\n'));
        embed.addFields({ name: 'How to add', value: 'Use `/games add <game>` to add your game profile.' });

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleAdd(interaction) {
    try {
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
                embeds: [errorEmbed(TITLES.ERROR, `You already have a **${game.name}** profile. Use \`/games update ${gameKey}\` to modify it.`)],
                flags: [MessageFlags.Ephemeral],
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
            .setLabel('Role')
            .setPlaceholder(`e.g. ${game.roles[0]}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(30);

        const rankInput = new TextInputBuilder()
            .setCustomId('game_rank')
            .setLabel('Rank')
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
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleUpdate(interaction) {
    try {
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
                embeds: [errorEmbed(TITLES.NOT_FOUND, `You don't have a **${game.name}** profile. Use \`/games add ${gameKey}\` first.`)],
                flags: [MessageFlags.Ephemeral],
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
            .setLabel('Role')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(30)
            .setValue(existing.Role || '');

        const rankInput = new TextInputBuilder()
            .setCustomId('game_rank')
            .setLabel('Rank')
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
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleRemove(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Check if profile exists
        const { data: existing } = await supabase
            .from(game.memberTable)
            .select('User_UUID, Roster_UUID')
            .eq('User_UUID', user.UUID)
            .single();

        if (!existing) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `You don't have a **${game.name}** profile.`)],
            });
        }

        // Check if in a roster — can't remove profile while in a team
        if (existing.Roster_UUID) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `You must leave your **${game.name}** roster before removing your game profile.\nUse \`/team leave\` first.`)],
            });
        }

        const { error } = await supabase
            .from(game.memberTable)
            .delete()
            .eq('User_UUID', user.UUID);

        if (error) {
            throw error;
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
            embeds: [successEmbed(TITLES.SUCCESS, `Your **${game.name}** profile has been removed.`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleVerify(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { data: existing } = await supabase
            .from(game.memberTable)
            .select('*')
            .eq('User_UUID', user.UUID)
            .single();

        if (!existing) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `You don't have a **${game.name}** profile. Use \`/games add ${gameKey}\` first.`)],
            });
        }

        // Set status to "verified"
        const { error } = await supabase
            .from(game.memberTable)
            .update({ Status: 'verified' })
            .eq('User_UUID', user.UUID);

        if (error) {
            throw error;
        }

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `Your **${game.name}** profile has been verified. ✅\n\n**IGN:** ${existing.In_Game_Name}\n**ID:** ${existing.Game_ID}`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handlePrimary(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Check if profile exists
        const { data: existing } = await supabase
            .from(game.memberTable)
            .select('User_UUID')
            .eq('User_UUID', user.UUID)
            .single();

        if (!existing) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `You don't have a **${game.name}** profile. Use \`/games add ${gameKey}\` first.`)],
            });
        }

        const { error } = await supabase
            .from('User')
            .update({
                Instagram_ID: `primary:${gameKey}`,
                Updated_At: new Date().toISOString(),
            })
            .eq('UUID', user.UUID);

        if (error) {
            throw error;
        }

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `${game.emoji} **${game.name}** is now your primary game!`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

/**
 * Handle game add modal submission.
 * Called from interactions/modals.js
 */
async function handleGameAddModal(interaction) {
    try {
        const gameKey = interaction.customId.replace('game_add_modal_', '');
        const game = getGame(gameKey);
        const discordId = interaction.user.id;

        const ign = interaction.fields.getTextInputValue('game_ign');
        const gameId = interaction.fields.getTextInputValue('game_id');
        const role = interaction.fields.getTextInputValue('game_role') || null;
        const rank = interaction.fields.getTextInputValue('game_rank') || null;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        // Get user UUID
        const { data: user } = await supabase
            .from('User')
            .select('UUID')
            .eq('Discord_ID', discordId)
            .single();

        if (!user) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, ERRORS.NOT_REGISTERED)],
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
            throw error;
        }

        // Mark user as having a game profile
        await supabase.from('User').update({ Game_Profile: true, Updated_At: new Date().toISOString() }).eq('UUID', user.UUID);

        return interaction.editReply({
            embeds: [successEmbed(`${game.emoji} ${game.name} Profile Saved`, `**IGN:** ${ign}\n**Game ID:** ${gameId}\n**Role:** ${role || 'N/A'}\n**Rank:** ${rank || 'N/A'}`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

module.exports.handleGameAddModal = handleGameAddModal;
