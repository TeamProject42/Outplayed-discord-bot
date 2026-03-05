const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ChannelType,
    PermissionFlagsBits,
} = require('discord.js');
const config = require('../../config');
const { users, franchises, gameProfiles, supabase } = require('../../database/supabase');
const { successEmbed, errorEmbed, teamEmbed } = require('../../utils/embeds');
const logger = require('../../utils/logger');
const buttonHandler = require('../../interactions/buttons');
const selectHandler = require('../../interactions/selectMenus');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createteam')
        .setDescription('🛡️ Create a new team (Franchise & Roster)')
        .addStringOption(option =>
            option.setName('name')
                .setDescription('Your team name')
                .setRequired(true)
                .setMaxLength(32)
        )
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Game for this roster')
                .setRequired(true)
                .addChoices(
                    Object.keys(config.games).map(k => ({ name: config.games[k].name, value: k }))
                )
        )
        .addIntegerOption(option =>
            option.setName('size')
                .setDescription('Team size (number of players, 2-10)')
                .setRequired(true)
                .setMinValue(2)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        try {
            const player = await users.getByDiscordId(interaction.user.id);
            if (!player) {
                return interaction.reply({
                    embeds: [errorEmbed('No Profile', 'Create a profile first with `/start`.')],
                    ephemeral: true,
                });
            }

            const teamName = interaction.options.getString('name');
            const gameKey = interaction.options.getString('game');
            const size = interaction.options.getInteger('size');

            // Find game definition
            const game = config.games[gameKey];
            if (!game) {
                 return interaction.reply({ content: 'Invalid game selected.', ephemeral: true });
            }

            await interaction.deferReply({ ephemeral: true });

            // Ensure player has a game profile for this game to be leader
            const memberTable = getMemberTableName(gameKey);
            const userGameProfile = await gameProfiles.get(memberTable, player.UUID);
            
            if (!userGameProfile) {
                 return interaction.editReply({
                     embeds: [errorEmbed('No Game Profile', `You must have a ${game.name} profile to create a team for it. Check \`/start\`.`)],
                 });
            }

            // Create franchise and roster
            // Our helper `franchises.create` creates the Franchise and Roster together
            const { franchise, roster } = await franchises.create(player.UUID, teamName, gameKey, {
                Member_Size: size,
                Roster_UUID: `rost-${Date.now()}` // Basic generator
            });

            // Make the user an owner
            await supabase.from('User').update({ Is_Owner: true }).eq('UUID', player.UUID);

            // Discord Channel Mapping (Optional MVP feature, simplified)
            const guild = interaction.guild;
            let textChannel = null;
            let voiceChannel = null;
            
            try {
                // Determine Category
                let category = guild.channels.cache.find(
                    c => c.type === ChannelType.GuildCategory && c.name === `${game.emoji} ${game.name}`
                );
                if (!category) {
                    category = await guild.channels.create({ name: `${game.emoji} ${game.name}`, type: ChannelType.GuildCategory });
                }

                const permissionOverwrites = [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                ];

                textChannel = await guild.channels.create({
                    name: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
                    type: ChannelType.GuildText,
                    parent: category?.id,
                    permissionOverwrites
                });

                voiceChannel = await guild.channels.create({
                    name: `🔊 ${teamName}`,
                    type: ChannelType.GuildVoice,
                    parent: category?.id,
                    permissionOverwrites
                });
            } catch (err) {
                logger.error(`Could not create channels: ${err.message}`);
            }

            logger.info(`Team created: ${teamName} by ${interaction.user.tag}`);

            // Embed payload
            const replyEmbed = successEmbed('Team Created!', `**${teamName}** (${game.name}) is ready!`)
                .addFields(
                    { name: '👥 Size', value: `1/${size}`, inline: true },
                    { name: 'Franchise ID', value: `\`${franchise.Franchise_UUID}\``, inline: false }
                );

            if (textChannel) replyEmbed.addFields({ name: '📢 Text Channel', value: `<#${textChannel.id}>`, inline: true });
            if (voiceChannel) replyEmbed.addFields({ name: '🔊 Voice Channel', value: `<#${voiceChannel.id}>`, inline: true });

            await interaction.editReply({ embeds: [replyEmbed] });

            if (textChannel) {
                 await textChannel.send(`## 🛡️ Welcome to **${teamName}**!\nInvite players using the Franchise ID: \`${franchise.Franchise_UUID}\``);
            }

        } catch (error) {
            logger.error(`Error creating team: ${error.message}`);
            if (error.code === '23505') {
                return interaction.editReply({ embeds: [errorEmbed('Failed', 'A team with this exact name already exists.')] });
            }
            return interaction.editReply({ embeds: [errorEmbed('Database Error', 'Could not create the team. Check console.')] });
        }
    },
};

function getMemberTableName(gameKey) {
    switch(gameKey) {
        case 'valo': return 'ValorantMember';
        case 'bgmi': return 'BgmiMember';
        case 'codm': return 'CODMobileMember';
        case 'mlbb': return 'MobaLegendsMember';
        default: return 'BgmiMember'; 
    }
}

// ─── Kick Member Button ──────────────────────────────────────
buttonHandler.register('team_kick_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const captainId = parts[3];

    // Allow captain OR server owner (owner is above captain)
    const isAdmin = interaction.member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator);
    if (interaction.user.id !== captainId && interaction.user.id !== interaction.guild.ownerId && !isAdmin) {
        return interaction.reply({ content: '⛔ Only the captain or server owner can kick members.', ephemeral: true });
    }

    const team = teams.getById(teamId);
    if (!team) {
        return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    }

    const members = teams.getMembers(teamId);
    const kickable = members.filter(m => m.discord_id !== team.captain_id);

    if (kickable.length === 0) {
        return interaction.reply({ content: '❌ No members to kick (captain is the only member).', ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`team_kickselect_${teamId}_${interaction.user.id}`)
        .setPlaceholder('Select member to kick...')
        .addOptions(kickable.map(m => ({
            label: m.player_id,
            description: `${m.game} — ${m.rank}`,
            value: m.discord_id,
            emoji: '👤',
        })));

    await interaction.reply({
        content: '## 👢 Kick Member\nSelect the member to remove:',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true,
    });
});

// ─── Kick Member Select ─────────────────────────────────────
selectHandler.register('team_kickselect_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const originalUserId = parts[3];

    if (interaction.user.id !== originalUserId) {
        return interaction.reply({ content: '⛔ Not your session.', ephemeral: true });
    }

    const kickedId = interaction.values[0];
    const team = teams.getById(teamId);

    if (!team) {
        return interaction.update({ content: '❌ Team not found.', components: [] });
    }

    // Remove member from DB
    teams.removeMember(teamId, kickedId);
    teams.decrementSize(teamId);

    // If team was locked, unlock since a spot opened
    if (team.locked) {
        teams.unlock(teamId);
    }

    // Remove channel permissions
    const guild = interaction.guild;
    if (team.channel_id) {
        try {
            const channel = await guild.channels.fetch(team.channel_id);
            if (channel) {
                await channel.permissionOverwrites.delete(kickedId).catch(() => { });
                await channel.send({ content: `## 👢 Member Kicked\n<@${kickedId}> has been removed from the team by <@${interaction.user.id}>.` });
            }
        } catch (_) { }
    }
    if (team.voice_channel_id) {
        try {
            const vc = await guild.channels.fetch(team.voice_channel_id);
            if (vc) await vc.permissionOverwrites.delete(kickedId).catch(() => { });
        } catch (_) { }
    }

    logger.info(`Member kicked: ${kickedId} from ${team.name} (${team.code}) by ${interaction.user.tag}`);

    // Check if team is now empty after kick — auto-disband if so
    const updatedTeam = teams.getById(teamId);
    const remainingMembers = teams.getMembers(teamId);
    if (remainingMembers.length === 0) {
        // Delete channels
        if (updatedTeam.channel_id) {
            try {
                const ch = await guild.channels.fetch(updatedTeam.channel_id);
                if (ch) setTimeout(() => ch.delete('Team empty').catch(() => { }), 5_000);
            } catch (_) { }
        }
        if (updatedTeam.voice_channel_id) {
            try {
                const vc = await guild.channels.fetch(updatedTeam.voice_channel_id);
                if (vc) setTimeout(() => vc.delete('Team empty').catch(() => { }), 5_000);
            } catch (_) { }
        }
        teams.delete(teamId);
        logger.info(`Team auto-disbanded (empty after kick): ${team.name} (${team.code})`);
    }

    await interaction.update({
        content: `✅ <@${kickedId}> has been kicked from **${team.name}**.`,
        components: [],
    });
});

// ─── Disband Team ────────────────────────────────────────────
buttonHandler.register('team_disband_', async (interaction) => {
    const parts = interaction.customId.split('_');
    const teamId = parseInt(parts[2]);
    const captainId = parts[3];

    // Allow captain OR server owner (owner is above captain)
    const isAdmin = interaction.member.permissions.has(require('discord.js').PermissionFlagsBits.Administrator);
    if (interaction.user.id !== captainId && interaction.user.id !== interaction.guild.ownerId && !isAdmin) {
        return interaction.reply({ content: '⛔ Only the captain or server owner can disband this team.', ephemeral: true });
    }

    const team = teams.getById(teamId);
    if (!team) {
        return interaction.reply({ content: '❌ Team not found.', ephemeral: true });
    }

    await interaction.deferUpdate();
    const guild = interaction.guild;

    // Delete text channel
    if (team.channel_id) {
        try {
            const channel = await guild.channels.fetch(team.channel_id);
            if (channel) {
                await channel.send({ embeds: [errorEmbed('Team Disbanded', `**${team.name}** has been disbanded. This channel will be deleted in 10 seconds.`)] });
                setTimeout(() => channel.delete('Team disbanded').catch(() => { }), 10_000);
            }
        } catch (_) { }
    }

    // Delete voice channel
    if (team.voice_channel_id) {
        try {
            const vc = await guild.channels.fetch(team.voice_channel_id);
            if (vc) setTimeout(() => vc.delete('Team disbanded').catch(() => { }), 10_000);
        } catch (_) { }
    }

    teams.delete(teamId);
    logger.info(`Team disbanded: ${team.name} (${team.code}) by ${interaction.user.tag}`);
});
