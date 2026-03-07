const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { ensureRegistered } = require('../../middleware/auth');
const { successEmbed, errorEmbed, infoEmbed } = require('../../utils/embeds');
const { getGame, getGameChoices } = require('../../utils/gameConstants');
const { generateUUID, getPublicUrl } = require('../../utils/helpers');
const { handleCommandError } = require('../../utils/errorHandler');
const { ERRORS, TITLES } = require('../../utils/constants');
const config = require('../../config');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('team')
        .setDescription('Team management commands')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Create a new team/franchise')
                .addStringOption(opt =>
                    opt.setName('name').setDescription('Team name').setRequired(true).setMaxLength(50))
                .addStringOption(opt =>
                    opt.setName('game').setDescription('Primary game').setRequired(true).addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('invite')
                .setDescription('Invite a player to your roster')
                .addUserOption(opt =>
                    opt.setName('player').setDescription('Player to invite').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('game').setDescription('Game roster').setRequired(true).addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('leave')
                .setDescription('Leave your current roster')
                .addStringOption(opt =>
                    opt.setName('game').setDescription('Game roster to leave').setRequired(true).addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Remove a member from your roster (captain only)')
                .addUserOption(opt =>
                    opt.setName('player').setDescription('Player to remove').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('game').setDescription('Game roster').setRequired(true).addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('transfer')
                .setDescription('Transfer captain/leader role to another member')
                .addUserOption(opt =>
                    opt.setName('player').setDescription('New captain').setRequired(true))
                .addStringOption(opt =>
                    opt.setName('game').setDescription('Game roster').setRequired(true).addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('roster')
                .setDescription('View roster members')
                .addStringOption(opt =>
                    opt.setName('game').setDescription('Game roster').setRequired(true).addChoices(...getGameChoices())))
        .addSubcommand(sub =>
            sub.setName('profile')
                .setDescription('View team/franchise profile')),

    async execute(interaction) {
        try {
            const sub = interaction.options.getSubcommand();

            switch (sub) {
                case 'create': return await handleCreate(interaction);
                case 'invite': return await handleInvite(interaction);
                case 'leave': return await handleLeave(interaction);
                case 'remove': return await handleRemove(interaction);
                case 'transfer': return await handleTransfer(interaction);
                case 'roster': return await handleRoster(interaction);
                case 'profile': return await handleProfile(interaction);
            }
        } catch (error) {
            await handleCommandError(interaction, error);
        }
    },
};

// ---------- CREATE ----------
async function handleCreate(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const teamName = interaction.options.getString('name');
        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        // Check if user already owns a franchise
        if (user.Is_Owner) {
            const { data: existing } = await supabase
                .from('Franchise')
                .select('Franchise_Name')
                .eq('Owner_ID', user.UUID)
                .single();

            if (existing) {
                return interaction.editReply({
                    embeds: [errorEmbed(TITLES.ERROR, `You already own **${existing.Franchise_Name}**. You can only own one franchise.`)],
                });
            }
        }

        // Check if team name is taken
        const { data: nameTaken } = await supabase
            .from('Franchise')
            .select('Franchise_Name')
            .eq('Franchise_Name', teamName)
            .single();

        if (nameTaken) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `A team named **${teamName}** already exists. Please choose another name.`)],
            });
        }

        // Check if user has a game profile for this game
        const { data: gameProfile } = await supabase
            .from(game.memberTable)
            .select('User_UUID')
            .eq('User_UUID', user.UUID)
            .single();

        if (!gameProfile) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `You need a **${game.name}** profile first.\nUse \`/games add ${gameKey}\` to create one.`)],
            });
        }

        const franchiseUUID = generateUUID('fra-');
        const rosterUUID = generateUUID('ros-');

        // Create Franchise
        const { error: franError } = await supabase
            .from('Franchise')
            .insert({
                Franchise_Name: teamName,
                Franchise_UUID: franchiseUUID,
                Owner_ID: user.UUID,
                Created_At: new Date().toISOString(),
            });

        if (franError) throw franError;

        // Create game-specific Roster
        const rosterData = {
            Franchise_UUID: franchiseUUID,
            [game.leaderField]: user.UUID,
            Roster_UUID: rosterUUID,
            Member_Size: 1,
            Created_At: new Date().toISOString(),
        };

        const { error: rosterError } = await supabase
            .from(game.rosterTable)
            .insert(rosterData);

        if (rosterError) throw rosterError;

        // Link user to roster in game member table
        const { error: memberError } = await supabase
            .from(game.memberTable)
            .update({ Roster_UUID: rosterUUID })
            .eq('User_UUID', user.UUID);

        if (memberError) throw memberError;

        // Update user flags
        await supabase.from('User').update({
            In_Team: true,
            Is_Owner: true,
            Updated_At: new Date().toISOString(),
        }).eq('UUID', user.UUID);

        // Create Discord role + channel
        let roleId = null;
        let channelId = null;
        try {
            const guild = interaction.guild;
            const role = await guild.roles.create({
                name: `Team ${teamName}`,
                color: config.embedColor,
                reason: `Outplayed — Team created by ${interaction.user.tag}`,
            });
            roleId = role.id;

            const member = await guild.members.fetch(interaction.user.id);
            await member.roles.add(role);

            const channel = await guild.channels.create({
                name: `team-${teamName.toLowerCase().replace(/\s+/g, '-')}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                ],
                reason: `Outplayed — Team channel for ${teamName}`,
            });
            channelId = channel.id;

            // Send welcome message in team channel
            await channel.send({
                embeds: [
                    infoEmbed(`🏠 Welcome to ${teamName}!`, `This is your private team channel.\n\n**Captain:** ${interaction.user}\n**Game:** ${game.emoji} ${game.name}\n\n**Invite teammates:**\n\`/team invite @player ${gameKey}\`\n\n**View roster:**\n\`/team roster ${gameKey}\``),
                ],
            });
        } catch (discordErr) {
            logger.warn('Could not create Discord role/channel:', discordErr.message);
        }

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `**${teamName}** has been created!\n\n**Game:** ${game.emoji} ${game.name}\n**Franchise ID:** \`${franchiseUUID}\`\n**Roster ID:** \`${rosterUUID}\`\n${channelId ? `**Channel:** <#${channelId}>` : ''}\n\nInvite players with \`/team invite @player ${gameKey}\``)],
        });

    } catch (err) {
        await handleCommandError(interaction, err);
    }
}

// ---------- INVITE ----------
async function handleInvite(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetDiscordUser = interaction.options.getUser('player');
        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        // Get franchise owned by user
        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_UUID, Franchise_Name')
            .eq('Owner_ID', user.UUID)
            .single();

        if (!franchise) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, ERRORS.TEAM_REQUIRED)],
            });
        }

        // Get roster
        const { data: roster } = await supabase
            .from(game.rosterTable)
            .select('Roster_UUID, Member_Size')
            .eq('Franchise_UUID', franchise.Franchise_UUID)
            .single();

        if (!roster) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `Your team doesn't have a **${game.name}** roster.`)],
            });
        }

        // Check if target user is registered
        const { data: targetUser } = await supabase
            .from('User')
            .select('UUID, Name')
            .eq('Discord_ID', targetDiscordUser.id)
            .single();

        if (!targetUser) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `${targetDiscordUser.tag} hasn't registered on Outplayed yet.`)],
            });
        }

        // Check if target has game profile
        const { data: targetGameProfile } = await supabase
            .from(game.memberTable)
            .select('User_UUID, Roster_UUID')
            .eq('User_UUID', targetUser.UUID)
            .single();

        if (!targetGameProfile) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `${targetDiscordUser.tag} doesn't have a **${game.name}** profile.`)],
            });
        }

        if (targetGameProfile.Roster_UUID) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `${targetDiscordUser.tag} is already in a roster for **${game.name}**.`)],
            });
        }

        // Check for existing pending invite
        const { data: existingInvite } = await supabase
            .from('RosterInvitation')
            .select('Invite_ID')
            .eq('Recipient_UUID', targetUser.UUID)
            .eq('Roster_UUID', roster.Roster_UUID)
            .eq('Status', 'pending')
            .single();

        if (existingInvite) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `${targetDiscordUser.tag} already has a pending invite to your roster.`)],
            });
        }

        // Create invitation
        const inviteUUID = generateUUID('inv-');
        const notiUUID = generateUUID('noti-');

        const { error: inviteErr } = await supabase
            .from('RosterInvitation')
            .insert({
                Franchise_UUID: franchise.Franchise_UUID,
                Recipient_UUID: targetUser.UUID,
                Sender_UUID: user.UUID,
                Roster_UUID: roster.Roster_UUID,
                Status: 'pending',
                Invite_UUID: inviteUUID,
                Notification_UUID: notiUUID,
                Created_At: new Date().toISOString(),
            });

        if (inviteErr) {
            throw inviteErr;
        }

        // Create notification
        await supabase.from('Notification').insert({
            Sender_UUID: user.UUID,
            Receiver_UUID: targetUser.UUID,
            Notification_Type: 'roster_invite',
            Notification_UUID: notiUUID,
            Data: JSON.stringify({
                franchise: franchise.Franchise_Name,
                game: game.name,
                inviteUUID,
            }),
            Created_At: new Date().toISOString(),
        });

        // Send DM with accept/reject buttons
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(config.embedColor)
                .setTitle('📨 Team Invite!')
                .setDescription(`**${interaction.user.tag}** has invited you to join **${franchise.Franchise_Name}** for **${game.emoji} ${game.name}**!`)
                .setFooter({ text: config.botName })
                .setTimestamp();

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`team_accept_${inviteUUID}`)
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`team_reject_${inviteUUID}`)
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌'),
            );

            await targetDiscordUser.send({ embeds: [dmEmbed], components: [buttons] });
        } catch (dmErr) {
            logger.warn('Could not DM user:', dmErr.message);
        }

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `Invitation sent to **${targetDiscordUser.tag}** for **${game.emoji} ${game.name}** roster!`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// ---------- LEAVE ----------
async function handleLeave(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        // Check game profile and roster
        const { data: member } = await supabase
            .from(game.memberTable)
            .select('User_UUID, Roster_UUID')
            .eq('User_UUID', user.UUID)
            .single();

        if (!member || !member.Roster_UUID) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `You're not in any **${game.name}** roster.`)],
            });
        }

        // Check if user is the roster leader
        const { data: roster } = await supabase
            .from(game.rosterTable)
            .select(`*, Franchise_UUID`)
            .eq('Roster_UUID', member.Roster_UUID)
            .single();

        if (roster && roster[game.leaderField] === user.UUID) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, 'Transfer captain role to another member first with `/team transfer @player`, or disband the team.')],
            });
        }

        // Remove from roster
        await supabase
            .from(game.memberTable)
            .update({ Roster_UUID: null })
            .eq('User_UUID', user.UUID);

        // Decrement member size
        if (roster) {
            await supabase
                .from(game.rosterTable)
                .update({ Member_Size: Math.max(0, (roster.Member_Size || 1) - 1) })
                .eq('Roster_UUID', member.Roster_UUID);
        }

        // Update user flag
        await supabase.from('User').update({ In_Team: false, Updated_At: new Date().toISOString() }).eq('UUID', user.UUID);

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `You've left your **${game.name}** roster.`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// ---------- REMOVE ----------
async function handleRemove(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetDiscordUser = interaction.options.getUser('player');
        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        // Verify user is a roster leader
        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_UUID, Franchise_Name')
            .eq('Owner_ID', user.UUID)
            .single();

        if (!franchise) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, 'Only the team owner can remove members.')],
            });
        }

        const { data: roster } = await supabase
            .from(game.rosterTable)
            .select('Roster_UUID')
            .eq('Franchise_UUID', franchise.Franchise_UUID)
            .single();

        if (!roster) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `Your team doesn't have a **${game.name}** roster.`)],
            });
        }

        // Get target user
        const { data: targetUser } = await supabase
            .from('User')
            .select('UUID')
            .eq('Discord_ID', targetDiscordUser.id)
            .single();

        if (!targetUser) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `${targetDiscordUser.tag} is not registered.`)],
            });
        }

        // Remove from roster
        const { error } = await supabase
            .from(game.memberTable)
            .update({ Roster_UUID: null })
            .eq('User_UUID', targetUser.UUID)
            .eq('Roster_UUID', roster.Roster_UUID);

        if (error) {
            throw error;
        }

        // Decrement roster size
        const { data: currentRoster } = await supabase
            .from(game.rosterTable)
            .select('Member_Size')
            .eq('Roster_UUID', roster.Roster_UUID)
            .single();

        await supabase
            .from(game.rosterTable)
            .update({ Member_Size: Math.max(0, (currentRoster?.Member_Size || 1) - 1) })
            .eq('Roster_UUID', roster.Roster_UUID);

        await supabase.from('User').update({ In_Team: false }).eq('UUID', targetUser.UUID);

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `**${targetDiscordUser.tag}** has been removed from the **${game.name}** roster.`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// ---------- TRANSFER ----------
async function handleTransfer(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetDiscordUser = interaction.options.getUser('player');
        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        // Verify ownership
        const { data: franchise } = await supabase
            .from('Franchise')
            .select('Franchise_UUID, Franchise_Name')
            .eq('Owner_ID', user.UUID)
            .single();

        if (!franchise) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, 'Only the team owner can transfer captain role.')],
            });
        }

        // Get target user
        const { data: targetUser } = await supabase
            .from('User')
            .select('UUID')
            .eq('Discord_ID', targetDiscordUser.id)
            .single();

        if (!targetUser) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.NOT_FOUND, `${targetDiscordUser.tag} is not registered.`)],
            });
        }

        // Check target is in the roster
        const { data: targetMember } = await supabase
            .from(game.memberTable)
            .select('Roster_UUID')
            .eq('User_UUID', targetUser.UUID)
            .single();

        const { data: roster } = await supabase
            .from(game.rosterTable)
            .select('Roster_UUID')
            .eq('Franchise_UUID', franchise.Franchise_UUID)
            .single();

        if (!targetMember || targetMember.Roster_UUID !== roster?.Roster_UUID) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `${targetDiscordUser.tag} is not in your **${game.name}** roster.`)],
            });
        }

        // Transfer leader
        await supabase
            .from(game.rosterTable)
            .update({ [game.leaderField]: targetUser.UUID })
            .eq('Roster_UUID', roster.Roster_UUID);

        // Transfer franchise ownership
        await supabase
            .from('Franchise')
            .update({ Owner_ID: targetUser.UUID })
            .eq('Franchise_UUID', franchise.Franchise_UUID);

        await supabase.from('User').update({ Is_Owner: false }).eq('UUID', user.UUID);
        await supabase.from('User').update({ Is_Owner: true }).eq('UUID', targetUser.UUID);

        return interaction.editReply({
            embeds: [successEmbed(TITLES.SUCCESS, `**${targetDiscordUser.tag}** is now the captain of **${franchise.Franchise_Name}** (${game.name} roster).`)],
        });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// ---------- ROSTER ----------
async function handleRoster(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply();

        const gameKey = interaction.options.getString('game');
        const game = getGame(gameKey);

        // Get user's game member entry to find roster
        const { data: member } = await supabase
            .from(game.memberTable)
            .select('Roster_UUID')
            .eq('User_UUID', user.UUID)
            .single();

        if (!member || !member.Roster_UUID) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, `You're not in any **${game.name}** roster.\nCreate one with \`/team create\` or accept an invite.`)],
            });
        }

        // Get all members in this roster
        const { data: members, error } = await supabase
            .from(game.memberTable)
            .select('User_UUID, In_Game_Name, Game_ID, Role, Rank, Status')
            .eq('Roster_UUID', member.Roster_UUID);

        if (error || !members || members.length === 0) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, 'Could not find roster members.')],
            });
        }

        // Get roster info
        const { data: roster } = await supabase
            .from(game.rosterTable)
            .select(`*, Franchise_UUID`)
            .eq('Roster_UUID', member.Roster_UUID)
            .single();

        // Get franchise name
        let franchiseName = 'Unknown';
        if (roster?.Franchise_UUID) {
            const { data: franchise } = await supabase
                .from('Franchise')
                .select('Franchise_Name')
                .eq('Franchise_UUID', roster.Franchise_UUID)
                .single();
            if (franchise) franchiseName = franchise.Franchise_Name;
        }

        // Build member list
        const memberList = members.map((m, i) => {
            const isLeader = roster && roster[game.leaderField] === m.User_UUID;
            return `${i + 1}. **${m.In_Game_Name}** ${isLeader ? '👑' : ''}\n   ID: \`${m.Game_ID}\` | Role: ${m.Role || 'N/A'} | Rank: ${m.Rank || 'N/A'}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`${game.emoji} ${franchiseName} — ${game.name} Roster`)
            .setDescription(memberList)
            .addFields(
                { name: 'Members', value: `${members.length}`, inline: true },
                { name: 'Roster ID', value: `\`${member.Roster_UUID}\``, inline: true },
            )
            .setFooter({ text: config.botName })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// ---------- PROFILE (Team) ----------
async function handleProfile(interaction) {
    try {
        const user = await ensureRegistered(interaction);
        if (!user) return;

        await interaction.deferReply();

        // Find franchise the user is part of (either owner or member)
        let franchise = null;

        // Check if user is owner
        const { data: ownedFranchise } = await supabase
            .from('Franchise')
            .select('*')
            .eq('Owner_ID', user.UUID)
            .single();

        if (ownedFranchise) {
            franchise = ownedFranchise;
        } else {
            // Check rosters across games
            const { getGameKeys, getGame } = require('../../utils/gameConstants');
            for (const gKey of getGameKeys()) {
                const g = getGame(gKey);
                const { data: member } = await supabase
                    .from(g.memberTable)
                    .select('Roster_UUID')
                    .eq('User_UUID', user.UUID)
                    .single();

                if (member?.Roster_UUID) {
                    const { data: roster } = await supabase
                        .from(g.rosterTable)
                        .select('Franchise_UUID')
                        .eq('Roster_UUID', member.Roster_UUID)
                        .single();

                    if (roster?.Franchise_UUID) {
                        const { data: f } = await supabase
                            .from('Franchise')
                            .select('*')
                            .eq('Franchise_UUID', roster.Franchise_UUID)
                            .single();
                        if (f) { franchise = f; break; }
                    }
                }
            }
        }

        if (!franchise) {
            return interaction.editReply({
                embeds: [errorEmbed(TITLES.ERROR, 'You\'re not in any team. Create one with `/team create`.')],
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle(`🏠 ${franchise.Franchise_Name}`)
            .setDescription(franchise.Description || 'No description set.')
            .addFields(
                { name: 'Franchise ID', value: `\`${franchise.Franchise_UUID}\``, inline: true },
                { name: 'Created', value: franchise.Created_At ? new Date(franchise.Created_At).toLocaleDateString() : 'N/A', inline: true },
            )
            .setFooter({ text: config.botName })
            .setTimestamp();

        if (franchise.Franchise_Logo_Path) {
            const url = getPublicUrl(franchise.Franchise_Logo_Path);
            if (url) embed.setThumbnail(url);
        }
        if (franchise.Banner_Path) {
            const url = getPublicUrl(franchise.Banner_Path);
            if (url) embed.setImage(url);
        }

        return interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleCommandError(interaction, error);
    }
}

// ---------- BUTTON HANDLERS ----------
async function handleTeamAccept(interaction) {
    const inviteUUID = interaction.customId.replace('team_accept_', '');

    await interaction.deferUpdate();

    // Find invitation
    const { data: invite, error } = await supabase
        .from('RosterInvitation')
        .select('*, Franchise_UUID, Roster_UUID, Recipient_UUID')
        .eq('Invite_UUID', inviteUUID)
        .eq('Status', 'pending')
        .single();

    if (error || !invite) {
        return interaction.editReply({
            content: '',
            embeds: [errorEmbed('Invalid Invite', 'This invite has expired or already been used.')],
            components: [],
        });
    }

    // Determine game from roster UUID — check all roster tables
    let game = null;
    for (const gKey of require('../../utils/gameConstants').getGameKeys()) {
        const g = getGame(gKey);
        const { data: roster } = await supabase
            .from(g.rosterTable)
            .select('Roster_UUID')
            .eq('Roster_UUID', invite.Roster_UUID)
            .single();
        if (roster) { game = g; break; }
    }

    if (!game) {
        return interaction.editReply({
            content: '',
            embeds: [errorEmbed('Error', 'Could not find the roster for this invite.')],
            components: [],
        });
    }

    // Update invitation status
    await supabase
        .from('RosterInvitation')
        .update({ Status: 'accepted', Updated_At: new Date().toISOString() })
        .eq('Invite_UUID', inviteUUID);

    // Link user to roster
    await supabase
        .from(game.memberTable)
        .update({ Roster_UUID: invite.Roster_UUID })
        .eq('User_UUID', invite.Recipient_UUID);

    // Increment member count
    const { data: roster } = await supabase
        .from(game.rosterTable)
        .select('Member_Size')
        .eq('Roster_UUID', invite.Roster_UUID)
        .single();

    await supabase
        .from(game.rosterTable)
        .update({ Member_Size: (roster?.Member_Size || 0) + 1 })
        .eq('Roster_UUID', invite.Roster_UUID);

    // Update user
    await supabase.from('User').update({ In_Team: true, Updated_At: new Date().toISOString() }).eq('UUID', invite.Recipient_UUID);

    // Update notification
    if (invite.Notification_UUID) {
        await supabase.from('Notification').update({ Status: 'read' }).eq('Notification_UUID', invite.Notification_UUID);
    }

    // Get franchise name
    const { data: franchise } = await supabase
        .from('Franchise')
        .select('Franchise_Name')
        .eq('Franchise_UUID', invite.Franchise_UUID)
        .single();

    return interaction.editReply({
        content: '',
        embeds: [successEmbed('Invite Accepted! 🎉', `You've joined **${franchise?.Franchise_Name || 'the team'}**'s ${game.emoji} ${game.name} roster!`)],
        components: [],
    });
}

async function handleTeamReject(interaction) {
    const inviteUUID = interaction.customId.replace('team_reject_', '');

    await interaction.deferUpdate();

    await supabase
        .from('RosterInvitation')
        .update({ Status: 'rejected', Updated_At: new Date().toISOString() })
        .eq('Invite_UUID', inviteUUID);

    return interaction.editReply({
        content: '',
        embeds: [infoEmbed('Invite Declined', 'You\'ve declined the team invitation.')],
        components: [],
    });
}

module.exports.handleTeamAccept = handleTeamAccept;
module.exports.handleTeamReject = handleTeamReject;
