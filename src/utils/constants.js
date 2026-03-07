module.exports = {
    ERRORS: {
        NOT_REGISTERED: "You haven't registered yet. Run `/start` first.",
        REGISTRATION_FAILED: "Could not create your account. Please try again later.",
        ALREADY_REGISTERED: "You're already linked and registered!",
        USER_NOT_FOUND: "Player not found or hasn't registered on Outplayed.",
        TEAM_REQUIRED: "You need to own a team to perform this action.",
        ACCESS_DENIED_OWNER: "Hey! Since you are the actual Server Owner hosting these events, you are not allowed to participate in tournaments.",
        GENERIC_ERROR: "Something went wrong while executing this command. Please try again.",
        INTERACTION_EXPIRED: "Interaction expired or already acknowledged.",
        SUPABASE_ERROR: "Database connection error. Please try again later.",
        INVALID_URL: "The profile image URL provided is invalid.",
        RATE_LIMIT: "You're sending commands too fast. Please wait a few seconds.",
    },
    SUCCESS: {
        REGISTERED: "Successfully registered and linked your account!",
        PROFILE_UPDATED: "Your profile has been successfully updated.",
        GAME_ADDED: "Game profile added successfully.",
        TEAM_CREATED: "Your team has been created successfully!",
        AUTO_LINKED: "Account Auto-Linked: Welcome back!",
    },
    TITLES: {
        ERROR: "❌ Error",
        SUCCESS: "✅ Success",
        INFO: "📋 Information",
        WARNING: "⚠️ Warning",
        NOT_FOUND: "🔍 Not Found",
        ACCESS_DENIED: "🚫 Access Denied",
        GAMES: "🎮 Games",
        TOURNAMENT: "🏆 Tournament",
    }
};
