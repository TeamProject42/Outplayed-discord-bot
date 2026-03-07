const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, matchEmbed, infoEmbed } = require('../../utils/embeds');
const { formatDate, formatTime, generateUUID } = require('../../utils/helpers');
const { getGameKeys, getGame } = require('../../utils/gameConstants');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('matches')
        .setDescription('View your match schedule')
        .addSubcommand(sub =>
            sub.setName('upcoming')
                .setDescription('View your upcoming matches'))
        .addSubcommand(sub =>
            sub.setName('history')
                .setDescription('View your past matches'))
        .addSubcommand(sub =>
            sub.setName('checkin')
                .setDescription('Check in for your upcoming match')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Match UUID')
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('result')
                .setDescription('Submit a match result')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Match UUID')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            const sub = interaction.options.getSubcommand();

            if (sub === 'upcoming') return await handleUpcoming(interaction);
            if (sub === 'history') return await handleHistory(interaction);
            if (sub === 'checkin') return await handleCheckin(interaction);
            if (sub === 'result') return await handleResult(interaction);
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};

async function handleUpcoming(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply();

        // Get user's tournament participations
        const { data: participations } = await supabase
            .from('User_Tournament_Participation')
            .select('Tournament_UUID, Franchise_UUID')
            .eq('User_UUID', user.UUID);

        if (!participations || participations.length === 0) {
            return interaction.editReply({
                embeds: [infoEmbed('📅 No Matches', 'You\'re not registered for any tournaments. Use `/tournaments list` to browse.')],
            });
        }

        const tournamentUUIDs = participations.map(p => p.Tournament_UUID);

        // Get upcoming matches for these tournaments
        const { data: matches, error } = await supabase
            .from('Match')
            .select('*')
            .in('Tournament_UUID', tournamentUUIDs)
            .in('Status', ['scheduled', 'pending', 'live'])
            .order('Date', { ascending: true })
            .order('Start_Time', { ascending: true })
            .limit(10);

        if (error) {
            throw error;
        }

        if (!matches || matches.length === 0) {
            return interaction.editReply({
                embeds: [infoEmbed('📅 No Upcoming Matches', 'You have no upcoming matches scheduled.')],
            });
        }

        // Build match list
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📅 Upcoming Matches')
            .setDescription(matches.map((m, i) => {
                let line = `**${i + 1}. Match** \`${m.Match_UUID}\`\n`;
                line += `📅 ${formatDate(m.Date)} | 🕐 ${formatTime(m.Start_Time)} — ${formatTime(m.End_Time)}\n`;
                line += `📊 Status: ${m.Status}${m.Is_Live ? ' 🔴 LIVE' : ''}`;
                if (m.Party_Code) line += `\n🔑 Code: \`${m.Party_Code}\``;
                return line;
            }).join('\n\n'))
            .setFooter({ text: `${config.botName} • Use /checkin <match_id> to check in` })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleHistory(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply();

        // Get user's tournament participations
        const { data: participations } = await supabase
            .from('User_Tournament_Participation')
            .select('Tournament_UUID, Franchise_UUID')
            .eq('User_UUID', user.UUID);

        if (!participations || participations.length === 0) {
            return interaction.editReply({
                embeds: [infoEmbed('📊 No Match History', 'You haven\'t participated in any tournaments yet.')],
            });
        }

        const tournamentUUIDs = participations.map(p => p.Tournament_UUID);

        // Get completed matches
        const { data: matches } = await supabase
            .from('Match')
            .select('*')
            .in('Tournament_UUID', tournamentUUIDs)
            .eq('Status', 'completed')
            .order('Date', { ascending: false })
            .limit(10);

        if (!matches || matches.length === 0) {
            return interaction.editReply({
                embeds: [infoEmbed('📊 No Match History', 'No completed matches found.')],
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📊 Match History')
            .setDescription(matches.map((m, i) => {
                let line = `**${i + 1}.** \`${m.Match_UUID}\`\n`;
                line += `📅 ${formatDate(m.Date)} | Score: ${m.Score || 'N/A'}`;
                return line;
            }).join('\n\n'))
            .setFooter({ text: config.botName })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleCheckin(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const matchId = interaction.options.getString('id') || interaction.customId?.replace('checkin_', '');

        const { data: match } = await supabase.from('Match').select('*').eq('Match_UUID', matchId).single();

        if (!match || match.Status === 'completed' || match.Status === 'cancelled') {
            return interaction.editReply({ embeds: [errorEmbed(TITLES.ERROR, 'This match is no longer available for check-in.')] });
        }

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `Checked in for match \`${matchId}\`!\n\n📅 ${match.Date} at ${match.Start_Time}`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleResult(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        const matchId = interaction.options.getString('id');
        const { data: match } = await supabase.from('Match').select('*').eq('Match_UUID', matchId).single();

        if (!match || match.Status === 'completed') {
            return interaction.reply({ embeds: [errorEmbed(TITLES.ERROR, 'Results already submitted or match not found.')], flags: [MessageFlags.Ephemeral] });
        }

        const modal = new ModalBuilder().setCustomId(`result_modal_${matchId}`).setTitle('Submit Match Result');
        modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('match_score').setLabel('Score').setStyle(TextInputStyle.Short).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('match_notes').setLabel('Notes').setStyle(TextInputStyle.Paragraph).setRequired(false)),
        );
        await interaction.showModal(modal);
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleResultModal(interaction) {
    try {
        const matchId = interaction.customId.replace('result_modal_', '');
        const score = interaction.fields.getTextInputValue('match_score');
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { error } = await supabase.from('Match').update({ Score: score, Status: 'pending_confirmation' }).eq('Match_UUID', matchId);
        if (error) throw error;

        return interaction.editReply({ embeds: [successEmbed(TITLES.SUCCESS, `Result submitted for match \`${matchId}\`.`)] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleResultConfirm(interaction) {
    try {
        const matchId = interaction.customId.replace('result_confirm_', '');
        await interaction.deferUpdate();
        await supabase.from('Match').update({ Status: 'completed' }).eq('Match_UUID', matchId);
        return interaction.editReply({ embeds: [successEmbed(TITLES.SUCCESS, `Match finalized.`)], components: [] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleResultDeny(interaction) {
    try {
        const matchId = interaction.customId.replace('result_deny_', '');
        await interaction.deferUpdate();
        await supabase.from('Match').update({ Status: 'disputed', Score: null }).eq('Match_UUID', matchId);
        return interaction.editReply({ embeds: [errorEmbed('Result Disputed', `Match result disputed.`)], components: [] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

async function handleCheckinButton(interaction) {
    return await handleCheckin(interaction);
}

module.exports.handleCheckinButton = handleCheckinButton;
module.exports.handleResultModal = handleResultModal;
module.exports.handleResultConfirm = handleResultConfirm;
module.exports.handleResultDeny = handleResultDeny;
