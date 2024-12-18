require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Routes, InteractionType, ActivityType, PermissionsBitField } = require('discord.js');
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
const botToken = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const errorChannelId = process.env.ERROR_CHANNEL_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;
const API_KEY = 'Kagi_0H9BP72';  // <-- DONT CHANGE

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'Kazi.log' })
    ]
});

async function getApiLink(content, type) {
    const baseUrl = 'https://kazi-api.vercel.app/api';
    const endpoints = {
        fluxus: 'bypass',
        linkvertise: 'bypass',
        rekonise: 'bypass',
        delta: 'bypass',
        codex: 'bypass',
        workink: 'bypass',
        mediafire: 'bypass',
        arceusx: 'arceusx'
    };

    if (!endpoints[type]) return null;

    if (type === 'arceusx') {
        return `${baseUrl}/arceusx?link=${content}&apikey=${API_KEY}`;
    } else {
        return `${baseUrl}/bypass?link=${content}`;
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

                const bypassData = jsonData.Result; 
                const duration = jsonData.Duration;
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
                                name: '``🔗`` **Bypassed Link:**',
                                value: `\`\`\`yaml\n${bypassData}\n\`\`\``,
                                inline: false
                            },
                            {
                                name: '``⏱️`` **Time Taken:**',
                                value: `\`\`\`yaml\n${timeTaken.toFixed(2)} seconds\n\`\`\``,
                                inline: true
                            },
                            {
                                name: '``⚡`` **API Duration:**',
                                value: `\`\`\`yaml\n${duration}\n\`\`\``,
                                inline: true
                            },
                            {
                                name: '``📝`` **Requested by:**',
                                value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``,
                                inline: true
                            }
                        );

                    const logChannel = client.channels.cache.get(logChannelId);
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

                const errorChannel = client.channels.cache.get(errorChannelId);
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
                    name: 'AA',
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
    const rest = new REST({ version: '10' }).setToken(botToken);

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
            const embed = new EmbedBuilder()
                .setTitle('✨ | __Bypass Menu__')
                .setDescription('```Select Yourshit\n\nAPI provided by Kazi API```')
                .setImage('https://i.ibb.co/8Mhm24D/miyako1-1.gif')
                .setColor(0xffffff);

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('fluxus')
                        .setLabel('Fluxus')
                        .setEmoji('<:Fluxus:1273680261283971205>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('linkvertise')
                        .setLabel('Linkvertise')
                        .setEmoji('<:Linkvertise:1266787483169849365>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('rekonise')
                        .setLabel('Rekonise')
                        .setEmoji('<:Rekonise:1273990792062697595>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('delta')
                        .setLabel('Delta')
                        .setEmoji('<:Delta:1277224338549899365>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('arceusx')
                        .setLabel('ArceusX')
                        .setEmoji('<:ArceusX:1280836108967608382>')
                        .setStyle(ButtonStyle.Primary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('workink')
                        .setLabel('Work.ink')
                        .setEmoji('<:Workink:1284411465872441426>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('mediafire')
                        .setLabel('Mediafire')
                        .setEmoji('<:mediafire1:1289437115230322729>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('codex')
                        .setLabel('Codex')
                        .setEmoji('<:Codex:1273713250223259813>')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({ embeds: [embed], components: [row, row2] });
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

client.login(botToken);