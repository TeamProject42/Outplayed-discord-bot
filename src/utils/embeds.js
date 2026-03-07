const { EmbedBuilder } = require('discord.js');
const config = require('../config');

function successEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(config.successColor)
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setFooter({ text: config.botName })
        .setTimestamp();
}

function errorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(config.errorColor)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setFooter({ text: config.botName })
        .setTimestamp();
}

function infoEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(config.infoColor)
        .setTitle(title)
        .setDescription(description || null)
        .setFooter({ text: config.botName })
        .setTimestamp();
}

function warningEmbed(title, description) {
    return new EmbedBuilder()
        .setColor(config.warningColor)
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setFooter({ text: config.botName })
        .setTimestamp();
}

function profileEmbed(user, gameProfiles = []) {
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`🎮 ${user.Name || user.Username || 'Player'}`)
        .setDescription(user.bio || 'No bio set.')
        .addFields(
            { name: '🆔 Username', value: user.Username || 'N/A', inline: true },
            { name: '🌍 Region', value: user.Region || 'Not set', inline: true },
            { name: '🏳️ Country', value: user.Country || 'Not set', inline: true },
            { name: '📧 Email', value: user.Email || 'Not set', inline: true },
            { name: '📊 Status', value: user.Account_Status || 'Active', inline: true },
            { name: '🏠 In Team', value: user.In_Team ? 'Yes' : 'No', inline: true },
        )
        .setFooter({ text: `${config.botName} • UUID: ${user.UUID}` })
        .setTimestamp();

    if (user.Profile_Pic_Url && /^https?:\/\/.+/.test(user.Profile_Pic_Url)) {
        try {
            embed.setThumbnail(user.Profile_Pic_Url);
        } catch (e) {
            // ignore invalid url
        }
    }

    if (gameProfiles.length > 0) {
        const gameList = gameProfiles.map(g => `**${g.game}**: ${g.ign} (${g.gameId})`).join('\n');
        embed.addFields({ name: '🎮 Game Profiles', value: gameList });
    }

    return embed;
}

function tournamentEmbed(tournament) {
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`🏆 ${tournament.Tournament_Name}`)
        .addFields(
            { name: '🎮 Game', value: tournament.Game || 'N/A', inline: true },
            { name: '📋 Format', value: tournament.Format || 'N/A', inline: true },
            { name: '📊 Status', value: tournament.Status || 'N/A', inline: true },
            { name: '💰 Prize Pool', value: tournament.Prize_Pool ? `₹${tournament.Prize_Pool.toLocaleString()}` : 'N/A', inline: true },
            { name: '👥 Max Teams', value: `${tournament.Team_Participate || 0}/${tournament.Max_Teams || 'N/A'}`, inline: true },
            { name: '💵 Entry Fee', value: tournament.Registration_Fee ? `₹${tournament.Registration_Fee}` : 'Free', inline: true },
            { name: '📅 Start Date', value: tournament.Starting_Date || 'TBA', inline: true },
            { name: '📅 End Date', value: tournament.Ending_Date || 'TBA', inline: true },
            { name: '⏰ Reg. Deadline', value: tournament.Registration_Deadline || 'TBA', inline: true },
        )
        .setFooter({ text: `${config.botName} • ID: ${tournament.Tournament_UUID}` })
        .setTimestamp();

    if (tournament.Poster_URL) {
        embed.setImage(tournament.Poster_URL);
    }

    if (tournament.Description) {
        embed.setDescription(tournament.Description);
    }

    return embed;
}

function matchEmbed(match, teams = {}) {
    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle(`⚔️ Match`)
        .addFields(
            { name: '📅 Date', value: match.Date || 'TBA', inline: true },
            { name: '🕐 Start', value: match.Start_Time || 'TBA', inline: true },
            { name: '🕐 End', value: match.End_Time || 'TBA', inline: true },
            { name: '📊 Status', value: match.Status || 'N/A', inline: true },
            { name: '🔴 Live', value: match.Is_Live ? 'Yes' : 'No', inline: true },
        )
        .setFooter({ text: `${config.botName} • Match: ${match.Match_UUID}` })
        .setTimestamp();

    if (teams.team1) embed.addFields({ name: 'Team 1', value: teams.team1, inline: true });
    if (teams.team2) embed.addFields({ name: 'Team 2', value: teams.team2, inline: true });
    if (match.Score) embed.addFields({ name: '📊 Score', value: match.Score });

    return embed;
}

module.exports = {
    successEmbed,
    errorEmbed,
    infoEmbed,
    warningEmbed,
    profileEmbed,
    tournamentEmbed,
    matchEmbed,
};
