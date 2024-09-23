// I HAVE NO IDEA HOW THE HELL THIS API WORK THEIR METHOD IS WILD

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Routes, InteractionType, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const axios = require('axios');
const { Queue } = require('queue-typescript');
const { Mutex } = require('async-mutex');
const winston = require('winston');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const serverRequests = new Map();
const requestQueue = new Map();
const processingLocks = new Map();

// Config bot
const BOT_TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ERROR_CHANNEL_ID = process.env.ERROR_CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'StickX.log' })
    ]
});

function extractParameter(url, param) {
    try {
        const urlObj = new URL(url);
        return new URLSearchParams(urlObj.search).get(param);
    } catch (error) {
        return null;
    }
}


async function getApiLink(content, type) {
    const baseUrl = 'https://stickx.top';
    let hwid, token, link;

    const apiKeys = {
        fluxus: 'E99l9NOctud3vmu6bPne',
        delta: 'tUnAZj3sS74DJo9BUb8tshpVhpLJLA',
        hydrogen: 'E99l9NOctud3vmu6bPne',
        arceusx: 'tUnAZj3sS74DJo9BUb8tshpVhpLJLA',
        codex: 'tUnAZj3sS74DJo9BUb8tshpVhpLJLA',
        vegax: 'tUnAZj3sS74DJo9BUb8tshpVhpLJLA',
        relzhub: 'E99l9NOctud3vmu6bPne'
    };

    switch (type) {
        case 'fluxus':
        case 'delta':
        case 'hydrogen':
        case 'vegax':
            hwid = extractParameter(content, 'hwid');
            if (!hwid) {
                return null;
            }
            return `${baseUrl}/api-${type}/?hwid=${hwid}&api_key=${apiKeys[type]}`;

        case 'arceusx':

            hwid = extractParameter(content, 'hwid');
            if (!hwid) {
                return null;
            }
            return `${baseUrl}/api-arceusx/?hwid=${hwid}&api_key=${apiKeys.arceusx}`;

        case 'relzhub':
            return `${baseUrl}/api-linkvertise/?link=${content}&api_key=${apiKeys.relzhub}`;

        case 'codex':
            token = extractParameter(content, 'token');
            if (!token) {
                return null;
            }
            return `${baseUrl}/api-codex/?token=${token}&api_key=${apiKeys.codex}`;

        default:
            return null;
    }
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

                if (jsonData.Status === 'Error' && jsonData.key === 'API limit exceeded') {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ | API Limit Exceeded')
                        .setDescription('```diff\n- The API limit has been exceeded. Please try again later.\n```')
                        .setColor(0xFF0000)
                        .setFooter({ text: `Requested by ${interaction.user.tag}` });

                    await interaction.editReply({ embeds: [embed] });
                    logger.error('API response error: API limit exceeded');
                    return;
                }

                if (jsonData.Status === 'Error' && jsonData.key === 'Not allowed bypass') {
                    const embed = new EmbedBuilder()
                        .setTitle('❌ | Bypass Failed')
                        .setDescription('```diff\n- Not allowed to bypass. Please check your API permissions or data.\n```')
                        .setColor(0xFF0000)
                        .setFooter({ text: `Requested by ${interaction.user.tag}` });

                    await interaction.editReply({ embeds: [embed] });
                    logger.error('API response error: Not allowed bypass');
                    return;
                }

                const bypassData = jsonData.bypassed || jsonData.key || jsonData.result;
                const deviceStatus = jsonData.device_status;
                const deviceInfo = jsonData.device_info;
                const timeTaken = (Date.now() - startTime) / 1000;

                let embed;
                if (bypassData) {
                    embed = new EmbedBuilder()
                        .setTitle('``✅`` | Bypass Successful!')
                        .setColor(0x2ECC71)
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .setImage('https://i.ibb.co/whmq1ML/9c73d3f908912fede9cd9ab8af17dc83-4051502925.gif')
                        .addFields(
                            {
                                name: '🔑 **Key:**',
                                value: `\`\`\`diff\n${bypassData}\n\`\`\``,
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

                    const logChannel = client.channels.cache.get(LOG_CHANNEL_ID);
                    if (logChannel) {
                        logChannel.send({ embeds: [embed] });
                    } else {
                        logger.error('-> Log channel is incorrect or not found');
                    }

                } else {
                    embed = new EmbedBuilder()
                        .setTitle('``❌`` | Bypass Failed')
                        .setDescription('\`\`\`diff\n- Unable to process.\n\`\`\`')
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
                logger.error(`❌ Error: ${error.message}`);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('```API is down, please try again later.```')
                    .setColor(0xFF0000);

                const errorChannel = client.channels.cache.get(ERROR_CHANNEL_ID);
                if (errorChannel) {
                    errorChannel.send({ embeds: [errorEmbed] });
                } else {
                    logger.error('```❌ Error channel is incorrect or not found```');
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
                    name: 'AAA',
                    type: ActivityType.Streaming,
                    url: 'https://www.twitch.tv/4levy_z1'
                }
            ],
            status: 'idle'
        });
        logger.info(`Logged in as ${client.user.tag} | (ID: ${client.user.id})`);
    } catch (error) {
        logger.error('Error setting presence:', error);
    }
    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

    const commands = [
        {
            name: 'setbypass',
            description: 'Send a bypass Embed ;>',
        },
    ];

    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        logger.info('Successfully registered application commands.');
    } catch (error) {
        logger.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.type === InteractionType.ApplicationCommand) {
        if (interaction.commandName === 'setbypass') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                await interaction.reply({ content: '``❌`` | You do not have permission to use this command.', ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('✨ | __Bypass Menu__')
                .setDescription('```Select Your Service\n\nAPI provided by Zaneru Official```')
                .setImage('https://i.ibb.co/8Mhm24D/miyako1-1.gif')
                .setColor(0xffffff);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('fluxus')
                        .setLabel('Fluxus')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('relzhub')
                        .setLabel('Relz Hub')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('delta')
                        .setLabel('Delta')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('hydrogen')
                        .setLabel('Hydrogen')
                        .setStyle(ButtonStyle.Primary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('arceusx')
                        .setLabel('Arceus X')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('codex')
                        .setLabel('Codex')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('vegax')
                        .setLabel('Vegax')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [row, row2] });
        }
    } else if (interaction.type === InteractionType.MessageComponent) {
        const type = interaction.customId;

        const modal = new ModalBuilder()
            .setCustomId(`bypass_${type}`)
            .setTitle(`Enter Your ${type} Link/Token`);

        const input = new TextInputBuilder()
            .setCustomId('linkInput')
            .setLabel('Enter your link/token here')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(`Enter your ${type} link or token`)
            .setRequired(true);

        const modalRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(modalRow);

        await interaction.showModal(modal);
    } else if (interaction.type === InteractionType.ModalSubmit) {
        const type = interaction.customId.split('_')[1];
        const link = interaction.fields.getTextInputValue('linkInput');

        const apiLink = await getApiLink(link, type);
        if (!apiLink) {
            await interaction.reply({ content: '❌ Invalid link provided.', ephemeral: true });
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

client.login(BOT_TOKEN);
