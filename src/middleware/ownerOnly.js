const { auditLog } = require('../database/db');

/**
 * Validates that the interaction user is the guild owner.
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

    if (interaction.user.id !== guild.ownerId) {
        await interaction.reply({
            content: '⛔ **Access Denied** — Only the server owner can use this command.',
            ephemeral: true,
        });
        return false;
    }

    return true;
}

/**
 * Logs an owner action to the audit log.
 */
function logOwnerAction(guildId, actorId, action, target = null, details = null) {
    auditLog.log(guildId, actorId, action, target, details);
}

module.exports = { ownerOnly, logOwnerAction };
