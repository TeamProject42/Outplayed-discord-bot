const { createClient } = require('@supabase/supabase-js');
const { supabaseUrl, supabaseKey } = require('../config');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── User Queries ───────────────────────────────────────────
const users = {
    async createOrUpdate(discordId, userData) {
        const { data, error } = await supabase
            .from('User')
            .upsert({
                Discord_ID: discordId,
                ...userData
            }, { onConflict: 'Discord_ID' })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getByDiscordId(discordId) {
        const { data, error } = await supabase
            .from('User')
            .select('*')
            .eq('Discord_ID', discordId)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
        return data;
    },

    async getByUUID(uuid) {
        const { data, error } = await supabase
            .from('User')
            .select('*')
            .eq('UUID', uuid)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    }
};

// ─── Game Profiles (Members) ───────────────────────────────
const gameProfiles = {
    // Note: The schema has specific tables per game (BgmiMember, ValorantMember, FreeFireMember, etc.)
    // We can abstract this or keep it specific.
    async createOrUpdate(gameTable, userUuid, profileData) {
        const { data, error } = await supabase
            .from(gameTable)
            .upsert({
                User_UUID: userUuid,
                ...profileData,
            }, { onConflict: 'User_UUID' })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async get(gameTable, userUuid) {
         const { data, error } = await supabase
            .from(gameTable)
            .select('*')
            .eq('User_UUID', userUuid)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async remove(gameTable, userUuid) {
        const { error } = await supabase
            .from(gameTable)
            .delete()
            .eq('User_UUID', userUuid);
            
        if (error) throw error;
        return true;
    }
}

// ─── Franchise & Rosters (Teams) ─────────────────────────────
const franchises = {
    async create(ownerId, name, gameType, rosterData) {
        // Create franchise first
        const { data: franchise, error: fError } = await supabase
            .from('Franchise')
            .insert({
                Franchise_Name: name,
                Owner_ID: ownerId
            })
            .select()
            .single();

        if (fError) throw fError;

        // Create game-specific roster linked to franchise
        const rosterTable = getRosterTable(gameType);
        
        const { data: roster, error: rError } = await supabase
            .from(rosterTable)
            .insert({
                Franchise_UUID: franchise.Franchise_UUID,
                [`${getGamePrefix(gameType)}_Leader_UUID`]: ownerId,
                ...rosterData
            })
            .select()
            .single();
            
        if (rError) throw rError;

        return { franchise, roster };
    },
    
    async getByOwner(ownerId) {
        const { data, error } = await supabase
            .from('Franchise')
            .select('*')
            .eq('Owner_ID', ownerId);
            
         if (error) throw error;
         return data;
    },

    async getByUUID(franchiseUuid) {
        const { data, error } = await supabase
            .from('Franchise')
            .select('*')
            .eq('Franchise_UUID', franchiseUuid)
            .single();

        if (error && error.code !== 'PGRST116') throw error;
        return data; 
    },

    async joinRoster(franchiseUuid, userUuid, gameType, rank) {
         const rosterTable = getRosterTable(gameType);
         const { data: existing } = await supabase
            .from(rosterTable)
            .select('*')
            .eq('Franchise_UUID', franchiseUuid)
            .single();

         if (!existing) throw new Error('Roster not found for this franchise.');

         // Get current members to find an empty slot (simplified - schema has Member_2_UUID, Optionals)
         const slots = [
             'Member_2_UUID', 'Member_3_UUID', 'Member_4_UUID', 'Member_5_UUID',
             'Optional_1_UUID', 'Optional_2_UUID'
         ];

         let openSlot = slots.find(s => !existing[s]);

         if (!openSlot) {
             throw new Error('Roster is full');
         }

        const { data, error } = await supabase
            .from(rosterTable)
            .update({ [openSlot]: userUuid })
            .eq('Franchise_UUID', franchiseUuid)
            .select()
            .single();

         if (error) throw error;
         return data;
    },

    async leaveRoster(franchiseUuid, userUuid, gameType) {
        // Find which slot the user is in and nullify it
        const rosterTable = getRosterTable(gameType);
        const { data: existing } = await supabase
            .from(rosterTable)
            .select('*')
            .eq('Franchise_UUID', franchiseUuid)
            .single();

        if (!existing) throw new Error('Roster not found.');

        const slots = [
             'Member_2_UUID', 'Member_3_UUID', 'Member_4_UUID', 'Member_5_UUID',
             'Optional_1_UUID', 'Optional_2_UUID'
        ];
        const userSlot = slots.find(s => existing[s] === userUuid);

        if (!userSlot) throw new Error('User not found in roster.');

        const { error } = await supabase
            .from(rosterTable)
            .update({ [userSlot]: null })
            .eq('Franchise_UUID', franchiseUuid);

        if (error) throw error;
        return true;
    },

    async transferOwnership(franchiseUuid, newOwnerUuid) {
        // Update Franchise Owner
        const { error: fError } = await supabase
            .from('Franchise')
            .update({ Owner_ID: newOwnerUuid })
            .eq('Franchise_UUID', franchiseUuid);
        if (fError) throw fError;

        // Note: For MVP we keep leader in roster unchanged or we'd have to find it.
        // Assuming Owner is enough. 
        return true;
    }
};

// ─── Tournaments ─────────────────────────────────────────────
const tournaments = {
    async getActive() {
        const { data, error } = await supabase
            .from('Tournament')
            .select('*')
            .neq('Status', 'Completed');
            
        if (error) throw error;
        return data;
    },
    
    async getByUUID(uuid) {
        const { data, error } = await supabase
            .from('Tournament')
            .select('*')
            .eq('Tournament_UUID', uuid)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error;
        return data;
    },

    async create(tournamentData) {
         const { data, error } = await supabase
             .from('Tournament')
             .insert(tournamentData)
             .select()
             .single();
             
         if (error) throw error;
         return data;
    },

    async registerTeam(tournamentUuid, franchiseUuid, memberUuid) {
        const { data, error } = await supabase
            .from('Registered_Participants')
            .insert({
                Tournament_UUID: tournamentUuid,
                Franchise_UUID: franchiseUuid,
                Member_UUID: memberUuid,
                Status: 'Registered'
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async isTeamRegistered(tournamentUuid, franchiseUuid) {
         const { data, error } = await supabase
             .from('Registered_Participants')
             .select('*')
             .eq('Tournament_UUID', tournamentUuid)
             .eq('Franchise_UUID', franchiseUuid)
             .single();

         if (error && error.code !== 'PGRST116') throw error;
         return !!data;
    },

    async getRegisteredTeams(tournamentUuid) {
        const { data, error } = await supabase
             .from('Registered_Participants')
             .select(`
                 Franchise_UUID,
                 Franchise!inner(*)
             `)
             .eq('Tournament_UUID', tournamentUuid);
             
        if (error) throw error;
        // Map to return just the Franchise objects
        return data.map(row => row.Franchise);
    }
};

// ─── Matches ─────────────────────────────────────────────────
const matches = {
    async create(matchData) {
        const { data, error } = await supabase
            .from('Match')
            .insert(matchData)
            .select()
            .single();
            
        if (error) throw error;
        return data;
    },

    async getByTournament(tournamentUuid) {
        const { data, error } = await supabase
            .from('Match')
            .select('*')
            .eq('Tournament_ID', tournamentUuid);
            
        if (error) throw error;
        return data;
    },

    async updateWinner(matchId, winnerFranchiseUuid) {
         const { data, error } = await supabase
            .from('Match')
            .update({ Winner_ID: winnerFranchiseUuid, Status: 'Completed' })
            .eq('Match_ID', matchId)
            .select()
            .single();
            
         if (error) throw error;
         return data;
    }
};

function getRosterTable(gameType) {
    switch(gameType.toLowerCase()) {
        case 'bgmi': return 'BgmiRoster';
        case 'valorant': return 'ValoRoster';
        case 'freefire': return 'FreeFireRoster';
        case 'codm': return 'CODMobileRoster';
        case 'mobalegends': return 'MobaLegendsRoster';
        default: throw new Error(`Unsupported game type: ${gameType}`);
    }
}

function getGamePrefix(gameType) {
    switch(gameType.toLowerCase()) {
         case 'bgmi': return 'Roster'; // BgmiRoster uses Roster_Leader_UUID
         case 'valorant': return 'ValoRoster';
         case 'freefire': return 'Roster'; 
         case 'codm': return 'Roster';
         case 'mobalegends': return 'MobaLeg';
         default: return 'Roster';
    }
}

module.exports = {
    supabase,
    users,
    gameProfiles,
    franchises,
    tournaments,
    matches
};
