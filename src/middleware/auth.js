const { supabase } = require('../database/supabase');
const { errorEmbed } = require('../utils/embeds');
const { MessageFlags } = require('discord.js');

/**
 * Middleware: Ensure the Discord user is registered in the User table.
 * Uses Discord user ID stored in the Discord_ID field
 * to avoid overwriting the existing Username column.
 * 
 * @param {import('discord.js').CommandInteraction} interaction
 * @returns {Promise<object|null>} User record if found, null if not registered
 */
async function ensureRegistered(interaction) {
    const discordId = interaction.user.id;

    const { data: user, error } = await supabase
        .from('User')
        .select('*')
        .eq('Discord_ID', discordId)
        .single();

    if (error || !user) {
        await interaction.reply({
            embeds: [errorEmbed('Not Registered', 'You haven\'t linked your account yet.\nRun `/start` to register and connect your Discord account.')],
            flags: [MessageFlags.Ephemeral],
        });
        return null;
    }

    return user;
}

module.exports = { ensureRegistered };
