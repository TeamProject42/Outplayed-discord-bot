const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { errorEmbed, infoEmbed, tournamentEmbed } = require('../../utils/embeds');
const { getGameChoices } = require('../../utils/gameConstants');
const { paginate, formatDate } = require('../../utils/helpers');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tournaments')
        .setDescription('Browse and view tournaments')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('List available tournaments')
                .addStringOption(opt =>
                    opt.setName('game')
                        .setDescription('Filter by game')
                        .setRequired(false)
                        .addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View tournament details')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('Tournament UUID')
                        .setRequired(true))),

    async execute(interaction) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'list') return handleList(interaction);
        if (sub === 'view') return handleView(interaction);
    },
};

async function handleList(interaction) {
    await interaction.deferReply();

    const gameFilter = interaction.options.getString('game');

    let query = supabase
        .from('Tournament')
        .select('Tournament_UUID, Tournament_Name, Game, Starting_Date, Ending_Date, Status, Prize_Pool, Max_Teams, Team_Participate, Registration_Fee, Registration_Deadline, Format')
        .order('Starting_Date', { ascending: true });

    if (gameFilter) {
        // Filter by game name (case-insensitive partial match)
        const { getGame } = require('../../utils/gameConstants');
        const game = getGame(gameFilter);
        if (game) {
            query = query.ilike('Game', `%${game.name}%`);
        }
    }

    const { data: tournaments, error } = await query;

    if (error) {
        logger.error('Tournament list error:', error);
        return interaction.editReply({
            embeds: [errorEmbed('Error', `Could not fetch tournaments: ${error.message}`)],
        });
    }

    if (!tournaments || tournaments.length === 0) {
        return interaction.editReply({
            embeds: [infoEmbed('🏆 No Tournaments', gameFilter
                ? 'No tournaments found for this game. Check back later!'
                : 'No tournaments available right now. Check back later!')],
        });
    }

    // Paginate results
    const pages = paginate(tournaments, 5);
    const page = pages[0];

    const embed = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🏆 Tournaments')
        .setDescription(page.map((t, i) => {
            const spots = `${t.Team_Participate || 0}/${t.Max_Teams}`;
            const fee = t.Registration_Fee ? `₹${t.Registration_Fee}` : 'Free';
            const prize = t.Prize_Pool ? `₹${t.Prize_Pool.toLocaleString()}` : 'N/A';
            return `**${i + 1}. ${t.Tournament_Name}**\n🎮 ${t.Game} | 📋 ${t.Format} | 💰 ${prize}\n👥 ${spots} teams | 💵 ${fee} | 📊 ${t.Status || 'upcoming'}\n📅 ${formatDate(t.Starting_Date)} — ${formatDate(t.Ending_Date)}\n🔑 \`${t.Tournament_UUID}\``;
        }).join('\n\n'))
        .setFooter({ text: `${config.botName} • Page 1/${pages.length} • Use /tournaments view <id> for details` })
        .setTimestamp();

    const components = [];
    if (pages.length > 1) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('page_tournaments_prev_0').setLabel('◀ Previous').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('page_tournaments_next_0').setLabel('Next ▶').setStyle(ButtonStyle.Primary),
        ));
    }

    return interaction.editReply({ embeds: [embed], components });
}

async function handleView(interaction) {
    await interaction.deferReply();

    const tournamentId = interaction.options.getString('id');

    const { data: tournament, error } = await supabase
        .from('Tournament')
        .select('*')
        .eq('Tournament_UUID', tournamentId)
        .single();

    if (error || !tournament) {
        return interaction.editReply({
            embeds: [errorEmbed('Not Found', `Tournament \`${tournamentId}\` not found. Use \`/tournaments list\` to browse.`)],
        });
    }

    const embed = tournamentEmbed(tournament);

    // Add rules if present
    if (tournament.Rules) {
        try {
            const rules = typeof tournament.Rules === 'string' ? JSON.parse(tournament.Rules) : tournament.Rules;
            if (Array.isArray(rules)) {
                embed.addFields({ name: '📜 Rules', value: rules.map((r, i) => `${i + 1}. ${r}`).join('\n') });
            } else if (typeof rules === 'object') {
                const ruleText = Object.entries(rules).map(([k, v]) => `**${k}:** ${v}`).join('\n');
                embed.addFields({ name: '📜 Rules', value: ruleText || 'No rules specified.' });
            }
        } catch (e) {
            embed.addFields({ name: '📜 Rules', value: String(tournament.Rules) });
        }
    }

    // Add prize distribution if present
    if (tournament.Prize_Pool_Distribution) {
        try {
            const dist = typeof tournament.Prize_Pool_Distribution === 'string'
                ? JSON.parse(tournament.Prize_Pool_Distribution)
                : tournament.Prize_Pool_Distribution;
            const distText = Object.entries(dist).map(([k, v]) => `🥇 **${k}:** ₹${v.toLocaleString?.() || v}`).join('\n');
            embed.addFields({ name: '💰 Prize Distribution', value: distText || 'N/A' });
        } catch (e) {
            // skip
        }
    }

    // Add register button
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`tournament_register_${tournament.Tournament_UUID}`)
            .setLabel('Register')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📝'),
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
}
