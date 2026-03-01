const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { ownerOnly, logOwnerAction } = require('../../middleware/ownerOnly');
const { tournaments, teams: teamDb } = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const selectHandler = require('../../interactions/selectMenus');
const modalHandler = require('../../interactions/modals');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('editstandings')
        .setDescription('📝 Manually edit a team\'s standings (Server Owner only)')
        .addStringOption(opt =>
            opt.setName('tournament_id').setDescription('Tournament code').setRequired(true)
        ),

    async execute(interaction) {
        const isOwner = await ownerOnly(interaction);
        if (!isOwner) return;

        const code = interaction.options.getString('tournament_id').toUpperCase().trim();
        const tournament = tournaments.getByCode(code);

        if (!tournament) {
            return interaction.reply({ embeds: [errorEmbed('Not Found', `No tournament with code \`${code}\`.`)], ephemeral: true });
        }

        const registeredTeams = tournaments.getRegisteredTeams(tournament.id);

        if (registeredTeams.length === 0) {
            return interaction.reply({ embeds: [errorEmbed('No Teams', 'No teams registered in this tournament.')], ephemeral: true });
        }

        const options = registeredTeams.map(t => ({
            label: t.name,
            value: `${t.id}`,
            emoji: '🛡️',
        })).slice(0, 25);

        const menu = new StringSelectMenuBuilder()
            .setCustomId(`editstandings_team_${tournament.id}_${interaction.user.id}`)
            .setPlaceholder('Select a team to edit...')
            .addOptions(options);

        await interaction.reply({
            content: '## 📝 Edit Standings\nSelect the team to modify:',
            components: [new ActionRowBuilder().addComponents(menu)],
            ephemeral: true,
        });
    },
};

// ─── Team selected → show edit modal ─────────────────────────
selectHandler.register('editstandings_team_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const teamId = parseInt(interaction.values[0]);
    const team = teamDb.getById(teamId);

    // Get aggregate stats from team members
    const members = teamDb.getMembers(teamId);
    const totalWins = members.reduce((sum, m) => sum + m.wins, 0);
    const totalLosses = members.reduce((sum, m) => sum + m.losses, 0);

    const modal = new ModalBuilder()
        .setCustomId(`editstandings_save_${tournamentId}_${teamId}_${interaction.user.id}`)
        .setTitle(`Edit: ${team.name}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('wins')
                .setLabel(`Wins (current: ${totalWins})`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(`${totalWins}`)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('losses')
                .setLabel(`Losses (current: ${totalLosses})`)
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(`${totalLosses}`)
        ),
    );

    await interaction.showModal(modal);
});

// ─── Save standings edit ─────────────────────────────────────
modalHandler.register('editstandings_save_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const tournamentId = parseInt(parts[2]);
    const teamId = parseInt(parts[3]);
    const originalUserId = parts[4];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const newWins = parseInt(interaction.fields.getTextInputValue('wins'));
    const newLosses = parseInt(interaction.fields.getTextInputValue('losses'));

    if (isNaN(newWins) || isNaN(newLosses)) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Input', 'Wins and losses must be numbers.')], ephemeral: true });
    }

    const team = teamDb.getById(teamId);
    const members = teamDb.getMembers(teamId);

    // Get old stats
    const oldWins = members.reduce((sum, m) => sum + m.wins, 0);
    const oldLosses = members.reduce((sum, m) => sum + m.losses, 0);

    // Distribute changes evenly across members (captain gets remainder)
    const { players } = require('../../database/db');
    if (members.length > 0) {
        const winsPerMember = Math.floor(newWins / members.length);
        const lossesPerMember = Math.floor(newLosses / members.length);
        const extraWins = newWins % members.length;
        const extraLosses = newLosses % members.length;

        members.forEach((m, i) => {
            const w = winsPerMember + (i === 0 ? extraWins : 0);
            const l = lossesPerMember + (i === 0 ? extraLosses : 0);
            players.update(m.discord_id, { wins: w, losses: l });
        });
    }

    const tournament = tournaments.getById(tournamentId);
    logOwnerAction(interaction.guild.id, interaction.user.id, 'EDIT_STANDINGS', team.name, {
        teamId,
        oldWins,
        oldLosses,
        newWins,
        newLosses,
    });

    logger.info(`Standings edited: ${team.name} → W:${oldWins}→${newWins} L:${oldLosses}→${newLosses}`);

    await interaction.reply({
        embeds: [successEmbed('Standings Updated', `**${team.name}** standings updated:\n\n📈 **Wins:** ${oldWins} → ${newWins}\n📉 **Losses:** ${oldLosses} → ${newLosses}\n\n*All changes logged.*`)],
        ephemeral: true,
    });
});
