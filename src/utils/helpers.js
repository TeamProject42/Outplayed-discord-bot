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

/**
 * Get public URL for a Supabase storage path
 */
function getPublicUrl(path) {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    
    const parts = path.split('/');
    if (parts.length < 2) return path;
    
    const bucket = parts[0];
    const filePath = parts.slice(1).join('/');
    
    const config = require('../config');
    return `${config.supabaseUrl}/storage/v1/object/public/${bucket}/${filePath}`;
}

module.exports = {
    generateUUID,
    formatDate,
    formatTime,
    truncate,
    paginate,
    getPublicUrl,
};
