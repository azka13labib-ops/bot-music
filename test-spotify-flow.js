/**
 * Test script: Validates the full Spotify resolver logic end-to-end
 * without needing an actual Discord bot or voice channel.
 * Simulates what CustomSpotifyPlugin.resolve() does internally.
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

function ytdlpJson(query) {
  return new Promise((resolve, reject) => {
    const binPath = getYtDlpBinaryPath();
    const args = ['-j', '--no-warnings', '--quiet', '--simulate', '--skip-download', '-f', 'ba/ba*', `ytsearch1:${query}`];
    execFile(binPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (stderr && stderr.trim()) console.warn(`[stderr]:\n${stderr}`);
      if (error) return reject(new Error(`yt-dlp error: ${error.message}`));
      const jsonStart = stdout.indexOf('{');
      if (jsonStart === -1) return reject(new Error('No JSON in stdout'));
      try { resolve(JSON.parse(stdout.substring(jsonStart))); }
      catch (e) { reject(new Error(`Parse failed: ${e.message}\nstdout: ${stdout.substring(0, 300)}`)); }
    });
  });
}

function pickBestAudioFormat(formats) {
  if (!Array.isArray(formats) || !formats.length) return null;
  const audioFormats = formats.filter(f => f.url && f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'));
  if (!audioFormats.length) return formats.find(f => f.url) || null;
  const opus = audioFormats.find(f => f.acodec === 'opus' || f.format_id === '251');
  if (opus) return opus;
  const m4a = audioFormats.find(f => f.acodec?.startsWith('mp4a') || f.format_id === '140');
  if (m4a) return m4a;
  return audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];
}

async function testSpotifyFlow(query, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`Query: ${query}`);
  console.log('='.repeat(60));
  
  try {
    const ytInfo = await ytdlpJson(query);
    const videoData = ytInfo.entries?.[0] || ytInfo;
    const bestFormat = pickBestAudioFormat(videoData.formats);
    const streamUrl = bestFormat?.url || videoData.url;
    const videoId = videoData.id || videoData.webpage_url?.match(/[?&]v=([^&]+)/)?.[1];

    console.log(`✅ yt-dlp search OK`);
    console.log(`   Video ID:    ${videoId}`);
    console.log(`   Title:       ${videoData.title}`);
    console.log(`   Uploader:    ${videoData.uploader}`);
    console.log(`   Duration:    ${videoData.duration}s`);
    console.log(`   Format ID:   ${bestFormat?.format_id} (acodec=${bestFormat?.acodec}, abr=${bestFormat?.abr}kbps)`);
    console.log(`   Stream URL:  ${streamUrl ? streamUrl.substring(0, 100) + '...' : 'MISSING!'}`);
    
    if (!streamUrl) {
      console.error(`❌ NO STREAM URL — playback would fail`);
      return false;
    }
    
    console.log(`✅ Song would be built with stream.url pre-set → getStreamURL() will be SKIPPED`);
    return true;
  } catch (err) {
    console.error(`❌ FAILED: ${err.message}`);
    return false;
  }
}

async function testPatchedJsonHelper() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: Patched json() helper from @distube/yt-dlp`);
  console.log('='.repeat(60));
  try {
    const { json } = require('@distube/yt-dlp');
    // Test with a real YouTube URL 
    const info = await json('ytsearch1:never gonna give you up rick astley', {
      dumpSingleJson: true, noWarnings: true, simulate: true,
      skipDownload: true, format: 'ba/ba*'
    });
    const item = info.entries?.[0] || info;
    console.log(`✅ Patched json() helper OK`);
    console.log(`   Title: ${item.title}`);
    console.log(`   URL:   ${item.webpage_url}`);
    return true;
  } catch (err) {
    console.error(`❌ Patched json() FAILED: ${err.message}`);
    return false;
  }
}

(async () => {
  const results = [];

  // Test 1: The Spotify query that was crashing
  results.push(await testSpotifyFlow(
    'Sesi Potret eńau Ari Lesmana official audio',
    'Spotify track: Sesi Potret (eńau ft. Ari Lesmana)'
  ));

  // Test 2: Another Spotify track
  results.push(await testSpotifyFlow(
    'Never Gonna Give You Up Rick Astley official audio',
    'Spotify track: Never Gonna Give You Up (sanity check)'
  ));

  // Test 3: Verify the patched json() helper itself works
  results.push(await testPatchedJsonHelper());

  console.log(`\n${'='.repeat(60)}`);
  const passed = results.filter(Boolean).length;
  console.log(`SUMMARY: ${passed}/${results.length} tests passed`);
  if (passed === results.length) {
    console.log('✅ All tests passed! Ready for bot deployment.');
  } else {
    console.log('❌ Some tests failed. Check logs above.');
    process.exit(1);
  }
})();
