
import express from 'express';
import { Innertube, Platform, Types } from 'youtubei.js/web';

const app = express();
const PORT = process.env.PORT || 3000;

// YouTube.js requires an interpreter for some
// streaming URL deciphering operations.
Platform.shim.eval = async (data) => {
  return new Function(data.output)();
};

let yt;

async function getClient() {
  if (!yt) {
    yt = await Innertube.create({
      lang: 'en',
      location: 'IN'
    });
  }
  return yt;
}

function extractVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1);
    }
    return url.searchParams.get('v');
  } catch {
    return /^[a-zA-Z0-9_-]{11}$/.test(input)
      ? input
      : null;
  }
}

app.get('/', (req, res) => {
  res.json({
    name: 'YouTube.js Stream API',
    endpoint: '/stream?url=YOUTUBE_URL'
  });
});

app.get('/stream', async (req, res) => {
  try {
    const videoId = extractVideoId(req.query.url || '');

    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return res.status(400).json({
        error: 'Invalid YouTube URL or video ID'
      });
    }

    const client = await getClient();
    const info = await client.getInfo(videoId);

    const streaming = await info.getStreamingInfo();

    res.json({
      id: videoId,
      title: info.basic_info.title,
      author: info.basic_info.author,
      duration: info.basic_info.duration,
      thumbnail: info.basic_info.thumbnail?.at(-1)?.url,
      streaming
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Extraction failed',
      message: error.message
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
