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
const botToken = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const errorChannelId = process.env.ERROR_CHANNEL_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;
const API_KEY = "API KEY"; //--> PUT YOUR API KEY JOIN XKEYBYPESS / https://discord.gg/8C5292EqBf

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`)
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'bot.log' })
    ]
});

async function getApiLink(content, type, isAdlink = false) {
    const baseUrl = 'https://xkeypass-api.onrender.com/api/';
    const endpoints = isAdlink ? {
        linkvertise: 'adlinks',
        workink: 'adlinks',
        rekonise: 'adlinks',
        socialwolfez: 'adlinks',
        sub2get: 'adlinks',
        pastedrop: 'adlinks',
    } : {
        fluxus: 'bypass',
        delta: 'bypass',
        cryptic: 'bypass',
        trigonevo: 'bypass',
    };

    const endpoint = endpoints[type];
    if (!endpoint) return null;

    const encodedUrl = encodeURIComponent(content);
    const paramName = isAdlink ? 'url' : 'link';

    return `${baseUrl}${endpoint}?${paramName}=${encodedUrl}&apikey=${API_KEY}`;
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

                const bypassData = jsonData.Result || jsonData.result || jsonData.bypassed || jsonData.key;
                const timeTaken = (Date.now() - startTime) / 1000;

                let embed;
                if (bypassData) {
                    embed = new EmbedBuilder()
                        .setTitle('<a:success:1192084671060791308> | Bypass Successful!')
                        .setColor(0x2ECC71)
                        .setThumbnail(interaction.user.displayAvatarURL())
                        .addFields(
                            { name: '``🔑`` **Bypass Result/Key:**', value: `\`\`\`${bypassData}\`\`\``, inline: false },
                            { name: '``⏱️`` **Time Taken:**', value: `\`\`\`yaml\n${timeTaken.toFixed(2)} seconds\n\`\`\``, inline: true },
                            { name: '``📝`` **Requested by:**', value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``, inline: true }
                        );

                    const logChannel = client.channels.cache.get(logChannelId);
                    if (logChannel) {
                        logChannel.send({ embeds: [embed] });
                    } else {
                        logger.error('Log channel not found.');
                    }

                } else {
                    embed = new EmbedBuilder()
                        .setTitle('❌ | Bypass Failed')
                        .setDescription('```diff\n- Unable to process the link.\n```')
                        .setColor(0xFF0000)
                        .addFields({ name: '⏱️ **Time Taken:**', value: `\`\`\`yaml\n${timeTaken.toFixed(2)} seconds\n\`\`\``, inline: false });
                }

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                logger.error(`❌ Error: ${error.message}`);
                if (error.response) {
                    logger.error(`Response Status: ${error.response.status}`);
                    logger.error(`Response Data: ${JSON.stringify(error.response.data)}`);
                }

                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('```API is down, please try again later.```')
                    .setColor(0xFF0000);

                const errorChannel = client.channels.cache.get(errorChannelId);
                if (errorChannel) {
                    errorChannel.send({ embeds: [errorEmbed] });
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
    logger.info(`Logged in as ${client.user.tag} | (ID: ${client.user.id})`);

    try {
        await client.user.setPresence({
            activities: [{ name: 'AA', type: ActivityType.Streaming, url: 'https://www.twitch.tv/4levy_z1' }],
            status: 'idle'
        });
    } catch (error) {
        logger.error('Error setting presence:', error);
    }

    const rest = new REST({ version: '10' }).setToken(botToken);
    const commands = [
        { name: 'setbypass', description: 'Send a bypass Embed ;>' },
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
                .setDescription('```Select Yourshit\nAPI provided by XKeypass```')
                .setImage('https://i.postimg.cc/1X352Gv3/Saber-2.gif')
                .setThumbnail("https://i.postimg.cc/dVKjCD3V/Sparkle.jpg")
                .setColor(0xffffff);

            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('fluxus')
                        .setLabel('Fluxus')
                        .setEmoji('<:a_:1204738154045906984>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('delta')
                        .setLabel('Delta (Platoboost)')
                        .setEmoji('<:Delta:1273669791093231697>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('cryptic')
                        .setLabel('Cryptic (Platoboost)')
                        .setEmoji('<:Cryptic:1273712561535324272>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('trigonevo')
                        .setLabel('Trigon Evo')
                        .setEmoji('<:Trigon:1273712724404342925>')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('pastedrop')
                        .setEmoji("<:Screenshot20240926051448:1288624803275870208>")
                        .setLabel('Pastedrop')
                        .setStyle(ButtonStyle.Primary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('linkvertise')
                        .setLabel('Linkvertise')
                        .setEmoji("<:Linkvertise:1266787483169849365>")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('workink')
                        .setLabel('Work.Ink')
                        .setEmoji("<:Workink:1284411465872441426>")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('rekonise')
                        .setLabel('Rekonise')
                        .setEmoji("<:Rekonise:1273990792062697595>")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('socialwolfez')
                        .setLabel('Social Wolfez')
                        .setEmoji("<:Screenshot20240926051342:1288624536241176607>")
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('status')
                        .setLabel('Check Supported')
                        .setEmoji("<a:checked:1242146329854214214>")
                        .setStyle(ButtonStyle.Secondary)
                );

            await interaction.reply({ embeds: [embed], components: [row1, row2] });
        }
    } else if (interaction.type === InteractionType.MessageComponent) {
        const type = interaction.customId;

        if (type === 'status') {
            try {
                const response = await axios.get('https://xkeypass-api.onrender.com/api/supported');
                const jsonData = response.data;

                if (jsonData.Supported && jsonData.Supported.length > 0) {
                    const supportedBypasses = jsonData.Supported.join('\n');
                    const supportedEmbed = new EmbedBuilder()
                        .setTitle('__Supported Bypasses__')
                        .setDescription(`**These bypasses are currently supported:**\n\`\`\`${supportedBypasses}\`\`\``)
                        .setColor(0x00FF00);

                    await interaction.reply({ embeds: [supportedEmbed], ephemeral: true });
                } else {
                    const errorEmbed = new EmbedBuilder()
                        .setTitle('❌ Error')
                        .setDescription('```No supported bypasses found in the API response.```')
                        .setColor(0xFF0000);

                    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
                }
            } catch (error) {
                logger.error(`Error fetching supported bypasses: ${error.message}`);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Error')
                    .setDescription('```Unable to fetch supported bypasses. API may be down.```')
                    .setColor(0xFF0000);

                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
            return;
        }

        const isAdlink = ['linkvertise', 'workink', 'rekonise', 'socialwolfez', 'pastedrop'].includes(type);
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

        const isAdlink = ['linkvertise', 'workink', 'rekonise', 'socialwolfez', 'pastedrop'].includes(type);
        const apiLink = await getApiLink(link, type, isAdlink);
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
