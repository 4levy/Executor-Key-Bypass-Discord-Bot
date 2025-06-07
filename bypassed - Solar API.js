require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  ActivityType,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType,
  DiscordAPIError,
} = require("discord.js");
const axios = require("axios");
const winston = require("winston");
const { Queue } = require("queue-typescript");
const fs = require("fs");
const path = require("path");

const botToken = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const logChannelId = process.env.LOG_CHANNEL_ID;
const INVITE_LINK =
  "https://discord.com/oauth2/authorize?client_id=1109522937989562409&permissions=1374389615648&integration_type=0&scope=bot";

// Avoid touch this if you have no idea what it does.
const websites = {
  "Bypass Executors": "https://solar-x.top/",
};

const ADLINK_TYPES = [
  "mediafire",
  "pastebin",
  "pastedrop",
  "justpaste",
  "pastecanyon",
  "goldpaster",
  "mboost",
  "rekonise",
  "socialwolvez",
  "sub2get",
  "sub2unlock",
  "sub4unlock",
  "adfocus",
  "unlocknow",
  "ldnesfspublic",
  "linkrbscripts",
];
const EXECUTOR_TYPES = [];

const CHECK_INTERVAL = 10000; // Check time | 10 seconds
const DATA_FILE = path.resolve(__dirname, "storedData.json");
let statusMessages = {};
let storedData = {};
const lastErrorTime = new Map();
const intervalMap = new Map();
const ERROR_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
// Avoid touch this if you have no idea what it does.

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
    new winston.transports.File({ filename: "Solar_API.log" }),
    new winston.transports.File({
      filename: "Solar_API.log",
      level: "error",
    }),
  ],
});

try {
  if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE);
    storedData = JSON.parse(rawData);
    logger.info("Loaded existing stored data.");
  } else {
    logger.info("No existing stored data file found. Initializing new data.");
  }
} catch (error) {
  logger.error("Error loading stored data file:", error);
  storedData = {};
}

function loadStoredData() {
  if (fs.existsSync(DATA_FILE)) {
    const rawData = fs.readFileSync(DATA_FILE, "utf-8");

    try {
      if (rawData.trim().length === 0) {
        logger.info("Data file was empty. Initialized empty storedData.");
        storedData = {};
      } else {
        storedData = JSON.parse(rawData);
        logger.info("Loaded stored data for multiple servers:", storedData);
      }
    } catch (error) {
      logger.error("Error parsing stored data:", error);
      storedData = {};
    }
  } else {
    logger.info("No data file found. Initializing empty storedData.");
    storedData = {};
  }
}

function saveStoredData(guildId, data) {
  const filteredData = {
    messageId: data.messageId,
    channelId: data.channelId,
  };

  storedData[guildId] = filteredData;

  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storedData, null, 2));
    logger.info(`Saved data for guild ${guildId}:`, filteredData);
  } catch (error) {
    logger.error("Error writing to stored data file:", error);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const requestQueue = new Map();
const serverRequests = new Map();

async function getApiLink(content, type) {
  const baseUrl = "https://api.solar-x.top/free/bypass";
  return `${baseUrl}?url=${content}`;
}

async function processNextRequest(guildId) {
  if (!requestQueue.has(guildId) || requestQueue.get(guildId).length === 0)
    return;

  const queue = requestQueue.get(guildId);
  const { userId, interaction, apiLink, startTime } = queue.dequeue();

  serverRequests.set(guildId, true);

  const processingEmbed = new EmbedBuilder()
    .setTitle(
      "<:upload:1300079651154034719> | __Bypass in Progress...__"
    )
    .setDescription(
      "> ```Your request is being processed. Please wait a moment...```"
    )
    .setColor(0xdffbff)
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: "``📝`` | Requested by:",
        value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``,
        inline: true,
      },
      { name: "``⏳`` | Status:", value: "```Processing...```", inline: true }
    )
    .setFooter({
      text: `Powered By Solar API | ${interaction.client.user.username}`,
      iconURL: interaction.client.user.displayAvatarURL(),
    })
    .setTimestamp();

  await interaction.editReply({ embeds: [processingEmbed] });

  let loadingDots = 1;
  const loadingInterval = setInterval(async () => {
    let dots = ".".repeat(loadingDots);
    let newEmbed = new EmbedBuilder()
      .setTitle(
        `<:upload:1300079651154034719> | __Bypass in Progress${dots}__`
      )
      .setDescription(
        "> ```Your request is being processed. Please wait a moment...```"
      )
      .setColor(0xdffbff)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: "``📝`` | Requested by:",
          value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``,
          inline: true,
        },
        { name: "``⏳`` | Status:", value: "```Processing...```", inline: true }
      )
      .setFooter({
        text: `Powered By Solar API | ${interaction.client.user.username}`,
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await interaction.editReply({ embeds: [newEmbed] });

    loadingDots = loadingDots === 3 ? 1 : loadingDots + 1;
  }, 1000);

  try {
    const response = await axios.get(apiLink);

    console.log("API Response:", response.data);

    const timeTaken = (Date.now() - startTime) / 1000;
    const jsonData = response.data;

    if (jsonData.key === "None") {
      throw new Error("InvalidKey");
    }

    const bypassData =
      jsonData.key || jsonData.Result || jsonData.result || jsonData.bypassed;

    if (!bypassData) {
      throw new Error("API returned an invalid response format.");
    }

    const embed = createResponseEmbed(bypassData, timeTaken, interaction);

    clearInterval(loadingInterval);

    await interaction.editReply({ embeds: [embed] });

    setTimeout(async () => {
      const logChannel = interaction.client.channels.cache.get(logChannelId);

      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle("<:84893checkmark:1380879476258242652> | Bypass Successful")
          .setDescription("A bypass request has been processed and logged.")
          .setColor(0x2ecc71)
          .addFields(
            {
              name: "Requester:",
              value: `\`${interaction.user.username}#${interaction.user.discriminator}\``,
              inline: true,
            },
            {
              name: "User ID:",
              value: `\`${interaction.user.id}\``,
              inline: true,
            },
            {
              name: "Time Taken:",
              value: `\`${timeTaken.toFixed(2)} seconds\``,
              inline: true,
            },
            { name: "Bypass Result:", value: `\`${bypassData}\`` }
          )
          .setFooter({
            text: `Logged by ${interaction.client.user.username}`,
            iconURL: interaction.client.user.displayAvatarURL(),
          })
          .setTimestamp();

        await logChannel.send({ embeds: [logEmbed] });
      } else {
        console.error("Log channel not found. Please check LOG_CHANNEL_ID.");
      }
    }, 5000);
  } catch (error) {
    clearInterval(loadingInterval);

    console.error("API Error:", error.response?.data || error.message);

    if (error.message === "CaptchaError") {
    } else if (error.message === "InvalidKey") {
      const invalidKeyEmbed = new EmbedBuilder()
        .setTitle("<a:nopeasdc:1242146631021887525> | Bypass Failed")
        .setDescription(
          "```diff\n- Invalid API Key: Unable to process the bypass request.\n```"
        )
        .setColor(0xff0000)
        .setImage("https://i.postimg.cc/1X352Gv3/Saber-2.gif")
        .setThumbnail("https://i.postimg.cc/c1FJYzJg/Saber-5.gif")
        .setFooter({
          text: `Error | ${interaction.client.user.username}`,
          iconURL: interaction.client.user.displayAvatarURL(),
        })
        .setTimestamp();

      await interaction.editReply({ embeds: [invalidKeyEmbed] });

      setTimeout(async () => {
        const logChannel = interaction.client.channels.cache.get(
          process.env.LOG_CHANNEL_ID
        );

        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle("<a:nopeasdc:1242146631021887525> | Bypass Failed")
            .setDescription(
              "A bypass request failed due to an invalid API key."
            )
            .setColor(0xff0000)
            .addFields(
              {
                name: "Requester:",
                value: `\`${interaction.user.username}#${interaction.user.discriminator}\``,
                inline: true,
              },
              {
                name: "User ID:",
                value: `\`${interaction.user.id}\``,
                inline: true,
              },
              { name: "Error Type:", value: "`Invalid API Key`" }
            )
            .setFooter({
              text: `Logged by ${interaction.client.user.username}`,
              iconURL: interaction.client.user.displayAvatarURL(),
            })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        } else {
          console.error("Log channel not found. Please check LOG_CHANNEL_ID.");
        }
      }, 5000);
    } else {
      handleError(error, interaction);
    }
  } finally {
    serverRequests.set(guildId, false);
    if (queue.length > 0) {
      await processNextRequest(guildId);
    }
  }
}

function createResponseEmbed(bypassData, timeTaken, interaction) {
  const embed = new EmbedBuilder();

  if (bypassData) {
    embed
      .setTitle("<:84893checkmark:1380879476258242652> | Bypass Successful!")
      .setColor(0x2ecc71)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: "``🔑`` Bypass Result:",
          value: `\`\`\`yaml\n${bypassData}\n\`\`\``,
          inline: false,
        },
        {
          name: "``⏱️`` Time Taken:",
          value: `\`\`\`yaml\n${timeTaken.toFixed(2)} seconds\n\`\`\``,
          inline: true,
        },
        {
          name: "``📝`` Requested by:",
          value: `\`\`\`yaml\n${interaction.user.tag}\n\`\`\``,
          inline: true,
        }
      )
      .setTimestamp()
      .setFooter({
        text: `Bypass Service | ${interaction.client.user.username}`,
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setAuthor({
        name: `${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      });
  } else {
    embed
      .setTitle("<a:nopeasdc:1242146631021887525> | Bypass Failed")
      .setDescription("```diff\n- Unable to process the link.\n```")
      .setColor(0xff0000)
      .setImage("https://i.postimg.cc/1X352Gv3/Saber-2.gif")
      .setThumbnail("https://i.postimg.cc/c1FJYzJg/Saber-5.gif")
      .setFooter({
        text: `Error | ${interaction.client.user.username}`,
        iconURL: interaction.client.user.displayAvatarURL(),
      })
      .setTimestamp();
  }

  return embed;
}

function handleError(error, interaction) {
  const errorMessage = error.response
    ? error.response.data?.message || "API Error"
    : error.message;
  logger.error(`Error: ${errorMessage}`);
  const errorEmbed = new EmbedBuilder()
    .setTitle("<a:nopeasdc:1242146631021887525> | Error")
    .setDescription(`\`\`\`${errorMessage}\`\`\``)
    .setColor(0xff0000);
  if (!interaction.replied && !interaction.deferred) {
    interaction.reply({ embeds: [errorEmbed], flags: ["Ephemeral"] });
  } else {
    interaction.followUp({ embeds: [errorEmbed], flags: ["Ephemeral"] });
  }
}

function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (_) {
    return false;
  }
}

async function checkWebsitesStatus() {
  const status = {};

  for (const [name, url] of Object.entries(websites)) {
    try {
      const response = await axios.get(url);
      if (response.status === 200) {
        status[name] = "``🟢`` | __Online__";
      } else {
        status[name] = "``🔴`` | __Offline__";
      }
    } catch (error) {
      status[name] = "``🔴`` | __Offline__";
    }
  }

  return status;
}

async function createBypassMenuEmbed() {
  const thlocaltime = new Date().toLocaleString("en-TH", {
    timeZone: "Asia/Bangkok",
  });
  const status = await checkWebsitesStatus();

  const bypassEmbed = new EmbedBuilder()
    .setTitle("<:purpleween:1293057303561375764> | Bypass Menu")
    .setDescription(
      "```Press the button below to start bypassing Adlink process ^^```\n> Rewritten by 4levy\n\n> API provided by **Solar API**\n"
    )
    .setColor(0xd8feff)
    .addFields({
      name: "API Status",
      value: status["Bypass Executors"],
      inline: true,
    })
    .setImage("https://i.postimg.cc/1X352Gv3/Saber-2.gif")
    .setThumbnail("https://i.postimg.cc/ZKj6WHGV/Miku-2.gif")
    .setFooter({ text: `❛⠀Refresh⠀✦ ${thlocaltime}` });

  return bypassEmbed;
}

async function postOrUpdateStatusEmbed(guildId) {
  try {
    const bypassEmbed = await createBypassMenuEmbed();

    const storedChannelId = storedData[guildId]?.channelId;

    if (!storedChannelId) {
      throw new Error(`No channelId stored for guild ${guildId}`);
    }

    const channel = await client.channels
      .fetch(storedChannelId)
      .catch((error) => {
        throw new Error(`Failed to fetch channel: ${error.message}`);
      });

    if (!channel || !channel.isTextBased()) {
      throw new Error(
        `Channel is not a valid text-based channel for guild ${guildId}`
      );
    }

    const storedMessageId = storedData[guildId]?.messageId;

    if (storedMessageId) {
      try {
        const message = await channel.messages.fetch(storedMessageId);
        await message.edit({ embeds: [bypassEmbed] });
        statusMessages[guildId] = message;
      } catch (error) {
        if (error.code === 10008) {
          logger.warn(
            `Message not found for guild ${guildId}, creating a new one.`
          );
          const newMessage = await channel.send({ embeds: [bypassEmbed] });
          statusMessages[guildId] = newMessage;
          storedData[guildId].messageId = newMessage.id;
          saveStoredData(guildId, storedData[guildId]);
        } else {
          throw new Error(`Failed to fetch or edit message: ${error.message}`);
        }
      }
    } else {
      const newMessage = await channel.send({ embeds: [bypassEmbed] });
      statusMessages[guildId] = newMessage;
      storedData[guildId].messageId = newMessage.id;
      saveStoredData(guildId, storedData[guildId]);
    }
  } catch (error) {
    const now = Date.now();
    const lastLoggedTime = lastErrorTime.get(guildId) || 0;

    if (now - lastLoggedTime > ERROR_COOLDOWN) {
      logger.error(`Error in postOrUpdateStatusEmbed: ${error.message}`);
      lastErrorTime.set(guildId, now);
    } else {
      logger.warn(
        `Error encountered in postOrUpdateStatusEmbed but not logging due to cooldown. Guild: ${guildId}`
      );
    }
  }
}

async function startMonitoringForGuild(guildId) {
  if (
    !storedData[guildId] ||
    !storedData[guildId].channelId ||
    !storedData[guildId].messageId
  ) {
    logger.error(
      `No channelId or messageId stored for guild ${guildId}. Use /setbypass first to initialize.`
    );
    return;
  }

  try {
    const channel = await client.channels.fetch(storedData[guildId].channelId);

    if (!channel) {
      logger.error(
        `Channel not found for guild ${guildId}. Make sure the channel exists.`
      );
      return;
    }

    try {
      statusMessages[guildId] = await channel.messages.fetch(
        storedData[guildId].messageId
      );
    } catch (error) {
      logger.error(
        `Message not found or deleted for guild ${guildId}. Use /setbypass to reset.`
      );
      return;
    }

    await postOrUpdateStatusEmbed(guildId, channel);

    if (intervalMap.has(guildId)) {
      clearInterval(intervalMap.get(guildId));
    }

    const intervalId = setInterval(async () => {
      await postOrUpdateStatusEmbed(guildId, channel);
    }, CHECK_INTERVAL);

    intervalMap.set(guildId, intervalId);
  } catch (error) {
    if (error.code === 50001) {
      logger.error(
        `Missing Access: Bot lacks permission to access channel ${storedData[guildId].channelId} in guild ${guildId}.`
      );
    } else {
      logger.error(
        `Error fetching channel ${storedData[guildId].channelId} for guild ${guildId}: ${error.message}`
      );
    }
  }
}

function getEmojiForOption(option) {
  const emojiMap = {
    mediafire: "📁",
    pastebin: "📋",
    pastedrop: "🔗",
    justpaste: "📝",
    pastecanyon: "🗒️",
    goldpaster: "💫",
    mboost: "🚀",
    rekonise: "🔑",
    socialwolvez: "🐺",
    sub2get: "📺",
    sub2unlock: "🔓",
    sub4unlock: "🎮",
    adfocus: "🎯",
    unlocknow: "⚡",
    ldnesfspublic: "🌐",
    linkrbscripts: "🤖",
  };

  return emojiMap[option] || "<:tj_peeves_error:1263068768289030154>";
}

client.on("interactionCreate", async (interaction) => {
  try {
    if (
      interaction.type === InteractionType.ApplicationCommand &&
      interaction.commandName === "setbypass"
    ) {
      const guildId = interaction.guildId;

      if (!interaction.member.permissions.has("ADMINISTRATOR")) {
        return await interaction.reply({
          content:
            "<:26643crossmark:1380879500111249450> | You do not have permission to use this command. Only administrators can use this command.",
          flags: ["Ephemeral"],
        });
      }

      if (storedData[guildId] && storedData[guildId].messageId) {
        const existingEmbed = new EmbedBuilder()
          .setTitle(
            "<:26643crossmark:1380879500111249450> | Existing Bypass Embed"
          )
          .setDescription(
            "An existing bypass embed already exists. Please delete the existing embed before creating a new one."
          )
          .setColor(0xff0000)
          .setTimestamp();

        const deleteButton = new ButtonBuilder()
          .setCustomId("delete_embed")
          .setLabel("Delete Existing Embed")
          .setStyle(ButtonStyle.Danger);
        return await interaction.reply({
          embeds: [existingEmbed],
          flags: ["Ephemeral"],
          components: [new ActionRowBuilder().addComponents(deleteButton)],
        });
      }

      const bypassEmbed = await createBypassMenuEmbed();
      const buttonsRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("adlink")
          .setLabel("Bypass Links")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setLabel("Invite Bot")
          .setURL(INVITE_LINK)
          .setStyle(ButtonStyle.Link)
      );
      const sentMessage = await interaction
        .reply({
          embeds: [bypassEmbed],
          components: [buttonsRow],
        })
        .then((response) => response.fetch());

      storedData[guildId] = {
        messageId: sentMessage.id,
        channelId: interaction.channelId,
      };

      saveStoredData(guildId, storedData[guildId]);

      logger.info(`Stored channelId and messageId for guild ${guildId}`);

      await startMonitoringForGuild(guildId);
    } else if (interaction.isButton()) {
      const type = interaction.customId;

      if (type === "delete_embed") {
        const guildId = interaction.guildId;

        try {
          const channel = await client.channels.fetch(
            storedData[guildId].channelId
          );
          const message = await channel.messages.fetch(
            storedData[guildId].messageId
          );

          await message.delete();

          delete storedData[guildId];
          saveStoredData(guildId, storedData);

          const disabledButton = new ButtonBuilder()
            .setCustomId("delete_embed")
            .setLabel("Delete Existing Embed")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true);

          await interaction.update({
            content:
              "The existing bypass menu has been deleted. Please use /setbypass to create a new one.",
            components: [new ActionRowBuilder().addComponents(disabledButton)],
            ephemeral: true,
          });
        } catch (error) {
          if (error.code === 10008) {
            logger.error(
              `Message not found or already deleted for guild ${guildId}.`
            );
            delete storedData[guildId];
            saveStoredData(guildId, storedData);
            await interaction.update({
              content:
                "The menu was already deleted. You can now use /setbypass to create a new one.",
              components: [],
              flags: ["Ephemeral"],
            });
          } else {
            logger.error(`Error during interaction handling: ${error.message}`);
            await interaction.reply({
              content:
                "An unexpected error occurred while trying to delete the embed. Please try again later.",
              flags: ["Ephemeral"],
            });
          }
        }
      } else if (type === "executor" || type === "adlink") {
        await interaction.deferReply({ flags: ["Ephemeral"] });

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(`${type}_select`)
          .setPlaceholder("> Choose an option <")
          .addOptions(
            (type === "executor" ? EXECUTOR_TYPES : ADLINK_TYPES).map(
              (opt) => ({
                label: opt.charAt(0).toUpperCase() + opt.slice(1),
                value: opt,
                emoji: getEmojiForOption(opt),
              })
            )
          )
          .addOptions([
            {
              label: "Reset Selection",
              value: "reset_selection",
              emoji: "<a:4fcf79ddc6d34114863abad1ff47fe06:1218006291365236841>",
            },
          ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.editReply({ components: [row], ephemeral: true });
      }
    } else if (interaction.isStringSelectMenu()) {
      const selectedType = interaction.values[0];

      if (selectedType === "reset_selection") {
        await interaction.deferUpdate();

        const resetMenu = new StringSelectMenuBuilder()
          .setCustomId("reset_select")
          .setPlaceholder("> Choose an option <")
          .addOptions(
            (interaction.customId.includes("executor")
              ? EXECUTOR_TYPES
              : ADLINK_TYPES
            ).map((opt) => ({
              label: opt.charAt(0).toUpperCase() + opt.slice(1),
              value: opt,
              emoji: getEmojiForOption(opt),
            }))
          )
          .addOptions([
            {
              label: "Reset Selection",
              value: "reset_selection",
              emoji: "<a:4fcf79ddc6d34114863abad1ff47fe06:1218006291365236841>",
            },
          ]);

        const row = new ActionRowBuilder().addComponents(resetMenu);

        await interaction.editReply({
          content: null,
          components: [row],
        });
      } else {
        const modal = new ModalBuilder()
          .setCustomId(`bypass_${selectedType}`)
          .setTitle(
            `Enter your ${
              selectedType.charAt(0).toUpperCase() + selectedType.slice(1)
            } link`
          );

        const input = new TextInputBuilder()
          .setCustomId("linkInput")
          .setLabel(`Enter your ${selectedType} link`)
          .setPlaceholder(`Enter your ${selectedType} link here`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const modalRow = new ActionRowBuilder().addComponents(input);
        modal.addComponents(modalRow);

        await interaction.showModal(modal);
      }
    } else if (interaction.type === InteractionType.ModalSubmit) {
      const selectedType = interaction.customId.split("_")[1];
      const url = interaction.fields.getTextInputValue("linkInput");
      if (!isValidUrl(url)) {
        return await interaction.reply({
          content:
            "<:26643crossmark:1380879500111249450> | Invalid URL. Please try again with a valid URL.",
          flags: ["Ephemeral"],
        });
      }

      await interaction.deferReply({ flags: ["Ephemeral"] });

      const isAdlink = ADLINK_TYPES.includes(selectedType);

      const apiLink = await getApiLink(url, selectedType, isAdlink);

      if (!apiLink) {
        return await interaction.followUp({
          content:
            "<:26643crossmark:1380879500111249450> | Could not construct the API link. Please try again.",
          flags: ["Ephemeral"],
        });
      }

      const guildId = interaction.guildId;
      const userId = interaction.user.id;

      if (!requestQueue.has(guildId)) {
        requestQueue.set(guildId, new Queue());
      }

      const queue = requestQueue.get(guildId);
      queue.enqueue({ userId, interaction, apiLink, startTime: Date.now() });

      if (!serverRequests.get(guildId)) {
        await processNextRequest(guildId);
      }
    }
  } catch (error) {
    logger.error(`Error during interaction handling: ${error.message}`, {
      interactionType: interaction.type,
      userId: interaction.user.id,
      command: interaction.commandName || "N/A",
      customId: interaction.customId || "N/A",
    });

    const errorEmbed = new EmbedBuilder()
      .setTitle("<:26643crossmark:1380879500111249450> | An error occurred")
      .setDescription(
        "There was an unexpected issue processing your request. Please try again later."
      )
      .setColor(0xff0000);

    try {
      if (interaction.isRepliable()) {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
          await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
        }
      } else {
        logger.warn(
          `Interaction ${interaction.id} is no longer valid and cannot be responded to`
        );
      }
    } catch (responseError) {
      if (responseError.code === 10062) {
        logger.warn(
          `Attempted to respond to an expired interaction: ${interaction.id}`
        );
      } else {
        logger.error(`Error sending error response: ${responseError.message}`);
      }
    }
  }
});

client.once("ready", async () => {
  logger.info(`Logged in as ${client.user.tag} | (ID: ${client.user.id})`);

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
  } catch (error) {
    logger.error("Error setting presence:", error);
  }

  const rest = new REST({ version: "10" }).setToken(botToken);
  const commands = [
    {
      name: "setbypass",
      description: "Send a bypass menu duhh by 4levy ;>",
    },
  ];

  loadStoredData();

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    logger.info("Successfully registered application commands.");
  } catch (error) {
    logger.error("Error registering commands:", error);
  }

  for (const guildId of Object.keys(storedData)) {
    await startMonitoringForGuild(guildId);
  }
});

client.on("error", (error) => {
  if (error.code === 10062) {
    logger.warn(`Ignored unknown interaction error: ${error.message}`);
  } else {
    logger.error(`Unhandled Discord error: ${error.message}`);
  }
});

process.on("unhandledRejection", (error) => {
  if (error instanceof DiscordAPIError && error.code === 10062) {
    logger.warn(`Ignored unhandled unknown interaction: ${error.message}`);
  } else {
    logger.error("Unhandled promise rejection:", error);
  }
});

client.login(botToken);
