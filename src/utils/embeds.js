const { EmbedBuilder } = require('discord.js');
const { embedColor, botName } = require('../config');

/**
 * Safely parse a date string into a Discord timestamp.
 * Handles ISO strings, "YYYY-MM-DD HH:MM", "dd/mm/yyyy", etc.
 */
function formatStartTime(dateStr) {
    if (!dateStr) return 'TBD';

    // Try dd/mm/yyyy format
    const ddmm = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (ddmm) {
        const rest = dateStr.slice(ddmm[0].length).trim().replace(' ', 'T');
        const iso = `${ddmm[3]}-${ddmm[2].padStart(2, '0')}-${ddmm[1].padStart(2, '0')}${rest ? 'T' + rest : ''}`;
        const d = new Date(iso);
        if (!isNaN(d.getTime())) return `<t:${Math.floor(d.getTime() / 1000)}:F>`;
    }

    // Normalize "YYYY-MM-DD HH:MM" → "YYYY-MM-DDTHH:MM"
    const normalized = dateStr.trim().replace(' ', 'T');
    const date = new Date(normalized);
    const timestamp = date.getTime();
    if (isNaN(timestamp)) return dateStr; // fallback to raw string
    return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0x22C55E)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setFooter({ text: botName })
        .setTimestamp();
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xEF4444)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setFooter({ text: botName })
        .setTimestamp();
}

function infoEmbed(title, description = null) {
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(title)
        .setFooter({ text: botName })
        .setTimestamp();

    if (description) embed.setDescription(description);
    return embed;
}

function profileEmbed(player, user) {
    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🎮 ${user.displayName}'s Profile`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '🎯 Game', value: player.game, inline: true },
            { name: '🆔 Player ID', value: player.player_id, inline: true },
            { name: '🏅 Rank', value: player.rank, inline: true },
            { name: '🏆 Wins', value: `${player.wins}`, inline: true },
            { name: '💀 Losses', value: `${player.losses}`, inline: true },
            { name: '📊 W/L Ratio', value: player.losses > 0 ? (player.wins / player.losses).toFixed(2) : `${player.wins}.00`, inline: true },
        )
        .setFooter({ text: `${botName} • Joined` })
        .setTimestamp(new Date(player.created_at));
}

function tournamentEmbed(tournament) {
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🏆 ${tournament.name}`)
        .setDescription('A new tournament is live! Register your team now.')
        .addFields(
            { name: '🎮 Game', value: tournament.game, inline: true },
            { name: '👥 Team Size', value: `${tournament.team_size}`, inline: true },
            { name: '📋 Format', value: tournament.format.charAt(0).toUpperCase() + tournament.format.slice(1), inline: true },
            { name: '🎟️ Max Teams', value: `${tournament.max_teams}`, inline: true },
            { name: '📅 Start Time', value: formatStartTime(tournament.start_time), inline: true },
            { name: '⏰ Check-in Window', value: `${tournament.checkin_window} min`, inline: true },
        )
        .setFooter({ text: `${botName} • Tournament ID: ${tournament.tournament_code}` })
        .setTimestamp();

    if (tournament.rank_restriction) {
        embed.addFields({ name: '🏅 Rank Restriction', value: tournament.rank_restriction, inline: true });
    }
    if (tournament.entry_fee) {
        embed.addFields({ name: '💰 Entry Fee', value: tournament.entry_fee, inline: true });
    }
    if (tournament.prize_pool) {
        embed.addFields({ name: '🏅 Prize Pool', value: tournament.prize_pool, inline: true });
    }

    return embed;
}

function matchEmbed(match, team1, team2, round) {
    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`⚔️ Match — Round ${round}`)
        .setDescription(`**${team1.name}** vs **${team2.name}**`)
        .addFields(
            { name: '🔴 Team 1', value: team1.name, inline: true },
            { name: '🔵 Team 2', value: team2.name, inline: true },
            { name: '📋 Status', value: match.status.charAt(0).toUpperCase() + match.status.slice(1), inline: true },
        )
        .setFooter({ text: `${botName} • Match #${match.match_number}` })
        .setTimestamp();
}

function teamEmbed(team, members) {
    const memberList = members.map((m, i) =>
        `${i === 0 ? '👑' : '👤'} <@${m.discord_id}> — ${m.rank}`
    ).join('\n');

    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`🛡️ Team: ${team.name}`)
        .addFields(
            { name: '📋 Team Code', value: `\`${team.code}\``, inline: true },
            { name: '👥 Size', value: `${team.current_size}/${team.size}`, inline: true },
            { name: '🔒 Status', value: team.locked ? 'Locked' : 'Open', inline: true },
            { name: '📜 Roster', value: memberList || 'No members' },
        )
        .setFooter({ text: botName })
        .setTimestamp();
}

module.exports = {
    successEmbed,
    errorEmbed,
    infoEmbed,
    profileEmbed,
    tournamentEmbed,
    matchEmbed,
    teamEmbed,
};
