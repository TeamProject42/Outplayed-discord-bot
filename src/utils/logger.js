/**
 * Logs an action to the console for MVP instead of SQLite.
 */
function log(guildId, actorId, action, target = null, details = null) {
    const timestamp = new Date().toISOString();

    // Console output
    const detailStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : '';
    console.log(`[${timestamp}] [${action}] Actor: ${actorId} | Target: ${target || 'N/A'} | ${detailStr}`);
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
