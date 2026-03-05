const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { users, franchises, tournaments } = require('../../database/supabase');
const { generateTournamentId } = require('../../utils/codeGenerator');
const { successEmbed, errorEmbed, tournamentEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');

/**
 * Parses separate date and time strings into a Date object.
 */
function parseDateAndTime(dateStr, timeStr) {
    let day, month, year;
    const ddmm = dateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmm) {
        day = parseInt(ddmm[1]); month = parseInt(ddmm[2]) - 1; year = parseInt(ddmm[3]);
    } else {
        const iso = dateStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (iso) {
            year = parseInt(iso[1]); month = parseInt(iso[2]) - 1; day = parseInt(iso[3]);
        } else return null;
    }
    const time = parseTimeString(timeStr);
    if (!time) return null;
    return new Date(year, month, day, time.hours, time.minutes);
}

function parseTimeString(str) {
    str = str.trim().toLowerCase();
    const ampmMatch = str.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
    if (ampmMatch) {
        let hours = parseInt(ampmMatch[1]);
        const minutes = parseInt(ampmMatch[2] || '0');
        const period = ampmMatch[3];
        if (period === 'pm' && hours !== 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        return { hours, minutes };
    }
    const h24Match = str.match(/^(\d{1,2}):(\d{2})$/);
    if (h24Match) return { hours: parseInt(h24Match[1]), minutes: parseInt(h24Match[2]) };
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createtournament')
        .setDescription('🏆 Create a new tournament (Server Owner only)')
        .addStringOption(opt => opt.setName('name').setDescription('Tournament name').setRequired(true))
        .addStringOption(opt => opt.setName('game').setDescription('Game abbreviation (e.g. valo, bgmi)').setRequired(true))
        .addIntegerOption(opt => opt.setName('max_teams').setDescription('Maximum teams allowed').setRequired(true).setMinValue(2).setMaxValue(1024))
        .addStringOption(opt => opt.setName('date').setDescription('Start date (e.g. 15/03/2025)').setRequired(true))
        .addStringOption(opt => opt.setName('time').setDescription('Start time (e.g. 4pm, 18:00)').setRequired(true))
        .addStringOption(opt => opt.setName('entry_fee').setDescription('Entry fee (optional)').setRequired(false))
        .addStringOption(opt => opt.setName('prize_pool').setDescription('Prize pool (optional)').setRequired(false)),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        await interaction.deferReply();

        const rawDate = interaction.options.getString('date').trim();
        const rawTime = interaction.options.getString('time').trim();
        const parsedDate = parseDateAndTime(rawDate, rawTime);

        if (!parsedDate || isNaN(parsedDate.getTime())) {
            return interaction.editReply({
                embeds: [errorEmbed('Invalid Date/Time', `Could not parse date/time.`)],
            });
        }

        const admin = await users.getByDiscordId(interaction.user.id);
        const adminId = admin ? admin.UUID : null;

        const tournamentCode = `TRN-${Date.now().toString(36).toUpperCase()}`;

        const data = {
            Tournament_UUID: tournamentCode,
            Name: interaction.options.getString('name'),
            Game_ID: interaction.options.getString('game'), // Maps to short code or UUID based on real schema
            Start_Date: parsedDate.toISOString(),
            Total_Slots: interaction.options.getInteger('max_teams'),
            Prize_Pool: interaction.options.getString('prize_pool') || 'TBD',
            Status: 'registration',
            Entry_Fee: interaction.options.getString('entry_fee') || 'Free',
            Admin_ID: adminId
        };

        try {
            const tournament = await tournaments.create(data);
            logOwnerAction(interaction.guild.id, interaction.user.id, 'CREATE_TOURNAMENT', tournamentCode, data);

            const embed = tournamentEmbed(tournament);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tourney_register_${tournament.Tournament_UUID}`)
                    .setLabel('Register Team')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🛡️')
            );

            await interaction.editReply({
                content: '## 🚨 New Tournament Live — Register Now!\n@everyone',
                embeds: [embed],
                components: [row],
            });

            logger.info(`Tournament created: ${data.Name} (${tournamentCode})`);

        } catch (error) {
            logger.error('Failed to create tournament:', error);
            await interaction.editReply({ embeds: [errorEmbed('Database Error', 'Could not create tournament.')] });
        }
    },
};

// ─── Register Team Button ────────────────────────────────────────
buttonHandler.register('tourney_register_', async (interaction) => {
    const tournamentUuid = interaction.customId.replace('tourney_register_', '');
    
    await interaction.deferReply({ ephemeral: true });

    try {
        const tournament = await tournaments.getByUUID(tournamentUuid);
        if (!tournament || tournament.Status !== 'registration') {
            return interaction.editReply({ embeds: [errorEmbed('Closed', 'Registration is closed or not found.')] });
        }

        const player = await users.getByDiscordId(interaction.user.id);
        if (!player) {
            return interaction.editReply({ embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')] });
        }

        // Simplification for MVP: Assuming they are registering their active Franchise.
        const ownedFranchises = await franchises.getByOwner(player.UUID);

        if (ownedFranchises.length === 0) {
            return interaction.editReply({
                embeds: [errorEmbed('Owner Only', 'You must own a Franchise to register. Create a team with `/createteam` first.')]
            });
        }

        const activeFranchise = ownedFranchises[0];

        const alreadyRegistered = await tournaments.isTeamRegistered(tournamentUuid, activeFranchise.Franchise_UUID);
        
        if (alreadyRegistered) {
            return interaction.editReply({
                embeds: [errorEmbed('Already Registered', `**${activeFranchise.Franchise_Name}** is already registered.`)]
            });
        }

        await tournaments.registerTeam(tournamentUuid, activeFranchise.Franchise_UUID, player.UUID);

        return interaction.editReply({
            embeds: [successEmbed('Registered!', `**${activeFranchise.Franchise_Name}** is registered for **${tournament.Name}**!`)],
        });

    } catch (error) {
        logger.error('Registration error:', error);
        return interaction.editReply({ embeds: [errorEmbed('Registration Failed', 'An error occurred.')] });
    }
});
