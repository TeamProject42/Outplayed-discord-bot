const rateLimitMap = new Map();

const WINDOW_MS = 10_000; // 10 seconds
const MAX_REQUESTS = 5;   // max commands per window

/**
 * Returns true if the user is rate-limited (should be blocked).
 * Returns false if the user is allowed to proceed.
 */
function isRateLimited(userId) {
    const now = Date.now();
    let entry = rateLimitMap.get(userId);

    if (!entry || now > entry.resetTime) {
        entry = { count: 1, resetTime: now + WINDOW_MS };
        rateLimitMap.set(userId, entry);
        return false;
    }

    entry.count++;
    if (entry.count > MAX_REQUESTS) {
        return true;
    }

    return false;
}

/**
 * Middleware that checks rate limit and replies if exceeded.
 * Returns true if allowed, false if blocked.
 */
async function checkRateLimit(interaction) {
    if (isRateLimited(interaction.user.id)) {
        await interaction.reply({
            content: '⏳ **Slow down!** You\'re sending commands too fast. Please wait a few seconds.',
            ephemeral: true,
        });
        return false;
    }
    return true;
}

// Cleanup stale entries every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of rateLimitMap) {
        if (now > entry.resetTime) {
            rateLimitMap.delete(userId);
        }
    }
}, 60_000);

module.exports = { checkRateLimit, isRateLimited };
