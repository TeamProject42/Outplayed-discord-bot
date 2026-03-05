const { PermissionFlagsBits } = require('discord.js');

/**
 * Validates that the interaction user is the guild owner or an admin.
 * Returns true if authorized, false if not (and sends ephemeral reply).
 */
async function ownerOnly(interaction) {
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: '⛔ This command can only be used in a server.', ephemeral: true });
        return false;
    }

    // Ensure guild owner info is fetched
    if (!guild.ownerId) {
        await guild.fetch();
    }

    const isOwner = interaction.user.id === guild.ownerId;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isOwner && !isAdmin) {
        await interaction.reply({
            content: '⛔ **Access Denied** — Only the server owner or admins can use this command.',
            ephemeral: true,
        });
        return false;
    }

    return true;
}

function logOwnerAction(guildId, actorId, action, target = null, details = null) {
    console.log(`[OWNER ACTION] Guild: ${guildId} | Actor: ${actorId} | Action: ${action}`);
}

module.exports = { ownerOnly, logOwnerAction };
