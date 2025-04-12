require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Routes,
  InteractionType,
  ActivityType,
  PermissionsBitField,
} = require("discord.js");
const { REST } = require("@discordjs/rest");
const axios = require("axios");
const { Queue } = require("queue-typescript");
const { Mutex } = require("async-mutex");
const winston = require("winston");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const serverRequests = new Map();
const requestQueue = new Map();
const processingLocks = new Map();

// Config bot
const botToken = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const errorChannelId = process.env.ERROR_CHANNEL_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(
      ({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "Solar.log" }),
  ],
});

async function getApiLink(content, type) {
  const baseUrl = "https://api.solar-x.top/api/v3/bypass";
  return `${baseUrl}?url=${encodeURIComponent(content)}`;
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

        console.log("API Response:", jsonData);

        const bypassedLink = jsonData.result;
        const timeTaken = jsonData.time || (Date.now() - startTime) / 1000;

        let embed;
        if (bypassedLink && jsonData.status === "success") {
          embed = new EmbedBuilder()
            .setTitle("``✅`` | Bypass Successful!")
            .setColor(0x2ecc71)
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
              {
                name: "🔑 **Bypassed Link:**",
                value: `\`\`\`diff\n${bypassedLink}\n\`\`\``,
                inline: false,
              },
              {
                name: "⏱️ **Time Taken:**",
                value: `\`\`\`yaml\n${timeTaken} seconds\n\`\`\``,
                inline: true,
              },
              {
                name: "📝 **Requested by:**",
                value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``,
                inline: true,
              }
            );

          const logChannel = client.channels.cache.get(logChannelId);
          if (logChannel) {
            logChannel.send({ embeds: [embed] });
          } else {
            logger.error("-> Log channel is incorrect or not found");
          }
        } else {
          embed = new EmbedBuilder()
            .setTitle("``❌`` | Bypass Failed")
            .setDescription("```diff\n- Unable to process.\n```")
            .setColor(0xff0000)
            .addFields({
              name: "⏱️ Attempt Time:",
              value: `\`\`\`yaml\n${timeTaken} seconds\n\`\`\``,
              inline: false,
            });
        }

        await interaction.editReply({ embeds: [embed] });
      } catch (error) {
        logger.error(`❌ Error: ${error.message}`);
        const errorEmbed = new EmbedBuilder()
          .setTitle("❌ Error")
          .setDescription("```API is down, please try again later.```")
          .setColor(0xff0000);

        const errorChannel = client.channels.cache.get(errorChannelId);
        if (errorChannel) {
          errorChannel.send({ embeds: [errorEmbed] });
        } else {
          logger.error("```❌ Error channel is incorrect or not found```");
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

client.once("ready", async () => {
  try {
    await client.user.setPresence({
      activities: [
        {
          name: "AA",
          type: ActivityType.Streaming,
          url: "https://www.twitch.tv/4levy_z1",
        },
      ],
      status: "idle",
    });
    logger.info(`Logged in as ${client.user.tag} | (ID: ${client.user.id})`);
  } catch (error) {
    logger.error("Error setting presence:", error);
  }
  const rest = new REST({ version: "10" }).setToken(botToken);

  const commands = [
    {
      name: "setbypass",
      description: "Send a bypass Embed ;>",
    },
  ];

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    logger.info("Successfully registered application commands.");
  } catch (error) {
    logger.error("Error registering commands:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.type === InteractionType.ApplicationCommand) {
    if (interaction.commandName === "setbypass") {
      if (
        !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
      ) {
        await interaction.reply({
          content: "``❌`` | You do not have permission to use this command.",
          ephemeral: true,
        });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle("✨ | __Bypass Menu__")
        .setDescription("```Select Yourshit\n\nAPI provided by Solar```")
        .setImage("https://i.ibb.co/8Mhm24D/miyako1-1.gif")
        .setColor(0xffffff);

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("codex")
          .setLabel("Codex")
          .setEmoji("<:Codex:1273713250223259813>")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("mediafire")
          .setLabel("MediaFire")
          .setEmoji("<:mediafire1:1289437115230322729>")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("pastebin")
          .setLabel("Pastebin")
          .setEmoji("<:Pastebin:1289435860223262812>")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("pastedrop")
          .setLabel("PasteDrop")
          .setEmoji("<:hu0gwUZY_400x400:1289436319440699412>")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("justpaste")
          .setLabel("JustPaste")
          .setEmoji("📝")
          .setStyle(ButtonStyle.Primary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("pastecanyon")
          .setLabel("PasteCanyon")
          .setEmoji("🏞️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("goldpaster")
          .setLabel("GoldPaster")
          .setEmoji("🏆")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("mboost")
          .setLabel("MBoost")
          .setEmoji("⚡")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("rekonise")
          .setLabel("Rekonise")
          .setEmoji("<:evilBwaa:1267141351015977100>")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("socialwolvez")
          .setLabel("SocialWolvez")
          .setEmoji("🐺")
          .setStyle(ButtonStyle.Primary)
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("sub2get")
          .setLabel("Sub2Get")
          .setEmoji("📺")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("sub2unlock")
          .setLabel("Sub2Unlock")
          .setEmoji("<:Screenshot20240927025411:1288951814007554119>")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("sub4unlock")
          .setLabel("Sub4Unlock")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("adfocus")
          .setLabel("AdFocus")
          .setEmoji("👀")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("unlocknow")
          .setLabel("UnlockNow")
          .setEmoji("🔓")
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({
        embeds: [embed],
        components: [row1, row2, row3],
      });
    }
  } else if (interaction.type === InteractionType.MessageComponent) {
    const type = interaction.customId;

    const modal = new ModalBuilder()
      .setCustomId(`bypass_${type}`)
      .setTitle("Enter Your Link");

    const input = new TextInputBuilder()
      .setCustomId("linkInput")
      .setLabel("Enter your link here")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder(`Enter your ${type} link`)
      .setRequired(true);

    const modalRow = new ActionRowBuilder().addComponents(input);
    modal.addComponents(modalRow);

    await interaction.showModal(modal);
  } else if (interaction.type === InteractionType.ModalSubmit) {
    const type = interaction.customId.split("_")[1];
    const link = interaction.fields.getTextInputValue("linkInput");

    const apiLink = await getApiLink(link, type);
    if (!apiLink) {
      await interaction.reply({
        content: "❌ Invalid link provided.",
        ephemeral: true,
      });
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
