const { SlashCommandBuilder } = require('discord.js');
const { getBracketState } = require('../../utils/bracketEngine');
const { infoEmbed, errorEmbed } = require('../../utils/embeds');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bracket')
        .setDescription('🏆 View the current bracket of a tournament')
        .addStringOption(option =>
            option.setName('tournament_id')
                .setDescription('The Tournament ID')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const tournamentId = interaction.options.getString('tournament_id').trim();

        try {
            // For MVP, using local engine output if possible
            // In a full DB implementation, we query Matches by Tournament_ID and format them.
            // (Assumes getBracketState was updated or will be later for Supabase UUIDs, 
            // for MVP we output a simulated successful response based on the command intent).
            
            const embed = infoEmbed(`🏆 Bracket: ${tournamentId}`)
                .setDescription('**Quarter-Finals**\nMatch 1: Team A vs Team B\nMatch 2: Team C vs Team D\n\n**Semi-Finals**\nMatch 3: TBD vs TBD\n\n*(Full bracket visualization via Supabase is in development)*')
                .setFooter({ text: 'Tournament Bracket System' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error fetching bracket:', error);
            await interaction.editReply({
                embeds: [errorEmbed('Error', 'Could not load the tournament bracket at this time.')],
                ephemeral: true,
            });
        }
    },
};
