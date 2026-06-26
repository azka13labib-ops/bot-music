require('dns').setDefaultResultOrder('ipv4first');
require('dotenv').config();
const keepAlive = require('./keepalive');

// Nyalakan dummy web server untuk HuggingFace Spaces
keepAlive();

const undici = require('undici');
undici.setGlobalDispatcher(new undici.Agent({ 
  connect: { 
    family: 4,
    timeout: 60000   // 60 detik (default hanya 10 detik)
  },
  keepAliveTimeout: 60000,
  keepAliveMaxTimeout: 120000
}));
process.on('uncaughtException', (err) => {
  console.error('🔴 UNCAUGHT EXCEPTION:', err);
});

const { Client, GatewayIntentBits } = require('discord.js');
const { generateDependencyReport } = require('@discordjs/voice');
console.log(generateDependencyReport());

const { joinVoiceChannel } = require('@discordjs/voice');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { CustomSpotifyPlugin, CustomSearchPlugin } = require('./lib/spotifyResolver');
const { SoundCloudPlugin } = require('@distube/soundcloud');


const client = new Client({
  rest: { timeout: 60000 },
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
        probesize: 5000000,
        analyzeduration: 5000000,
        // Tambahkan reconnect flag dan User-Agent agar stream YouTube tidak putus/crash
        reconnect: 1,
        reconnect_streamed: 1,
        reconnect_delay_max: 5,
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
      },
      output: {}
    }
  },
  plugins: [
    new CustomSearchPlugin(),
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

// Client debug listener to troubleshoot connection details
client.on('debug', (log) => {
  if (log.includes('voice') || log.includes('Voice') || log.includes('Gateway') || log.includes('SESSION_Description') || log.includes('sessionDescription')) {
    console.log(`[Discord.js Debug] ${log}`);
  }
});

// Slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;
  const queue = distube.getQueue(interaction.guildId);

  if (commandName === 'play') {
    await interaction.deferReply();
    const query = interaction.options.getString('query');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) return interaction.editReply('Masuk ke voice channel dulu ya!');

    try {
      await interaction.editReply(`🔎 Mencari: ${query}...`);

      let playTarget = query;
      const isUrl = query.startsWith('http://') || query.startsWith('https://');
      if (!isUrl) {
        // Karena SoundCloud dihapus, pencarian murni text akan ditangani oleh DisTube default (YtDlpPlugin) 
        // tapi jika masih ada plugin lain yang butuh interception bisa ditaruh di sini
      }

      // Pastikan membersihkan koneksi lama jika bot 'nyangkut' di guild ini
      try {
        console.log(`[Voice Debug] Memeriksa koneksi lama di guild ${interaction.guildId}`);
        const existingConnection = distube.voices.get(interaction.guildId);
        if (existingConnection) {
          console.log(`[Voice Debug] Menghapus koneksi lama di guild ${interaction.guildId}`);
          existingConnection.leave();
        }
      } catch (err) {
        console.error('[Voice Debug] Gagal membersihkan koneksi lama:', err);
      }

      console.log(`[Voice Debug] Memanggil distube.play di channel ${voiceChannel.id}`);
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

console.log('[DEBUG] TOKEN length:', process.env.TOKEN ? process.env.TOKEN.length : 'UNDEFINED');

async function loginWithRetry(token) {
  const delays = [3000, 5000, 10000, 15000, 30000];
  for (let i = 0; i <= delays.length; i++) {
    try {
      console.log(`[Login] Mencoba login ke Discord... (percobaan ${i + 1})`);
      await client.login(token);
      console.log('[Login] ✅ Berhasil terhubung ke Discord!');
      return;
    } catch (err) {
      console.error(`[Login] ❌ Gagal percobaan ${i + 1}:`, err.code || err.message);
      if (i < delays.length) {
        console.log(`[Login] 🔄 Retry dalam ${delays[i] / 1000} detik...`);
        await new Promise(r => setTimeout(r, delays[i]));
      } else {
        console.error('[Login] 💀 Semua percobaan gagal. Bot tidak dapat terhubung ke Discord dari HuggingFace.');
      }
    }
  }
}
loginWithRetry(process.env.TOKEN);

// Anti-crash system
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});