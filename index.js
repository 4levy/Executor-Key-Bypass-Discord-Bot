const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Routes, InteractionType, ActivityType, PermissionsBitField } = require('discord.js');
const { REST } = require('@discordjs/rest');
const axios = require('axios');
const { Queue } = require('queue-typescript');
const { Mutex } = require('async-mutex');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const serverRequests = new Map();
const requestQueue = new Map();
const processingLocks = new Map();

// Config bot
const botToken = 'BOT TOKEN'; // <-- Add your Bot token
const CLIENT_ID = 'BOT CLIENT ID'; // <-- Add your Bot client Id
const errorChannelId = 'ERROR CHANNEL'; // <-- Add your error channel ID
const logChannelId = 'LOG CHANNEL'; // <-- Add your log channel ID

function getApiLink(content, type) {
    const baseUrl = 'https://robloxexecutorth-api.vercel.app';
    const endpoints = {
        fluxus: 'fluxus',
        linkvertise: 'linkvertise',
        rekonise: 'rekonise',
        delta: 'delta',
        arceusx: 'arceusx'
    };

    return endpoints[type] ? `${baseUrl}/${endpoints[type]}?url=${content}` : null;
}

async function processNextRequest(guildId) {
    if (!processingLocks.has(guildId)) {
        processingLocks.set(guildId, new Mutex());
    }
    const lock = processingLocks.get(guildId);

    await lock.runExclusive(async () => {
        const queue = requestQueue.get(guildId);
        if (queue && queue.length > 0) {
            const { userId, interaction, apiLink, startTime } = queue.dequeue();
            serverRequests.get(guildId).set(userId, true);

            try {
                const response = await axios.get(apiLink);
                const jsonData = response.data;

                const bypassData = jsonData.bypassed || jsonData.key || jsonData.result;
                const deviceStatus = jsonData.device_status;
                const deviceInfo = jsonData.device_info;
                const timeTaken = (Date.now() - startTime) / 1000;

                let embed;
                if (bypassData) {
                    embed = new EmbedBuilder()
                        .setTitle('✅ | Bypass Successful!')
                        .setColor(0x2ECC71)
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setImage('https://i.ibb.co/whmq1ML/9c73d3f908912fede9cd9ab8af17dc83-4051502925.gif')
                        .addFields(
                            {
                                name: '🔑 **Key:**',
                                value: `\`\`\`diff\n+ ${bypassData}\n\`\`\``,
                                inline: false
                            },
                            {
                                name: '⏱️ **Time Taken:**',
                                value: `\`\`\`yaml\n${timeTaken.toFixed(2)} seconds\n\`\`\``,
                                inline: true
                            },
                            {
                                name: '📝 **Requested by:**',
                                value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``,
                                inline: true
                            }
                        );

                    if (deviceStatus) {
                        embed.addFields({
                            name: '📱 **Device Status:**',
                            value: `\`\`\`yaml\n${deviceStatus}\n\`\`\``,
                            inline: true
                        });
                    }

                    if (deviceInfo) {
                        embed.addFields({
                            name: '📱 **Device Info:**',
                            value: `\`\`\`yaml\n${deviceInfo}\n\`\`\``,
                            inline: true
                        });
                    }

                    // Send the embed to the log channel
                    const logChannel = client.channels.cache.get(logChannelId);
                    if (logChannel) {
                        logChannel.send({ embeds: [embed] });
                    } else {
                        console.error('Log channel is incorrect or not found');
                    }

                } else {
                    embed = new EmbedBuilder()
                        .setTitle('❌ | Bypass Failed')
                        .setDescription('Unable to process.')
                        .setColor(0xFF0000)
                        .addFields({ name: '⏱️ Attempt Time:', value: `\`\`\`yaml\n${timeTaken.toFixed(2)} seconds\n\`\`\``, inline: false });
                }

                const statusColor = response.status === 200 ? 0x2ECC71 : response.status >= 400 && response.status < 500 ? 0xF1C40F : 0xE74C3C;
                embed.setColor(statusColor);

                embed.setFooter({
                    text: `Made By 4levy | Server ${interaction.guild.name}`,
                });

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('```API is down, please try again later.```')
                    .setColor(0xFF0000);

                const errorChannel = client.channels.cache.get(errorChannelId);
                if (errorChannel) {
                    errorChannel.send({ embeds: [errorEmbed] });
                } else {
                    console.error('```❌ Error channel is incorrect or not found```');
                }

                await interaction.editReply({ embeds: [errorEmbed] });
            } finally {
                serverRequests.get(guildId).delete(userId);
                if (queue.length > 0) {
                    await processNextRequest(guildId);
                }
            }
        }
    });
}


client.once('ready', async () => {
    try {
        await client.user.setPresence({
            activities: [
                {
                    name: 'AA',
                    type: ActivityType.Streaming,
                    url: 'https://www.twitch.tv/4levy_z1'
                }
            ],
            status: 'idle'
        });
        console.log(`Logged in as ${client.user.tag} | (ID: ${client.user.id})`);
    } catch (error) {
        console.error('Error setting presence:', error);
    }
    const rest = new REST({ version: '10' }).setToken(botToken);

    const commands = [
        {
            name: 'setbypass',
            description: 'Send a bypass Embed ;>',
        },
    ];

    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.type === InteractionType.ApplicationCommand) {
        if (interaction.commandName === 'setbypass') {
            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                await interaction.reply({ content: '```❌ You do not have permission to use this command.```', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('✨ | __Bypass Menu__')
                .setDescription('```Select Yourshit\n\nAPI provided by RobloxExecutorth```')
                .setImage('https://i.ibb.co/8Mhm24D/miyako1-1.gif')
                .setColor(0xffffff);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('fluxus')
                        .setLabel('Fluxus')
                        .setEmoji('<:a_:1204738154045906984>')
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId('linkvertise')
                        .setLabel('Linkvertise')
                        .setEmoji('🔗')
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId('rekonise')
                        .setLabel('Rekonise')
                        .setEmoji('<:evilBwaa:1267141351015977100>')
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId('delta')
                        .setLabel('Delta')
                        .setEmoji('<:1175308654023557140:1204738376742215710>')
                        .setStyle(ButtonStyle.Primary),

                    new ButtonBuilder()
                        .setCustomId('arceusx')
                        .setLabel('ArceusX')
                        .setEmoji('<:eliv:1267141432523624593>')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [row] });
        }
    } else if (interaction.type === InteractionType.MessageComponent) {
        const type = interaction.customId;

        const modal = new ModalBuilder()
            .setCustomId(`bypass_${type}`)
            .setTitle('Enter Your Link');

        const input = new TextInputBuilder()
            .setCustomId('linkInput')
            .setLabel('Enter your link here')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Enter your ${type} link`)
            .setRequired(true);

        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);

        await interaction.showModal(modal);
    } else if (interaction.type === InteractionType.ModalSubmit) {
        const type = interaction.customId.split('_')[1];
        const link = interaction.fields.getTextInputValue('linkInput');

        const apiLink = getApiLink(link, type);
        if (!apiLink) {
            await interaction.reply({ content: '```❌ Invalid link provided.```', ephemeral: true });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        if (!requestQueue.has(guildId)) {
            requestQueue.set(guildId, new Queue());
        }

        const queue = requestQueue.get(guildId);
        queue.enqueue({ userId, interaction, apiLink, startTime: Date.now() });

        if (!serverRequests.has(guildId)) {
            serverRequests.set(guildId, new Map());
        }

        if (serverRequests.get(guildId).size === 0) {
            await processNextRequest(guildId);
        }
    }
});

client.login(botToken);
