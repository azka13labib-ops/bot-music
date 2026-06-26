const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Mainin lagu dari YouTube/Spotify/SoundCloud')
    .addStringOption(opt =>
      opt.setName('query').setDescription('Judul lagu atau URL').setRequired(true)
    ),
  new SlashCommandBuilder().setName('skip').setDescription('Skip lagu yang sedang main'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop musik & kosongin queue'),
  new SlashCommandBuilder().setName('queue').setDescription('Lihat daftar antrian lagu'),
  new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Atur volume (0-100)')
    .addIntegerOption(opt =>
      opt.setName('level').setDescription('Level volume').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Atur mode repeat')
    .addStringOption(opt =>
      opt.setName('mode').setDescription('off / song / queue').setRequired(true)
        .addChoices(
          { name: 'Off', value: 'off' },
          { name: 'Repeat Song', value: 'song' },
          { name: 'Repeat Queue', value: 'queue' },
        )
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Jeda lagu yang sedang main'),
  new SlashCommandBuilder().setName('resume').setDescription('Lanjutkan lagu yang di-jeda'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Lihat info lagu yang sedang diputar'),
  new SlashCommandBuilder().setName('leave').setDescription('Menyuruh bot keluar dari Voice Channel'),
].map(cmd => cmd.toJSON());

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🔄 Mendaftarkan slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('✅ Slash commands berhasil didaftarkan!');
  } catch (err) {
    console.error(err);
  }
})();