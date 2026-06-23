require('dns').setDefaultResultOrder('ipv4first');

// Fix untuk Node 18+ global fetch() yang menggunakan undici dan mengabaikan setting dns bawaan
const undici = require('undici');
undici.setGlobalDispatcher(new undici.Agent({ connect: { family: 4 } }));
process.on('uncaughtException', (err) => {
  console.error('🔴 UNCAUGHT EXCEPTION:', err);
});

const { Client, GatewayIntentBits } = require('discord.js');
const { generateDependencyReport } = require('@discordjs/voice');
console.log(generateDependencyReport());

const { joinVoiceChannel } = require('@discordjs/voice');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { CustomSpotifyPlugin } = require('./lib/spotifyResolver');
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
  ffmpeg: {
    path: require('ffmpeg-static'),
    args: {
      global: {},
      input: {
        // Beri waktu FFmpeg lebih lama untuk menganalisis format audio
        // agar tidak terjadi "Invalid data found" error saat decode AAC
        probesize: 5000000,
        analyzeduration: 5000000,
      },
      output: {}
    }
  },
  plugins: [
    new CustomSpotifyPlugin(),
    new YtDlpPlugin({ update: true })
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

// Set volume 100% saat queue baru dibuat agar VolumeTransformer
// tidak mengubah sample audio (bypass software gain → kualitas asli)
distube.on('initQueue', (queue) => {
  queue.setVolume(100);
});

distube.on('empty', queue => {
  queue.textChannel.send('👻 Voice channel kosong! Saya keluar ya...');
  queue.stop();
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
    await interaction.deferReply();
    const query = interaction.options.getString('query');
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) return interaction.editReply('Masuk ke voice channel dulu ya!');

    try {
      await interaction.editReply(`🔎 Mencari: ${query}...`);

      let playTarget = query;
      const isUrl = query.startsWith('http://') || query.startsWith('https://');
      if (!isUrl) {
        // Karena SoundCloud dihapus, pencarian murni text akan ditangani oleh DisTube default (YtDlpPlugin) 
        // tapi jika masih ada plugin lain yang butuh interception bisa ditaruh di sini
      }

      await distube.play(voiceChannel, playTarget, {
        textChannel: interaction.channel,
        member: interaction.member,
      });
      // Sukses diputar/ditambahkan ke antrean (akan dilanjutkan oleh event listener)
    } catch (e) {
      console.error('Error in play command:', e);
      await interaction.editReply(`❌ Gagal memainkan lagu: ${e.message}`).catch(console.error);
    }
  }

  if (commandName === 'skip') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    try {
      if (queue.songs.length <= 1 && queue.autoplay === false) {
        await queue.stop();
        await interaction.reply('⏹️ Lagu terakhir di-skip. Queue abis!').catch(console.error);
      } else {
        await queue.skip();
        await interaction.reply('⏭️ Skip!').catch(console.error);
      }
    } catch (e) {
      console.error(e);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(`❌ Error: ${e.message}`).catch(console.error);
      } else {
        await interaction.reply(`❌ Error: ${e.message}`).catch(console.error);
      }
    }
  }

  if (commandName === 'stop') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    queue.stop();
    interaction.reply('⏹️ Stop & queue dikosongin.').catch(console.error);
  }

  if (commandName === 'queue') {
    if (!queue) return interaction.reply('Queue kosong.').catch(console.error);
    const list = queue.songs
      .map((song, i) => `${i === 0 ? '▶️' : `${i}.`} ${song.name} - \`${song.formattedDuration}\``)
      .join('\n');
    interaction.reply(`**📜 Antrian Lagu:**\n${list}`).catch(console.error);
  }

  if (commandName === 'volume') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    const level = interaction.options.getInteger('level');
    queue.setVolume(level);
    interaction.reply(`🔊 Volume diatur ke ${level}%`).catch(console.error);
  }

  if (commandName === 'loop') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    const mode = interaction.options.getString('mode');
    const modeMap = { off: 0, song: 1, queue: 2 };
    queue.setRepeatMode(modeMap[mode]);
    interaction.reply(`🔁 Mode loop: **${mode}**`).catch(console.error);
  }

  if (commandName === 'pause') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    if (queue.paused) {
      return interaction.reply('Lagu sudah di-pause. Gunakan `/resume` untuk melanjutkan.').catch(console.error);
    }
    queue.pause();
    interaction.reply('⏸️ Lagu di-pause.').catch(console.error);
  }

  if (commandName === 'resume') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    if (!queue.paused) {
      return interaction.reply('Lagu sedang berjalan.').catch(console.error);
    }
    queue.resume();
    interaction.reply('▶️ Lagu dilanjutkan.').catch(console.error);
  }

  if (commandName === 'nowplaying') {
    if (!queue) return interaction.reply('Gak ada yang lagi main.').catch(console.error);
    const song = queue.songs[0];
    interaction.reply(`🎶 **Sedang diputar:** ${song.name}\n⏱️ Waktu: \`${queue.formattedCurrentTime} / ${song.formattedDuration}\``).catch(console.error);
  }

  if (commandName === 'leave') {
    distube.voices.leave(interaction.guildId);
    interaction.reply('👋 Bot keluar dari voice channel. Bye!').catch(console.error);
  }
});

client.login(process.env.TOKEN);

// Anti-crash system
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});