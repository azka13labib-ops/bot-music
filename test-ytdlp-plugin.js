const { YtDlpPlugin } = require('@distube/yt-dlp');
const plugin = new YtDlpPlugin();
const ffmpegPath = require('ffmpeg-static');
const { exec } = require('child_process');

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

(async () => {
  try {
    console.log('Resolving stream URL using YtDlpPlugin...');
    const streamUrl = await plugin.getStreamURL({ url });
    console.log('Stream URL resolved:', streamUrl);
    
    if (!streamUrl) {
      console.error('No stream URL returned!');
      return;
    }
    
    console.log('Testing FFmpeg with this stream URL...');
    const ffmpegCmd = `"${ffmpegPath}" -i "${streamUrl}" -f s16le -ar 48000 -ac 2 -t 5 pipe:1 > NUL`;
    console.log('Running FFmpeg command:', ffmpegCmd);
    
    exec(ffmpegCmd, (ffErr, ffStdout, ffStderr) => {
      if (ffErr) {
        console.error('FFmpeg exited with error:', ffErr);
      }
      console.log('FFmpeg Stderr:');
      console.log(ffStderr);
    });
  } catch (err) {
    console.error('Error:', err);
  }
})();
