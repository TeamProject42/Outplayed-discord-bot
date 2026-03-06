const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

/**
 * Test the Supabase connection by querying the Game table.
 * @returns {Promise<boolean>}
 */
async function testConnection() {
    try {
        const { data, error } = await supabase.from('Game').select('Game_Name').limit(5);
        if (error) throw error;
        console.log(`✅ Supabase connected — ${data.length} games found`);
        return true;
    } catch (err) {
        console.error('❌ Supabase connection failed:', err.message);
        return false;
    }
}

module.exports = { supabase, testConnection };
