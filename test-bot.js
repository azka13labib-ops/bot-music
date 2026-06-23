const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
require('dotenv').config();
process.env.FFMPEG_PATH = require('ffmpeg-static');

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

client.once('ready', async () => {
  console.log(`Bot online sebagai ${client.user.tag}`);
  
  const guildId = '1508203439824437259';
  const voiceChannelId = '1508203440860561502';
  
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.error('Guild tidak ditemukan!');
    process.exit(1);
  }
  
  const voiceChannel = guild.channels.cache.get(voiceChannelId);
  if (!voiceChannel) {
    console.error('Voice channel tidak ditemukan!');
    process.exit(1);
  }
  
  console.log(`Mencoba memutar lagu di channel: ${voiceChannel.name}`);
  
  try {
    const ytDlp = distube.plugins.find(p => p.constructor.name === 'YtDlpPlugin');
    console.log('Searching YouTube via yt-dlp plugin...');
    const result = await ytDlp.resolve('ytsearch1:hari bersamamu');
    
    let url;
    if (result.songs && result.songs[0]) {
      url = result.songs[0].url;
    } else if (result.url) {
      url = result.url;
    }
    
    console.log('Search resolved to URL:', url);
    if (!url) {
      throw new Error('No search results found');
    }
    
    await distube.play(voiceChannel, url, {
      textChannel: guild.systemChannel || voiceChannel
    });
    console.log('distube.play() berhasil dipanggil');
  } catch (err) {
    console.error('Error saat memanggil distube.play():', err);
  }
});

// Event debug dan error
client.on('debug', log => {
  // Filter out noisy WS heartbeat logs
  if (!log.includes('heartbeat') && !log.includes('HEARTBEAT')) {
    console.log('[Client Debug]', log);
  }
});
distube.on('initQueue', queue => {
  console.log('Queue initialized!');
  const voice = queue.voice;
  if (voice) {
    voice.connection.on('stateChange', (oldState, newState) => {
      console.log(`[Connection State] ${oldState.status} -> ${newState.status}`);
    });
    voice.connection.on('error', err => {
      console.error('[Connection Error]', err);
    });
    voice.audioPlayer.on('stateChange', (oldState, newState) => {
      console.log(`[Player State] ${oldState.status} -> ${newState.status}`);
      
      // If we transition to buffering or playing, inspect the stream process
      if (newState.status === 'buffering' || newState.status === 'playing') {
        const stream = voice.stream;
        if (stream && stream.process) {
          console.log('[FFmpeg] Found FFmpeg process!');
          stream.process.stderr.on('data', chunk => {
            console.error('[FFmpeg Stderr]', chunk.toString());
          });
          stream.process.on('close', (code, signal) => {
            console.log(`[FFmpeg Process Closed] code: ${code}, signal: ${signal}`);
          });
          stream.process.on('error', err => {
            console.error('[FFmpeg Process Error]', err);
          });
        } else {
          console.log('[FFmpeg] No stream process found yet.');
        }
      }
    });
    voice.audioPlayer.on('error', err => {
      console.error('[Player Error]', err);
    });
  }
});

distube.on('playSong', (queue, song) => {
  console.log(`🎶 playSong: ${song.name} (${song.formattedDuration})`);
});
distube.on('addSong', (queue, song) => {
  console.log(`➕ addSong: ${song.name}`);
});
distube.on('finish', (queue) => {
  console.log('✅ finish: Queue selesai!');
  process.exit(0);
});
distube.on('error', (error, queue) => {
  console.error('❌ distube error:', error);
});

// Capture unhandled rejections
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.TOKEN);
