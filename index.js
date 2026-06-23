require('dns').setDefaultResultOrder('ipv4first');
const { Client, GatewayIntentBits } = require('discord.js');
const { generateDependencyReport } = require('@discordjs/voice');
console.log(generateDependencyReport());

const { joinVoiceChannel } = require('@discordjs/voice');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});
const distube = new DisTube(client, {
  emitNewSongOnly: true,
  ffmpeg: { path: require('ffmpeg-static') },
  plugins: [
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new YtDlpPlugin()
  ]
});

// Event musik
distube.on('playSong', (queue, song) => {
  queue.textChannel.send(`🎶 Sekarang main: **${song.name}** (${song.formattedDuration})`);
});

distube.on('addSong', (queue, song) => {
  queue.textChannel.send(`➕ Ditambah ke queue: **${song.name}**`);
});

distube.on('finish', (queue) => {
  queue.textChannel.send('✅ Queue selesai!');
});

distube.on('error', (error, queue) => {
  console.error('DisTube Error:', error);
  if (queue && queue.textChannel) {
    queue.textChannel.send(`❌ Ada error pas mainin lagu: ${error.message}`).catch(console.error);
  }
});

distube.on('debug', (info) => console.log(`[DisTube Debug] ${info}`));
distube.on('ffmpegDebug', (info) => console.log(`[FFmpeg Debug] ${info}`));

// Event ready
client.once('ready', () => {
  console.log(`✅ Bot online sebagai ${client.user.tag}`);
});

// Slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const queue = distube.getQueue(interaction.guildId);

  if (commandName === 'play') {
    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.reply('Masuk ke voice channel dulu ya!');

    try {
      await interaction.deferReply();
      await interaction.editReply(`🔎 Mencari: ${query}...`);

      let playTarget = query;
      const isUrl = query.startsWith('http://') || query.startsWith('https://');
      if (!isUrl) {
        const ytDlp = distube.plugins.find(p => p.constructor.name === 'YtDlpPlugin');
        if (ytDlp) {
          const searchResult = await ytDlp.resolve(`ytsearch1:${query}`);
          if (searchResult && searchResult.songs && searchResult.songs[0]) {
            playTarget = searchResult.songs[0].url;
          } else if (searchResult && searchResult.url) {
            playTarget = searchResult.url;
          }
        }
      }

      await distube.play(voiceChannel, playTarget, {
        textChannel: interaction.channel,
        member: interaction.member,
      });
    } catch (e) {
      console.error('Error in play command:', e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(`❌ Gagal memainkan lagu: ${e.message}`).catch(console.error);
      } else {
        await interaction.reply(`❌ Gagal memainkan lagu: ${e.message}`).catch(console.error);
      }
    }
  }

  if (commandName === 'skip') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.');
    try {
      if (queue.songs.length <= 1 && queue.autoplay === false) {
        await queue.stop();
        await interaction.reply('⏹️ Lagu terakhir di-skip. Queue abis!');
      } else {
        await queue.skip();
        await interaction.reply('⏭️ Skip!');
      }
    } catch (e) {
      console.error(e);
      await interaction.reply(`❌ Error: ${e.message}`);
    }
  }

  if (commandName === 'stop') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.');
    queue.stop();
    interaction.reply('⏹️ Stop & queue dikosongin.');
  }

  if (commandName === 'queue') {
    if (!queue) return interaction.reply('Queue kosong.');
    const list = queue.songs
      .map((song, i) => `${i === 0 ? '▶️' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``)
      .join('\n');
    interaction.reply(`**📜 Antrian Lagu:**\n${list}`);
  }

  if (commandName === 'volume') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.');
    const level = interaction.options.getInteger('level');
    queue.setVolume(level);
    interaction.reply(`🔊 Volume diatur ke ${level}%`);
  }

  if (commandName === 'loop') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.');
    const mode = interaction.options.getString('mode');
    const modeMap = { off: 0, song: 1, queue: 2 };
    queue.setRepeatMode(modeMap[mode]);
    interaction.reply(`🔁 Mode loop: **${mode}**`);
  }
});

client.login(process.env.TOKEN);