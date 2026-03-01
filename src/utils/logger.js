const { auditLog } = require('../database/db');

/**
 * Logs an action to the audit_log table and console.
 */
function log(guildId, actorId, action, target = null, details = null) {
    const timestamp = new Date().toISOString();

    // Console output
    const detailStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : '';
    console.log(`[${timestamp}] [${action}] Actor: ${actorId} | Target: ${target || 'N/A'} | ${detailStr}`);

    // Database
    auditLog.log(guildId, actorId, action, target, details);
}

/**
 * Simple console info logger (no DB write).
 */
function info(message) {
    console.log(`[${new Date().toISOString()}] ℹ️  ${message}`);
}

/**
 * Simple console error logger (no DB write).
 */
function error(message, err = null) {
    console.error(`[${new Date().toISOString()}] ❌ ${message}`);
    if (err) console.error(err);
}

module.exports = { log, info, error };
