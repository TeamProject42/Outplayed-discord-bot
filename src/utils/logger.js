function log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = {
        info: '📋',
        success: '✅',
        warn: '⚠️',
        error: '❌',
        debug: '🔍',
    }[level] || '📋';

    const line = `[${timestamp}] ${prefix} ${message}`;
    if (data) {
        console.log(line, data);
    } else {
        console.log(line);
    }
}

module.exports = {
    info: (msg, data) => log('info', msg, data),
    success: (msg, data) => log('success', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    error: (msg, data) => log('error', msg, data),
    debug: (msg, data) => log('debug', msg, data),
};
