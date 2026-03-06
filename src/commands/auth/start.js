const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require('discord.js');
const { supabase } = require('../../database/supabase');
const { successEmbed, errorEmbed, infoEmbed, profileEmbed } = require('../../utils/embeds');
const { generateUUID } = require('../../utils/helpers');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Register your account and link your Discord to Outplayed'),

    async execute(interaction) {
        const discordId = interaction.user.id;

        // 1. Check if this Discord ID is already linked
        const { data: existing } = await supabase
            .from('User')
            .select('UUID, Name, Username, Region')
            .eq('PWA_Notification_Subscription', discordId)
            .single();

        if (existing) {
            return interaction.reply({
                embeds: [
                    infoEmbed('Already Registered', `You're already linked!\n\n**Name:** ${existing.Name || 'Not set'}\n**Username:** ${existing.Username || 'Not set'}\n**UUID:** \`${existing.UUID}\`\n**Region:** ${existing.Region || 'Not set'}\n\nUse \`/profile\` to view or edit your profile.`)
                ],
                ephemeral: true,
            });
        }

        // 2. Show registration modal
        const modal = new ModalBuilder()
            .setCustomId('start_register_modal')
            .setTitle('🎮 Register on Outplayed');

        const nameInput = new TextInputBuilder()
            .setCustomId('register_name')
            .setLabel('Your Display Name')
            .setPlaceholder('e.g. NinjaSlayer')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(50);

        const contactInput = new TextInputBuilder()
            .setCustomId('register_contact')
            .setLabel('Phone Number (with country code)')
            .setPlaceholder('e.g. +91XXXXXXXXXX')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(15);

        const regionInput = new TextInputBuilder()
            .setCustomId('register_region')
            .setLabel('Your Region')
            .setPlaceholder('e.g. South Asia, Europe, NA')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50);

        const countryInput = new TextInputBuilder()
            .setCustomId('register_country')
            .setLabel('Your Country')
            .setPlaceholder('e.g. India, USA, UK')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50);

        modal.addComponents(
            new ActionRowBuilder().addComponents(nameInput),
            new ActionRowBuilder().addComponents(contactInput),
            new ActionRowBuilder().addComponents(regionInput),
            new ActionRowBuilder().addComponents(countryInput),
        );

        await interaction.showModal(modal);
    },
};

/**
 * Handle the registration modal submission.
 * Called from interactions/modals.js
 *
 * Key logic:
 * - If contact matches an existing user → LINK the Discord ID to that account
 * - If no match → create a brand new account
 * - Discord ID is stored in PWA_Notification_Subscription (not Username)
 */
async function handleRegisterModal(interaction) {
    const discordId = interaction.user.id;
    const discordTag = interaction.user.tag;
    const discordAvatar = interaction.user.displayAvatarURL({ dynamic: true, size: 256 });

    const name = interaction.fields.getTextInputValue('register_name');
    const contact = interaction.fields.getTextInputValue('register_contact');
    const region = interaction.fields.getTextInputValue('register_region') || null;
    const country = interaction.fields.getTextInputValue('register_country') || null;

    await interaction.deferReply({ ephemeral: true });

    try {
        // Double-check Discord ID not already linked (race condition guard)
        const { data: alreadyLinked } = await supabase
            .from('User')
            .select('UUID')
            .eq('PWA_Notification_Subscription', discordId)
            .single();

        if (alreadyLinked) {
            return interaction.editReply({
                embeds: [errorEmbed('Already Registered', 'Your Discord is already linked to an account. Use `/profile` to view it.')],
            });
        }

        // Check if contact matches an existing user → LINK instead of reject
        const { data: existingUser } = await supabase
            .from('User')
            .select('*')
            .eq('Contact', contact)
            .single();

        if (existingUser) {
            // Check if this existing account is already linked to a different Discord user
            if (existingUser.PWA_Notification_Subscription && existingUser.PWA_Notification_Subscription !== discordId) {
                return interaction.editReply({
                    embeds: [errorEmbed('Already Linked', 'This phone number is linked to a different Discord account.')],
                });
            }

            // LINK: Set the Discord ID on the existing account
            const { error: linkError } = await supabase
                .from('User')
                .update({
                    PWA_Notification_Subscription: discordId,
                    Updated_At: new Date().toISOString(),
                })
                .eq('UUID', existingUser.UUID);

            if (linkError) {
                logger.error('Account linking error:', linkError);
                return interaction.editReply({
                    embeds: [errorEmbed('Linking Failed', `Could not link your Discord account: ${linkError.message}`)],
                });
            }

            // Assign Player role
            await assignPlayerRole(interaction, discordId);

            const embed = profileEmbed(existingUser);
            embed.setTitle('🔗 Account Linked!');
            embed.setDescription(`Your Discord has been linked to your existing Outplayed account!\n\n**Username:** ${existingUser.Username || 'N/A'}\n**Name:** ${existingUser.Name || name}\n\n**Next steps:**\n• \`/profile\` — View your profile\n• \`/games add\` — Add game profiles\n• \`/team create\` — Create a team\n• \`/tournaments list\` — Browse tournaments`);

            logger.success(`Account linked: ${discordTag} → ${existingUser.UUID}`);
            return interaction.editReply({ embeds: [embed] });
        }

        // No existing account — CREATE a new one
        const userUUID = generateUUID('usr-');

        const { data: newUser, error } = await supabase
            .from('User')
            .insert({
                Username: name.toLowerCase().replace(/\s+/g, '_'),
                Name: name,
                Contact: contact,
                Region: region,
                Country: country,
                UUID: userUUID,
                PWA_Notification_Subscription: discordId,
                Registration_Status: 'complete',
                Account_Status: 'active',
                Profile_Pic_Url: discordAvatar,
                Created_At: new Date().toISOString(),
                Updated_At: new Date().toISOString(),
                ISD_Code: contact.startsWith('+') ? contact.slice(0, contact.length - 10) : '+91',
                Privacy_Policy_And_Terms_and_Condition_Accepted: true,
                Accepted_At: new Date().toISOString(),
            })
            .select()
            .single();

        if (error) {
            logger.error('User registration error:', error);
            return interaction.editReply({
                embeds: [errorEmbed('Registration Failed', `Could not create your account: ${error.message}`)],
            });
        }

        // Assign Player role
        await assignPlayerRole(interaction, discordId);

        const embed = profileEmbed(newUser);
        embed.setTitle('🎉 Welcome to Outplayed!');
        embed.setDescription(`Account created successfully!\n\n**Next steps:**\n• \`/games add\` — Add your game profiles\n• \`/team create\` — Create a team\n• \`/tournaments list\` — Browse tournaments\n• \`/profile\` — View your profile`);

        logger.success(`User registered: ${discordTag} → ${userUUID}`);
        return interaction.editReply({ embeds: [embed] });

    } catch (err) {
        logger.error('Registration error:', err);
        return interaction.editReply({
            embeds: [errorEmbed('Error', 'An unexpected error occurred during registration. Please try again.')],
        });
    }
}

/**
 * Assign the "Player" Discord role to a user.
 */
async function assignPlayerRole(interaction, discordId) {
    try {
        const guild = interaction.guild;
        if (!guild) return;

        let playerRole = guild.roles.cache.find(r => r.name === 'Player');
        if (!playerRole) {
            playerRole = await guild.roles.create({
                name: 'Player',
                color: 0x7C3AED,
                reason: 'Outplayed bot — auto-created Player role',
            });
        }
        const member = await guild.members.fetch(discordId);
        await member.roles.add(playerRole);
    } catch (roleErr) {
        logger.warn('Could not assign Player role:', roleErr.message);
    }
}

module.exports.handleRegisterModal = handleRegisterModal;
