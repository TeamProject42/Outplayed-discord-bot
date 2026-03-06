const rateLimitMap = new Map();

const WINDOW_MS = 10000;  // 10 seconds
const MAX_REQUESTS = 5;   // 5 commands per window

/**
 * Rate limiter middleware. Returns true if rate limited (should block).
 * @param {string} userId
 * @returns {boolean}
 */
function isRateLimited(userId) {
    const now = Date.now();
    const userEntry = rateLimitMap.get(userId);

    if (!userEntry || now > userEntry.resetTime) {
        rateLimitMap.set(userId, { count: 1, resetTime: now + WINDOW_MS });
        return false;
    }

    userEntry.count++;
    if (userEntry.count > MAX_REQUESTS) {
        return true;
    }

    return false;
}

// Clean up stale entries every 60 seconds
setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of rateLimitMap) {
        if (now > entry.resetTime) {
            rateLimitMap.delete(userId);
        }
    }
}, 60000);

module.exports = { isRateLimited };
