
import express from 'express';
import { Innertube } from 'youtubei.js';

const app = express();
const PORT = process.env.PORT || 3000;

let ytClient;
let clientPromise;

async function getClient() {
  if (ytClient) return ytClient;

  if (!clientPromise) {
    clientPromise = Innertube.create({
      lang: 'en',
      location: 'IN'
    }).then(client => {
      ytClient = client;
      return client;
    }).catch(error => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

function extractVideoId(input) {
  try {
    const url = new URL(input);

    if (url.hostname === 'youtu.be' ||
        url.hostname === 'www.youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0];
    }

    if (url.hostname.endsWith('youtube.com') ||
        url.hostname === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') {
        return url.searchParams.get('v');
      }

      const match = url.pathname.match(
        /^\/(?:shorts|embed|live)\/([^/?]+)/
      );

      return match ? match[1] : null;
    }

    return null;
  } catch {
    return /^[a-zA-Z0-9_-]{11}$/.test(input) ? input : null;
  }
}

function serializeFormat(format) {
  return {
    itag: format.itag,
    url: format.url || null,
    mimeType: format.mime_type || null,
    bitrate: format.bitrate || null,
    averageBitrate: format.average_bitrate || null,
    contentLength: format.content_length || null,
    width: format.width || null,
    height: format.height || null,
    quality: format.quality || null,
    qualityLabel: format.quality_label || null,
    fps: format.fps || null,
    audioQuality: format.audio_quality || null,
    audioSampleRate: format.audio_sample_rate || null,
    audioChannels: format.audio_channels || null,
    isAudioOnly: format.has_audio && !format.has_video,
    isVideoOnly: format.has_video && !format.has_audio,
    hasAudio: format.has_audio,
    hasVideo: format.has_video
  };
}

function getFormats(streaming) {
  const formats = streaming?.formats || [];
  const adaptive = streaming?.adaptive_formats || [];

  return [...formats, ...adaptive].map(serializeFormat);
}

async function extract(url) {
  const videoId = extractVideoId(url);

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    const error = new Error('Invalid YouTube URL or video ID');
    error.status = 400;
    throw error;
  }

  const client = await getClient();
  const info = await client.getInfo(videoId);
  const streaming = await info.getStreamingInfo();

  const formats = getFormats(streaming);

  return {
    success: true,
    id: videoId,
    title: info.basic_info.title || null,
    author: info.basic_info.author || null,
    duration: info.basic_info.duration || null,
    thumbnail: info.basic_info.thumbnail?.at(-1)?.url || null,
    isLive: info.basic_info.is_live || false,
    formats,
    audio: formats.filter(f => f.isAudioOnly),
    video: formats.filter(f => f.isVideoOnly),
    combined: formats.filter(f => f.hasAudio && f.hasVideo)
  };
}

app.get('/', (req, res) => {
  res.json({
    name: 'YouTube.js Stream Extractor API',
    status: 'online',
    version: '1.0.0',
    endpoints: {
      info: '/info?url=YOUTUBE_URL',
      stream: '/stream?url=YOUTUBE_URL',
      audio: '/audio?url=YOUTUBE_URL',
      video: '/video?url=YOUTUBE_URL',
      formats: '/formats?url=YOUTUBE_URL'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

async function handleExtraction(req, res, mode) {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing url query parameter'
      });
    }

    const result = await extract(url);

    if (mode === 'info') {
      delete result.formats;
      delete result.audio;
      delete result.video;
      delete result.combined;
    }

    if (mode === 'audio') {
      return res.json({
        success: true,
        id: result.id,
        title: result.title,
        audio: result.audio
      });
    }

    if (mode === 'video') {
      return res.json({
        success: true,
        id: result.id,
        title: result.title,
        video: result.video,
        combined: result.combined
      });
    }

    if (mode === 'formats') {
      return res.json({
        success: true,
        id: result.id,
        formats: result.formats
      });
    }

    return res.json(result);

  } catch (error) {
    console.error('Extraction error:', error);

    res.status(error.status || 500).json({
      success: false,
      error: error.message || 'Extraction failed'
    });
  }
}

app.get('/info', (req, res) =>
  handleExtraction(req, res, 'info')
);

app.get('/stream', (req, res) =>
  handleExtraction(req, res, 'stream')
);

app.get('/audio', (req, res) =>
  handleExtraction(req, res, 'audio')
);

app.get('/video', (req, res) =>
  handleExtraction(req, res, 'video')
);

app.get('/formats', (req, res) =>
  handleExtraction(req, res, 'formats')
);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`YouTube.js API running on port ${PORT}`);
});
