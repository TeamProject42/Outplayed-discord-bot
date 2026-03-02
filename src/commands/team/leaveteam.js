const { SlashCommandBuilder } = require('discord.js');
const { players, teams, queue } = require('../../database/db');
const { successEmbed, errorEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaveteam')
        .setDescription('🚪 Leave your current team')
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Team code to leave (required if in multiple teams)')
                .setRequired(false)
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

        const playerTeams = teams.getByPlayer(interaction.user.id);

        if (playerTeams.length === 0) {
            return interaction.reply({
                embeds: [errorEmbed('No Team', 'You\'re not in any team.')],
                ephemeral: true,
            });
        }

        let team;
        const code = interaction.options.getString('code');

        if (code) {
            team = playerTeams.find(t => t.code.toUpperCase() === code.toUpperCase().trim());
            if (!team) {
                return interaction.reply({
                    embeds: [errorEmbed('Not Found', `You're not in a team with code \`${code}\`.`)],
                    ephemeral: true,
                });
            }
        } else if (playerTeams.length === 1) {
            team = playerTeams[0];
        } else {
            const teamList = playerTeams.map(t => `• **${t.name}** — Code: \`${t.code}\``).join('\n');
            return interaction.reply({
                embeds: [errorEmbed('Multiple Teams', `You're in multiple teams. Specify which one:\n\n${teamList}\n\nUse: \`/leaveteam code:<team_code>\``)],
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const isCaptain = team.captain_id === interaction.user.id;

        if (isCaptain) {
            const members = teams.getMembers(team.id);
            const otherMembers = members.filter(m => m.discord_id !== interaction.user.id);

            if (otherMembers.length === 0) {
                // Only member — disband team
                if (team.channel_id) {
                    try {
                        const channel = await guild.channels.fetch(team.channel_id);
                        if (channel) {
                            await channel.send({ content: `## 🚪 Team Disbanded\n**${team.name}** has been disbanded because the captain left and no members remain. Deleting in 10s.` });
                            setTimeout(() => channel.delete('Captain left, team disbanded').catch(() => { }), 10_000);
                        }
                    } catch (_) { }
                }
                if (team.voice_channel_id) {
                    try {
                        const vc = await guild.channels.fetch(team.voice_channel_id);
                        if (vc) setTimeout(() => vc.delete('Captain left, team disbanded').catch(() => { }), 10_000);
                    } catch (_) { }
                }

                teams.delete(team.id);
                logger.info(`Team disbanded (captain left, empty): ${team.name} (${team.code})`);

                return interaction.editReply({
                    embeds: [successEmbed('Team Disbanded', `You were the only member. **${team.name}** has been disbanded.`)],
                });
            } else {
                // Transfer captaincy to next member
                const newCaptain = otherMembers[0];
                teams.transferCaptain(team.id, newCaptain.discord_id);
                teams.removeMember(team.id, interaction.user.id);
                teams.decrementSize(team.id);

                if (team.locked) teams.unlock(team.id);

                // Remove channel permissions & announce
                if (team.channel_id) {
                    try {
                        const channel = await guild.channels.fetch(team.channel_id);
                        if (channel) {
                            await channel.permissionOverwrites.delete(interaction.user.id).catch(() => { });
                            await channel.send({
                                content: `## 🚪 Captain Left\n<@${interaction.user.id}> has left the team.\n\n👑 **<@${newCaptain.discord_id}> is now the new captain!**`,
                            });
                        }
                    } catch (_) { }
                }
                if (team.voice_channel_id) {
                    try {
                        const vc = await guild.channels.fetch(team.voice_channel_id);
                        if (vc) await vc.permissionOverwrites.delete(interaction.user.id).catch(() => { });
                    } catch (_) { }
                }

                logger.info(`Captain left: ${interaction.user.tag} from ${team.name}. New captain: ${newCaptain.discord_id}`);

                return interaction.editReply({
                    embeds: [successEmbed('Left Team', `You've left **${team.name}**.\n\n👑 <@${newCaptain.discord_id}> is now the new captain.`)],
                });
            }
        } else {
            // Regular member leaving
            teams.removeMember(team.id, interaction.user.id);
            teams.decrementSize(team.id);

            if (team.locked) teams.unlock(team.id);

            if (team.channel_id) {
                try {
                    const channel = await guild.channels.fetch(team.channel_id);
                    if (channel) {
                        await channel.permissionOverwrites.delete(interaction.user.id).catch(() => { });
                        await channel.send({ content: `## 🚪 Member Left\n<@${interaction.user.id}> has left the team.` });
                    }
                } catch (_) { }
            }
            if (team.voice_channel_id) {
                try {
                    const vc = await guild.channels.fetch(team.voice_channel_id);
                    if (vc) await vc.permissionOverwrites.delete(interaction.user.id).catch(() => { });
                } catch (_) { }
            }

            logger.info(`Member left: ${interaction.user.tag} from ${team.name} (${team.code})`);

            // Check if team is now empty — auto-disband
            const updatedTeam = teams.getById(team.id);
            const remainingMembers = teams.getMembers(team.id);
            if (remainingMembers.length === 0) {
                if (updatedTeam?.channel_id) {
                    try {
                        const ch = await guild.channels.fetch(updatedTeam.channel_id);
                        if (ch) setTimeout(() => ch.delete('Team empty').catch(() => { }), 5_000);
                    } catch (_) { }
                }
                if (updatedTeam?.voice_channel_id) {
                    try {
                        const vc = await guild.channels.fetch(updatedTeam.voice_channel_id);
                        if (vc) setTimeout(() => vc.delete('Team empty').catch(() => { }), 5_000);
                    } catch (_) { }
                }
                teams.delete(team.id);
                logger.info(`Team auto-disbanded (empty after leave): ${team.name} (${team.code})`);

                return interaction.editReply({
                    embeds: [successEmbed('Team Disbanded', `You were the last member. **${team.name}** has been disbanded.`)],
                });
            }

            return interaction.editReply({
                embeds: [successEmbed('Left Team', `You've left **${team.name}**.`)],
            });
        }
    },
};
