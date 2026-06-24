const { SpotifyPlugin } = require('@distube/spotify');
const { Song } = require('distube');
const { execFile } = require('child_process');
const path = require('path');

/**
 * Mendapatkan path binary yt-dlp dari package @distube/yt-dlp.
 * Mengikuti logic yang sama dengan env.ts di package tersebut.
 */
function getYtDlpBinaryPath() {
  // require.resolve('@distube/yt-dlp') -> .../node_modules/@distube/yt-dlp/dist/index.js
  // Naik 2 level: dist/ -> package root, lalu masuk bin/
  const resolvedEntry = require.resolve('@distube/yt-dlp');
  const packageRoot = path.join(path.dirname(resolvedEntry), '..');
  const ytDlpDir = process.env.YTDLP_DIR || path.join(packageRoot, 'bin');
  const isWindows = process.env.YTDLP_IS_WINDOWS || process.platform === 'win32';
  const filename = process.env.YTDLP_FILENAME || `yt-dlp${isWindows ? '.exe' : ''}`;
  return path.join(ytDlpDir, filename);
}

/**
 * Memanggil yt-dlp binary secara langsung dan parse JSON dari stdout,
 * dengan logic untuk skip baris non-JSON (deprecation notice, dsb.)
 * yang muncul sebelum payload JSON sebenarnya.
 *
 * BYPASS total terhadap helper json() bawaan @distube/yt-dlp
 * yang bug-nya: concatenate stderr ke output & naive JSON.parse.
 */
function ytdlpJson(query) {
  return new Promise((resolve, reject) => {
    const binPath = getYtDlpBinaryPath();
    const args = [
      '-j',
      '--no-warnings',
      '--quiet',
      '--simulate',
      '--skip-download',
      '-f', 'ba/ba*',
      `ytsearch1:${query}`
    ];

    console.log(`[yt-dlp-direct] Executing: ${binPath}`);
    console.log(`[yt-dlp-direct] Args: ${JSON.stringify(args)}`);

    execFile(binPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      // Log stderr terpisah supaya kita tahu persis apa yang yt-dlp keluarkan di sana
      if (stderr && stderr.trim()) {
        console.warn(`[yt-dlp-direct] stderr output:\n${stderr}`);
      }

      if (error) {
        console.error(`[yt-dlp-direct] execFile error (code=${error.code}):`, error.message);
        if (stdout) console.error(`[yt-dlp-direct] stdout saat error:\n${stdout}`);
        return reject(new Error(`yt-dlp exited with error: ${error.message}`));
      }

      // === RAW STDOUT LOG (untuk debugging) ===
      console.log(`[yt-dlp-direct] Raw stdout (${stdout.length} chars):\n${stdout}`);

      // === ROBUST JSON PARSING ===
      // Cari karakter '{' pertama — skip baris notice/deprecation yang muncul sebelum JSON
      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) {
        console.error(`[yt-dlp-direct] Tidak ditemukan '{' di stdout. Full stdout:\n${stdout}`);
        return reject(new Error('yt-dlp stdout tidak mengandung JSON object. Lihat log di atas.'));
      }

      const jsonStr = stdout.substring(jsonStart);

      try {
        const parsed = JSON.parse(jsonStr);
        resolve(parsed);
      } catch (parseErr) {
        // Kalau masih gagal parse, log LENGKAP supaya bisa di-debug
        console.error(`[yt-dlp-direct] JSON.parse gagal setelah strip prefix.`);
        console.error(`[yt-dlp-direct] Stripped prefix (${jsonStart} chars): ${JSON.stringify(stdout.substring(0, jsonStart))}`);
        console.error(`[yt-dlp-direct] jsonStr snippet (first 500 chars): ${jsonStr.substring(0, 500)}`);
        console.error(`[yt-dlp-direct] Parse error:`, parseErr.message);
        reject(new Error(`yt-dlp JSON parse failed: ${parseErr.message}`));
      }
    });
  });
}

/**
 * Pilih format audio terbaik dari array formats yt-dlp.
 * Prioritas: opus (format 251) > m4a (format 140) > format audio lainnya.
 * Return: { url, formatNote, acodec, abr }
 */
function pickBestAudioFormat(formats) {
  if (!Array.isArray(formats) || formats.length === 0) return null;

  // Filter hanya format audio (tidak ada vcodec, atau vcodec = "none")
  const audioFormats = formats.filter(f =>
    f.url &&
    f.acodec && f.acodec !== 'none' &&
    (!f.vcodec || f.vcodec === 'none')
  );

  if (audioFormats.length === 0) {
    // Fallback: coba format apapun yang punya url
    return formats.find(f => f.url) || null;
  }

  // Prioritas 1: opus (format_id 251 atau acodec=opus)
  const opus = audioFormats.find(f => f.acodec === 'opus' || f.format_id === '251');
  if (opus) return opus;

  // Prioritas 2: m4a (format_id 140 atau acodec=mp4a)
  const m4a = audioFormats.find(f => f.acodec?.startsWith('mp4a') || f.format_id === '140');
  if (m4a) return m4a;

  // Fallback: format audio dengan bitrate tertinggi
  audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0));
  return audioFormats[0];
}

class CustomSpotifyPlugin extends SpotifyPlugin {
  async resolve(url, options) {
    let data;
    try {
      data = await this.api.getData(url);
    } catch (err) {
      console.warn(`[CustomSpotifyPlugin] API failed (${err.message}). Mencoba manual scraper...`);
      const { fetch } = require('undici');
      const res = await fetch(url);
      const html = await res.text();
      const titleMatch = html.match(/<title>(.*?)<\/title>/);
      if (!titleMatch) throw err;
      
      let rawTitle = titleMatch[1];
      rawTitle = rawTitle.replace(' | Spotify', '');
      const cleanQuery = rawTitle.replace(' - song and lyrics by ', ' ').replace(' - song by ', ' ');
      
      data = {
        type: 'track',
        id: url.split('/').pop().split('?')[0],
        name: cleanQuery,
        artists: [],
        thumbnail: 'https://cdn-icons-png.flaticon.com/512/174/174872.png',
        duration: 0
      };
      console.log(`[CustomSpotifyPlugin] Manual scrape sukses! Query diset ke: "${cleanQuery}"`);
    }

    if (data.type === "track") {
      // Custom interception: langsung dari yt-dlp JSON, tanpa ytPlugin.resolve()
      console.log(`[DEBUG] Attempting yt-dlp direct intercept for ${data.name}.`);
      const query = `${data.name} ${data.artists.map(a => a.name).join(" ")} official audio`;
      
      try {
        console.log(`[DEBUG] yt-dlp searching for: ${query}`);
        // BYPASS: Panggil binary langsung, BUKAN pakai json() dari @distube/yt-dlp
        const ytInfo = await ytdlpJson(query);
        const videoData = ytInfo.entries?.[0] || ytInfo;

        // Pilih format audio terbaik dari data yang sudah didapat
        const bestFormat = pickBestAudioFormat(videoData.formats);
        const streamUrl = bestFormat?.url || videoData.url;
        const videoId = videoData.id ||
          videoData.webpage_url?.match(/[?&]v=([^&]+)/)?.[1];

        console.log(`[DEBUG] Picked format: ${bestFormat?.format_id} (${bestFormat?.acodec}, ${bestFormat?.abr}kbps)`);
        console.log(`[DEBUG] Stream URL present: ${!!streamUrl}`);

        if (streamUrl && videoId) {
          // Bangun Song LANGSUNG dengan stream.url pre-set.
          // DisTube memeriksa song.stream.url sebelum memanggil getStreamURL():
          // if (song.stream.url) return; // <- skip getStreamURL() jika url sudah ada
          // Ini berarti json() dari @distube/yt-dlp TIDAK akan dipanggil lagi.
          const ytPlugin = this.distube?.plugins?.find(p => p.constructor.name === "YtDlpPlugin");

          const song = new Song(
            {
              plugin: ytPlugin || this,
              source: 'youtube',
              playFromSource: true,
              id: videoId,
              name: data.name,                                          // pakai nama dari Spotify
              url: videoData.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
              thumbnail: data.thumbnail || videoData.thumbnail,
              duration: videoData.duration || (data.duration / 1e3),
              uploader: {
                name: data.artists.map(a => a.name).join(', '),        // artis dari Spotify
                url: videoData.uploader_url
              },
              views: videoData.view_count,
              likes: videoData.like_count,
              ageRestricted: Boolean(videoData.age_limit) && videoData.age_limit >= 18
            },
            options
          );

          // Set stream.url secara langsung — ini mencegah DisTube memanggil
          // getStreamURL() yang di dalamnya akan memanggil json() yang buggy.
          song.stream.url = streamUrl;
          song.stream.playFromSource = true;

          // Override metadata Spotify ke song
          song.url = `https://open.spotify.com/track/${data.id}`;
          song.source = 'spotify';

          console.log(`[DEBUG] Song built successfully: "${song.name}" -> stream URL set (${streamUrl.substring(0, 80)}...)`);
          return song;
        }
      } catch(err) {
        console.error("[SpotifyPlugin] yt-dlp direct build failed:", err.message);
      }

      // Fallback default jika yt-dlp gagal — Song tanpa stream URL (DisTube akan coba resolve normal)
      return new Song(
        {
          plugin: this,
          source: "spotify",
          playFromSource: false,
          name: data.name,
          id: data.id,
          url: `https://open.spotify.com/track/${data.id}`,
          thumbnail: data.thumbnail,
          uploader: {
            name: data.artists.map((a) => a.name).join(", ")
          },
          duration: data.duration / 1e3
        },
        options
      );
    }
    
    // Fallback ke aslinya untuk playlist/album
    return super.resolve(url, options);
  }
}

const { ExtractorPlugin } = require('distube');

class CustomSearchPlugin extends ExtractorPlugin {
  validate() {
    // Plugin ini khusus untuk mencari dari nama lagu (dipanggil oleh DisTube saat Spotify Playlist diekstrak), bukan untuk mengekstrak URL langsung.
    return false;
  }

  async searchSong(query, options) {
    console.log(`[CustomSearchPlugin] Searching for song: ${query}`);
    try {
      // Tambahkan "official audio" agar yt-dlp mencari audio resmi, menghindari cover.
      const ytInfo = await ytdlpJson(query + " official audio");
      const videoData = ytInfo.entries?.[0] || ytInfo;

      const bestFormat = pickBestAudioFormat(videoData.formats);
      const streamUrl = bestFormat?.url || videoData.url;
      const videoId = videoData.id || videoData.webpage_url?.match(/[?&]v=([^&]+)/)?.[1];

      if (streamUrl && videoId) {
        const song = new Song(
          {
            plugin: this,
            source: 'youtube',
            playFromSource: true, // Beritahu DisTube agar tidak perlu mengekstrak ulang
            id: videoId,
            name: videoData.title || query,
            url: videoData.webpage_url || `https://www.youtube.com/watch?v=${videoId}`,
            thumbnail: videoData.thumbnail,
            duration: videoData.duration,
            uploader: {
              name: videoData.uploader,
              url: videoData.uploader_url
            },
            views: videoData.view_count,
            likes: videoData.like_count,
            ageRestricted: Boolean(videoData.age_limit) && videoData.age_limit >= 18
          },
          options
        );

        // Pre-set stream URL supaya DisTube bisa langsung main tanpa cari lagi!
        song.stream.url = streamUrl;
        song.stream.playFromSource = true;
        
        return song;
      }
    } catch (err) {
      console.error("[CustomSearchPlugin] yt-dlp search failed:", err.message);
    }
    return null;
  }

  getStreamURL(song) {
    // DisTube memanggil ini jika song.stream.playFromSource = true
    // Karena kita sudah set stream.url saat membuat Song, kembalikan saja itu.
    if (!song.stream.url) {
        throw new Error("Stream URL is missing from the pre-resolved song!");
    }
    return song.stream.url;
  }
}

module.exports = { CustomSpotifyPlugin, CustomSearchPlugin };
