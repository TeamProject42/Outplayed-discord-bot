const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { games } = require('../../config');
const { users, gameProfiles } = require('../../database/supabase');
const { successEmbed, errorEmbed, profileEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');
const selectHandler = require('../../interactions/selectMenus');
const modalHandler = require('../../interactions/modals');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('🎮 Create your Outplayed player profile (under 60 seconds!)'),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Check if player already exists
        const existing = await users.getByDiscordId(interaction.user.id);
        if (existing) {
            return interaction.editReply({
                embeds: [errorEmbed('Already Registered', 'You already have a profile! Use `/editprofile` to make changes, or `/profile` to view it.')],
            });
        }

        // Step 1: Game selection buttons
        const rows = [];
        const gameKeys = Object.keys(games);
        const row = new ActionRowBuilder();

        for (const key of gameKeys) {
            const game = games[key];
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`start_game_${key}_${interaction.user.id}`)
                    .setLabel(game.name)
                    .setEmoji(game.emoji)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        rows.push(row);

        await interaction.editReply({
            content: '## 🎮 Welcome to Outplayed!\nSelect your primary game to get started:',
            components: rows,
        });
    },
};

// ─── Step 1 Handler: Game selected → Show Player ID modal ────
buttonHandler.register('start_game_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const gameKey = parts[2];
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your onboarding flow.', ephemeral: true });
    }

    // Show modal for Player ID
    const modal = new ModalBuilder()
        .setCustomId(`start_pid_${gameKey}_${interaction.user.id}`)
        .setTitle(`Enter your ${games[gameKey].name} Player ID`);

    const pidInput = new TextInputBuilder()
        .setCustomId('player_id')
        .setLabel('Your in-game Player ID / Username')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50)
        .setPlaceholder('e.g. TenZ#NA1');

    modal.addComponents(new ActionRowBuilder().addComponents(pidInput));
    await interaction.showModal(modal);
});

// ─── Step 2 Handler: Player ID entered → Show rank dropdown ──
modalHandler.register('start_pid_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const gameKey = parts[2];
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your onboarding flow.', ephemeral: true });
    }

    const playerId = interaction.fields.getTextInputValue('player_id');
    const game = games[gameKey];

    // Build rank dropdown
    const rankOptions = game.ranks.map(rank => ({
        label: rank,
        value: rank,
    }));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`start_rank_${gameKey}_${playerId.replace(/[^a-zA-Z0-9#]/g, '_')}_${interaction.user.id}`)
        .setPlaceholder('Select your rank...')
        .addOptions(rankOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
        content: `## 🏅 Almost done!\n**Game:** ${game.emoji} ${game.name}\n**Player ID:** \`${playerId}\`\n\nNow select your current rank:`,
        components: [row],
        ephemeral: true,
    });
});

// ─── Step 3 Handler: Rank selected → Create profile ──────────
selectHandler.register('start_rank_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const gameKey = parts[2];
    const playerId = parts[3].replace(/_/g, ' ');
    const originalUserId = parts[4];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ This is not your onboarding flow.', ephemeral: true });
    }

    const rank = interaction.values[0];
    const game = games[gameKey];

        // Create player profile
    try {
        // 1. Create or get basic User
        await users.createOrUpdate(interaction.user.id, {
            Username: interaction.user.username,
            Registration_Status: 'registered'
        });

        // 2. Get the player UUID
        const userRec = await users.getByDiscordId(interaction.user.id);
        const uuid = userRec.UUID;

        // 3. Insert game profile
        const gameTable = getGameTableName(gameKey);
        const gameIdField = 'Game_ID'; 
        const inGameNameField = 'In_Game_Name'; 

        await gameProfiles.createOrUpdate(gameTable, uuid, {
            [inGameNameField]: playerId,
            [gameIdField]: playerId,
            Rank: rank,
            Status: 'active'
        });

        // 4. Role Detection and Assignment (MVP Task)
        let roleMsg = '';
        if (interaction.guild && interaction.member) {
            const playerRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'player');
            if (playerRole) {
                if (!interaction.member.roles.cache.has(playerRole.id)) {
                    try {
                        await interaction.member.roles.add(playerRole);
                        roleMsg = `\n\n🎯 You've been granted the **@Player** role!`;
                    } catch (roleErr) {
                        logger.warn(`Could not assign Player role: ${roleErr.message}`);
                    }
                } else {
                    roleMsg = `\n\n🎯 You already have the **@Player** role!`;
                }
            }
        }
        
        logger.info(`Player registered in Supabase: ${interaction.user.tag} → ${game.name} (${rank})`);

        await interaction.update({
            content: null,
            embeds: [
                successEmbed('Profile Created!', `Welcome to Outplayed, **${interaction.user.displayName}**! Your profile is ready.${roleMsg}`),
            ],
            components: [],
        });
    } catch (error) {
        logger.error(`Error saving profile: ${error.message}`);
        await interaction.update({
            content: '❌ An error occurred saving your profile to the database.',
            components: [],
            embeds: []
        });
    }
});

function getGameTableName(gameKey) {
    // Map internal config keys to Supabase table names
    switch(gameKey) {
        case 'valo': return 'ValorantMember';
        case 'bgmi': return 'BgmiMember';
        case 'codm': return 'CODMobileMember';
        case 'mlbb': return 'MobaLegendsMember';
        // Add others as needed from config.js
        default: return 'BgmiMember'; // fallback
    }
}
