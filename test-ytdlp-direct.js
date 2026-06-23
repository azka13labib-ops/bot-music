/**
 * Test script: panggil ytdlpJson() langsung untuk melihat raw stdout
 * dan verifikasi bahwa JSON parsing robust terhadap prefix non-JSON.
 */
const { execFile } = require('child_process');
const path = require('path');

function getYtDlpBinaryPath() {
  const resolvedEntry = require.resolve('@distube/yt-dlp');
  const packageRoot = path.join(path.dirname(resolvedEntry), '..');
  const ytDlpDir = process.env.YTDLP_DIR || path.join(packageRoot, 'bin');
  const isWindows = process.env.YTDLP_IS_WINDOWS || process.platform === 'win32';
  const filename = process.env.YTDLP_FILENAME || `yt-dlp${isWindows ? '.exe' : ''}`;
  return path.join(ytDlpDir, filename);
}

const query = "Sesi Potret eńau Ari Lesmana official audio";

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

console.log(`=== yt-dlp Direct Test ===`);
console.log(`Binary: ${binPath}`);
console.log(`Query: ${query}`);
console.log(`Args: ${JSON.stringify(args)}`);
console.log(`===========================\n`);

execFile(binPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
  console.log(`--- STDERR ---`);
  console.log(stderr || '(empty)');
  console.log(`--- END STDERR ---\n`);

  console.log(`--- RAW STDOUT (${stdout.length} chars) ---`);
  console.log(stdout);
  console.log(`--- END RAW STDOUT ---\n`);

  if (error) {
    console.error(`execFile error:`, error.message);
    return;
  }

  // Robust JSON parsing
  const jsonStart = stdout.indexOf('{');
  if (jsonStart === -1) {
    console.error(`ERROR: Tidak ditemukan '{' di stdout.`);
    return;
  }

  if (jsonStart > 0) {
    console.log(`⚠️  PREFIX NON-JSON DITEMUKAN (${jsonStart} chars):`);
    console.log(JSON.stringify(stdout.substring(0, jsonStart)));
    console.log();
  } else {
    console.log(`✅ stdout dimulai langsung dengan '{' — tidak ada prefix non-JSON.`);
  }

  const jsonStr = stdout.substring(jsonStart);
  try {
    const parsed = JSON.parse(jsonStr);
    console.log(`✅ JSON parse SUKSES!`);
    console.log(`   title: ${parsed.title}`);
    console.log(`   webpage_url: ${parsed.webpage_url}`);
    console.log(`   uploader: ${parsed.uploader}`);
    console.log(`   duration: ${parsed.duration}s`);
    console.log(`   format: ${parsed.format}`);
  } catch (parseErr) {
    console.error(`❌ JSON parse GAGAL: ${parseErr.message}`);
    console.error(`   First 300 chars of jsonStr: ${jsonStr.substring(0, 300)}`);
  }
});
