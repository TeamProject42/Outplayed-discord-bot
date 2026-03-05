const { EmbedBuilder } = require('discord.js');
const { embedColor, botName } = require('../config');
const { EMOJIS, STATUS } = require('../constants/messages');

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
        .setTitle(`${EMOJIS.SUCCESS} ${title}`)
        .setDescription(description)
        .setFooter({ text: botName })
        .setTimestamp();
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(0xEF4444)
        .setTitle(`${EMOJIS.ERROR} ${title}`)
        .setDescription(description)
        .setFooter({ text: botName })
        .setTimestamp();
}

function infoEmbed(title, description = null) {
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${EMOJIS.INFO} ${title}`)
        .setFooter({ text: botName })
        .setTimestamp();

    if (description) embed.setDescription(description);
    return embed;
}

function profileEmbed(player, user) {
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${EMOJIS.GAME} ${user.displayName}'s Profile`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }));

    if (player.Bio) {
        embed.setDescription(`*"${player.Bio}"*`);
    }

    embed.addFields(
            { name: `${EMOJIS.ID} Username`, value: player.Username || 'Not set', inline: true },
            { name: `${EMOJIS.GLOBE} Region`, value: player.Region || 'Unknown', inline: true },
            { name: `${EMOJIS.PIN} Status`, value: player.Account_Status || STATUS.ACTIVE, inline: true }
        )
        .setFooter({ text: `${botName} • Joined` });

    if (player.Created_At) {
        embed.setTimestamp(new Date(player.Created_At));
    } else {
        embed.setTimestamp();
    }
        
    return embed;
}

function tournamentEmbed(tournament) {
    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${EMOJIS.TROPHY} ${tournament.Name}`)
        .setDescription(tournament.Description || 'A new tournament is live! Register your team now.')
        .addFields(
            { name: `${EMOJIS.USERS} Team Slots`, value: `${tournament.Total_Slots || 'Unknown'}`, inline: true },
            { name: `${EMOJIS.STATUS} Status`, value: tournament.Status ? tournament.Status.charAt(0).toUpperCase() + tournament.Status.slice(1) : STATUS.OPEN, inline: true },
            { name: `${EMOJIS.START_DATE} Start Date`, value: formatStartTime(tournament.Start_Date), inline: true },
            { name: `${EMOJIS.END_DATE} End Date`, value: formatStartTime(tournament.End_Date), inline: true },
            { name: `${EMOJIS.BRACKET} Bracket`, value: tournament.Bracket_Type || 'Single Elimination', inline: true }
        )
        .setFooter({ text: `${botName} • ID: ${tournament.Tournament_UUID}` });

    if (tournament.Created_At) {
        embed.setTimestamp(new Date(tournament.Created_At));
    } else {
        embed.setTimestamp();
    }

    if (tournament.Entry_Fee) {
        embed.addFields({ name: `${EMOJIS.MONEY} Entry Fee`, value: tournament.Entry_Fee, inline: true });
    }
    if (tournament.Prize_Pool) {
        embed.addFields({ name: `${EMOJIS.MEDAL} Prize Pool`, value: tournament.Prize_Pool, inline: true });
    }

    if (tournament.Banner_Path) {
        embed.setImage(tournament.Banner_Path);
    }

    return embed;
}

function matchEmbed(match, team1, team2, round) {
    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${EMOJIS.SWORDS} Match — Round ${round}`)
        .setDescription(`**${team1.name}** vs **${team2.name}**`)
        .addFields(
            { name: `${EMOJIS.RED_TEAM} Team 1`, value: team1.name, inline: true },
            { name: `${EMOJIS.BLUE_TEAM} Team 2`, value: team2.name, inline: true },
            { name: `${EMOJIS.STATUS} Status`, value: match.status.charAt(0).toUpperCase() + match.status.slice(1), inline: true },
        )
        .setFooter({ text: `${botName} • Match #${match.match_number}` })
        .setTimestamp();
}

function teamEmbed(team, members) {
    const memberList = members.map((m, i) =>
        `${i === 0 ? EMOJIS.CROWN : EMOJIS.USER} <@${m.discord_id}> — ${m.rank}`
    ).join('\n');

    return new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(`${EMOJIS.TEAM} Team: ${team.name}`)
        .addFields(
            { name: `${EMOJIS.STATUS} Team Code`, value: `\`${team.code}\``, inline: true },
            { name: `${EMOJIS.USERS} Size`, value: `${team.current_size}/${team.size}`, inline: true },
            { name: `${EMOJIS.LOCK} Status`, value: team.locked ? STATUS.LOCKED : STATUS.OPEN, inline: true },
            { name: `${EMOJIS.STATUS} Roster`, value: memberList || 'No members' },
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
