# 🎵 Cozy Village Music Bot

Sebuah bot musik Discord berkinerja tinggi yang dibangun menggunakan **Discord.js v14** dan **DisTube**. Bot ini dioptimalkan untuk memutar audio kualitas tinggi dengan menggunakan *Native C++ Opus* dan *Sodium Encryption* (bukan versi WASM yang lambat), sehingga memberikan latensi yang sangat rendah dan kualitas suara yang jernih.

## ✨ Fitur Utama
- **Multi-Platform Support**: Mendukung pemutaran dari YouTube, SoundCloud, dan Spotify.
- **Performa Tinggi**: Menggunakan modul native (`@discordjs/opus` dan `sodium-native`) untuk proses enkripsi dan audio decoding super cepat.
- **Slash Commands**: Sepenuhnya menggunakan Slash Commands Discord (fitur terbaru).
- **Anti-Lag**: Mampu mengatasi masalah lagging/patah-patah (didukung dengan pengaturan region yang tepat).
- **Aman**: Menggunakan file `.env` sehingga token bot tidak akan bocor ke publik.

## 📋 Prasyarat
Sebelum menginstall, pastikan komputermu (atau servermu) sudah menginstall:
1. **[Node.js](https://nodejs.org/en)** (Minimal versi `v22.x.x` atau lebih baru).
2. **Visual Studio Build Tools** (dengan workload *Desktop development with C++*) untuk mengkompilasi modul *native opus*.
3. (Opsional) **FFmpeg** terinstall di sistem (meskipun bot ini sudah dilengkapi `ffmpeg-static`).

## 🚀 Cara Instalasi

1. **Clone repository ini** ke komputermu:
   ```bash
   git clone https://github.com/azka13labib-ops/bot-music.git
   cd bot-music
   ```

2. **Install semua modul/dependensi**:
   ```bash
   npm install
   ```
   *(Pastikan tidak ada error kompilasi C++ saat menginstall `@discordjs/opus` dan `sodium-native`).*

3. **Buat file konfigurasi**:
   - Buat file baru bernama `.env` di dalam folder project ini.
   - Isi file tersebut dengan Token Bot Discord kamu (dapatkan di [Discord Developer Portal](https://discord.com/developers/applications)):
     ```env
     TOKEN=ISI_DENGAN_TOKEN_BOT_KAMU_DISINI
     CLIENT_ID=ISI_DENGAN_APPLICATION_ID_KAMU_DISINI
     ```

4. **Daftarkan Slash Commands** ke Discord:
   ```bash
   node deploy-commands.js
   ```

5. **Nyalakan Bot**:
   ```bash
   node index.js
   ```

## 🎮 Daftar Perintah (Commands)
Di dalam Discord, ketik `/` untuk melihat perintah bot. Perintah yang tersedia saat ini:
- `/ping` - Mengecek latensi dan status bot.
- `/play <judul lagu / link>` - Memutar lagu dari YouTube, SoundCloud, atau Spotify. *(Contoh: `/play alan walker fade` atau `/play [link]`)*.

## 🛠 Troubleshooting (Masalah Umum)
- **Bot jalan, tapi tidak ada suara (Silence)**: Biasanya terjadi karena Firewall/Antivirus (seperti Windows Defender) atau Provider Internet (seperti IndiHome) memblokir koneksi UDP ke server Discord. Solusinya: Ubah *Region Override* di setting Voice Channel Discord-mu ke **Hong Kong**, **Japan**, atau **Sydney**.
- **Error `FFmpeg exited with code 3436169992` atau `HTTP 403 Forbidden`**: Ini artinya YouTube memblokir akses bot. Cobalah memutar lagu menggunakan link dari **SoundCloud** sebagai alternatif yang lebih stabil.

## 📄 Lisensi
[ISC License](LICENSE)
