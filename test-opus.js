try {
  const prism = require('prism-media');
  console.log('Successfully required prism-media!');
  const opus = new prism.opus.Encoder({ rate: 48000, channels: 2, frameSize: 960 });
  console.log('Successfully created Opus Encoder!');
  
  opus.on('data', chunk => {
    console.log(`Opus chunk received: ${chunk.length} bytes`);
  });
  
  opus.on('error', err => {
    console.error('Opus error:', err);
  });
  
  opus.on('end', () => {
    console.log('Opus encoder ended');
  });

  const dummyPcm = Buffer.alloc(960 * 2 * 2); // 960 samples, 2 channels, 16-bit PCM
  opus.write(dummyPcm);
  opus.end();
} catch (err) {
  console.error('Error creating/writing to Opus encoder:', err);
}
