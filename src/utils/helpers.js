const { v4: uuidv4 } = require('uuid');

/**
 * Generate a UUID with a prefix, matching the Supabase schema patterns.
 * @param {string} prefix - e.g. 'usr-', 'fra-', 'ros-', 'inv-', 'noti-'
 */
function generateUUID(prefix = '') {
    return `${prefix}${uuidv4()}`;
}

/**
 * Format a date for display
 */
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * Format a time for display
 */
function formatTime(timeStr) {
    if (!timeStr) return 'N/A';
    // timeStr is HH:MM:SS
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${m} ${ampm}`;
}

/**
 * Truncate a string to a max length with ellipsis
 */
function truncate(str, maxLen = 100) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

/**
 * Chunk an array into pages of a given size
 */
function paginate(array, pageSize = 10) {
    const pages = [];
    for (let i = 0; i < array.length; i += pageSize) {
        pages.push(array.slice(i, i + pageSize));
    }
    return pages;
}

module.exports = {
    generateUUID,
    formatDate,
    formatTime,
    truncate,
    paginate,
};
