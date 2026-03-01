const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { players, teams, queue } = require('../../database/db');
const { successEmbed, errorEmbed, teamEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jointeam')
        .setDescription('🤝 Join a team using an invite code')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('The 6-character team invite code')
                .setRequired(true)
                .setMaxLength(10)
        ),

    async execute(interaction) {
        const player = players.get(interaction.user.id);
        if (!player) {
            return interaction.reply({
                embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                ephemeral: true,
            });
        }

        const code = interaction.options.getString('code').toUpperCase().trim();
        const team = teams.getByCode(code);

        if (!team) {
            return interaction.reply({
                embeds: [errorEmbed('Invalid Code', `No team found with code \`${code}\`. Double-check and try again.`)],
                ephemeral: true,
            });
        }

        if (team.locked || team.current_size >= team.size) {
            return interaction.reply({
                embeds: [errorEmbed('Team Full', `**${team.name}** is already full or locked.`)],
                ephemeral: true,
            });
        }

        const existingTeams = teams.getByPlayer(interaction.user.id);
        const alreadyInTeam = existingTeams.find(t => t.id === team.id);
        if (alreadyInTeam) {
            return interaction.reply({
                embeds: [errorEmbed('Already a Member', `You're already in **${team.name}**.`)],
                ephemeral: true,
            });
        }

        // If player is in matchmaking queue, auto-remove (mutual exclusivity)
        if (queue.isQueued(interaction.user.id)) {
            queue.remove(interaction.user.id);
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;

        // Add member to DB
        teams.addMember(team.id, interaction.user.id);
        teams.incrementSize(team.id);

        // Grant direct channel access (text + voice)
        if (team.channel_id) {
            try {
                const channel = await guild.channels.fetch(team.channel_id);
                if (channel) {
                    await channel.permissionOverwrites.create(interaction.user.id, {
                        ViewChannel: true,
                        SendMessages: true,
                    });
                }
            } catch (err) {
                console.log(`⚠️ Could not grant text channel access: ${err.message}`);
            }
        }
        if (team.voice_channel_id) {
            try {
                const vc = await guild.channels.fetch(team.voice_channel_id);
                if (vc) {
                    await vc.permissionOverwrites.create(interaction.user.id, {
                        ViewChannel: true,
                        Connect: true,
                        Speak: true,
                    });
                }
            } catch (err) {
                console.log(`⚠️ Could not grant voice channel access: ${err.message}`);
            }
        }

        // Check if team is now full
        const updatedTeam = teams.getById(team.id);
        if (updatedTeam.current_size >= updatedTeam.size) {
            teams.lock(team.id);
        }

        const finalTeam = teams.getById(team.id);
        const members = teams.getMembers(team.id);

        // Announce in team channel
        if (team.channel_id) {
            try {
                const channel = await guild.channels.fetch(team.channel_id);
                if (channel) {
                    await channel.send({
                        content: `## 🎉 New Teammate!\n<@${interaction.user.id}> has joined the team!`,
                        embeds: [teamEmbed(finalTeam, members)],
                    });

                    if (finalTeam.locked) {
                        await channel.send({
                            content: '## 🔒 Team Locked!\nAll spots are filled. Your team is ready for battle!',
                        });
                    }
                }
            } catch (_) { }
        }

        logger.info(`Player joined team: ${interaction.user.tag} → ${team.name} (${code})`);

        const voiceInfo = finalTeam.voice_channel_id ? `\n🔊 Voice: <#${finalTeam.voice_channel_id}>` : '';

        await interaction.editReply({
            embeds: [
                successEmbed('Joined Team!', `You've joined **${team.name}**!\n\n📢 Channel: <#${team.channel_id}>${voiceInfo}\n👥 Size: ${finalTeam.current_size}/${finalTeam.size}${finalTeam.locked ? '\n🔒 Team is now locked!' : ''}`),
            ],
        });
    },
};
