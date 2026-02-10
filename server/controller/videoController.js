import ytDlpWrap from 'yt-dlp-exec';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_DIR = path.join(__dirname, '../temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

const detectPlatform = (url) => {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter';
  if (url.includes('snapchat.com')) return 'Snapchat';
  return 'Unknown';
};

const hasAudioTrack = (format) => {
  if (format.acodec && format.acodec !== 'none') return true;
  if ((format.acodec === undefined || format.acodec === null) &&
    ['mp4', 'webm', 'mov'].includes(format.ext) &&
    (format.vcodec !== 'none' || format.vcodec === undefined || format.vcodec === null)) {
    return true;
  }
  return false;
};

// Multiple fallback strategies for YouTube
const getYtDlpStrategies = (platform) => {
  if (platform !== 'YouTube') {
    // For non-YouTube platforms, use standard options
    return [{
      name: 'Standard',
      options: {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
        noPlaylist: true,
        preferFreeFormats: true,
      }
    }];
  }

  const strategies = [];
  const hasProxy = !!process.env.SCRAPERAPI_KEY;

  // Strategy 1: iOS with Proxy (if available)
  if (hasProxy) {
    strategies.push({
      name: 'iOS + Proxy',
      options: {
        dumpSingleJson: true,
        noWarnings: true,
        noCheckCertificate: true,
        noPlaylist: true,
        extractorArgs: 'youtube:player_client=ios',
        userAgent: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
        proxy: `http://scraperapi:${process.env.SCRAPERAPI_KEY}@proxy-server.scraperapi.com:8001`,
      }
    });
  }

  strategies.push({
    name: 'Android Embedded',
    options: {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      noPlaylist: true,
      extractorArgs: 'youtube:player_client=android_embedded',
      userAgent: 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
    }
  });

  strategies.push({
    name: 'Web',
    options: {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      noPlaylist: true,
      extractorArgs: 'youtube:player_client=web',
    }
  });

  // Strategy 4: No special client (let yt-dlp decide)
  strategies.push({
    name: 'Auto',
    options: {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      noPlaylist: true,
    }
  });

  return strategies;
};

export const testApi = (req, res) => {
  res.json({
    success: true,
    message: 'Multi-Platform Video Downloader API',
    engine: 'yt-dlp',
    proxyEnabled: !!process.env.SCRAPERAPI_KEY,
    strategies: 4,
    supported: 'YouTube, Instagram, Facebook, TikTok, Twitter, Snapchat, and 1000+ more',
    timestamp: new Date().toISOString()
  });
};

export const getVideoInfo = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL. URL must start with http:// or https://'
      });
    }

    const platform = detectPlatform(url);

    console.log(`📥 Fetching info for ${platform}: ${url.substring(0, 60)}...`);

    const strategies = getYtDlpStrategies(platform);
    let info = null;
    let successStrategy = null;
    let lastError = null;

    // Try each strategy until one works
    for (const strategy of strategies) {
      try {
        console.log(`🔄 Trying strategy: ${strategy.name}`);
        info = await ytDlpWrap(url, strategy.options);
        successStrategy = strategy.name;
        console.log(`✅ Success with ${strategy.name}: ${info.title?.substring(0, 50)}...`);
        break;
      } catch (error) {
        console.log(`❌ ${strategy.name} failed: ${error.message.substring(0, 100)}`);
        lastError = error;
        continue;
      }
    }

    // If all strategies failed, throw the last error
    if (!info) {
      throw lastError || new Error('All download strategies failed');
    }

    let allFormats = [];

    if (platform === 'YouTube') {
      // Pre-merged formats
      const videoFormatsWithAudio = (info.formats || [])
        .filter(f =>
          f.vcodec && f.vcodec !== 'none' &&
          f.acodec && f.acodec !== 'none' &&
          (f.ext === 'mp4' || f.ext === 'webm')
        )
        .map(format => ({
          quality: format.format_note || `${format.height}p`,
          resolution: `${format.width}x${format.height}`,
          format: format.ext,
          size: format.filesize
            ? `${(format.filesize / 1024 / 1024).toFixed(2)} MB`
            : format.filesize_approx
              ? `~${(format.filesize_approx / 1024 / 1024).toFixed(2)} MB`
              : 'Unknown',
          formatId: format.format_id,
          fps: format.fps,
          type: 'video-audio-merged',
          mediaType: 'video',
          note: 'Ready to download',
          hasAudio: true
        }))
        .sort((a, b) => {
          const qualityA = parseInt(a.quality) || 0;
          const qualityB = parseInt(b.quality) || 0;
          return qualityB - qualityA;
        });

      // Best audio
      const bestAudio = info.formats
        .filter(af => af.acodec && af.acodec !== 'none' && (!af.vcodec || af.vcodec === 'none'))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

      const audioFormatId = bestAudio?.format_id || '140';

      // High-quality video-only formats
      const videoOnlyFormats = (info.formats || [])
        .filter(f =>
          f.vcodec && f.vcodec !== 'none' &&
          (!f.acodec || f.acodec === 'none') &&
          f.height && f.height >= 480 &&
          f.ext === 'mp4'
        )
        .map(format => ({
          quality: `${format.height}p HD`,
          resolution: `${format.width}x${format.height}`,
          format: 'mp4',
          size: format.filesize
            ? `${(format.filesize / 1024 / 1024).toFixed(2)} MB`
            : 'Unknown',
          formatId: `${format.format_id}+${audioFormatId}`,
          fps: format.fps,
          type: 'video-needs-merge',
          mediaType: 'video',
          note: 'High quality (will merge with audio)',
          hasAudio: true
        }))
        .sort((a, b) => {
          const qualityA = parseInt(a.quality) || 0;
          const qualityB = parseInt(b.quality) || 0;
          return qualityB - qualityA;
        })
        .slice(0, 4);

      allFormats = [...videoOnlyFormats, ...videoFormatsWithAudio].slice(0, 8);

      // Audio formats
      const audioFormats = (info.formats || [])
        .filter(f =>
          f.acodec && f.acodec !== 'none' &&
          (!f.vcodec || f.vcodec === 'none')
        )
        .map(format => ({
          quality: format.abr ? `${format.abr}kbps` : 'Audio',
          format: format.ext,
          size: format.filesize
            ? `${(format.filesize / 1024 / 1024).toFixed(2)} MB`
            : 'Unknown',
          formatId: format.format_id,
          type: 'audio',
          mediaType: 'audio',
          hasAudio: true
        }))
        .slice(0, 1);

      allFormats = [...allFormats, ...audioFormats];
    } else {
      // Non-YouTube platforms (Instagram, Twitter, Snapchat, LinkedIn, etc.)
      const bestAudio = info.formats
        ?.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

      const audioFormatId = bestAudio?.format_id;

      const videoFormats = (info.formats || [])
        .filter(f => {
          if (f.vcodec === 'none') return false;

          // Method 1: Has explicit video codec (Instagram, Facebook, TikTok)
          if (f.vcodec && f.vcodec !== 'none') return true;

          // Method 2: Has dimensions (Twitter, some platforms)
          if (f.width && f.height && f.width > 0 && f.height > 0) {
            if (['mp4', 'webm', 'mov', 'm4v'].includes(f.ext)) return true;
          }

          // Method 3: Is mp4/webm/mov with URL (Snapchat, LinkedIn)
          if (['mp4', 'webm', 'mov', 'm4v'].includes(f.ext) && f.url) {
            // Only include if not explicitly audio-only
            if (!f.acodec || f.acodec === 'none' || f.acodec === undefined || f.acodec === null) {
              return true;
            }
            // Include if both codecs are null/undefined (Snapchat/LinkedIn case)
            if ((f.vcodec === null || f.vcodec === undefined) &&
              (f.acodec === null || f.acodec === undefined)) {
              return true;
            }
          }

          // Method 4: Format ID suggests video
          if (f.format_id && f.format_id.includes('video')) return true;

          return false;
        })
        .map(format => {
          const hasAudio = hasAudioTrack(format);
          let finalFormatId = hasAudio ? format.format_id :
            (audioFormatId ? `${format.format_id}+${audioFormatId}` : format.format_id);

          return {
            quality: format.height ? `${format.height}p` : 'Video',
            resolution: format.width && format.height ? `${format.width}x${format.height}` : 'Unknown',
            format: format.ext || 'mp4',
            size: format.filesize
              ? `${(format.filesize / 1024 / 1024).toFixed(2)} MB`
              : format.filesize_approx
                ? `~${(format.filesize_approx / 1024 / 1024).toFixed(2)} MB`
                : 'Unknown',
            formatId: finalFormatId,
            fps: format.fps,
            type: hasAudio ? 'video-audio-merged' : 'video-needs-merge',
            mediaType: 'video',
            note: hasAudio ? 'Ready to download' : (audioFormatId ? 'Will merge with audio' : 'Video only'),
            hasAudio: hasAudio || !!audioFormatId
          };
        })
        .sort((a, b) => {
          const qualityA = parseInt(a.quality) || 0;
          const qualityB = parseInt(b.quality) || 0;
          return qualityB - qualityA;
        });

      allFormats = videoFormats;
    }

    // MP3 option
    allFormats.push({
      quality: 'MP3 Audio',
      format: 'mp3',
      size: 'Varies',
      formatId: 'mp3-best',
      type: 'audio',
      mediaType: 'audio-converted',
      note: 'Best audio converted to MP3',
      hasAudio: true
    });

    console.log(`📊 Found ${allFormats.length} formats using ${successStrategy}`);

    res.json({
      success: true,
      data: {
        platform: platform,
        title: info.title,
        videoId: info.id,
        duration: info.duration,
        thumbnail: info.thumbnail,
        uploader: info.uploader || info.channel || 'Unknown',
        views: info.view_count?.toLocaleString() || 'N/A',
        uploadDate: info.upload_date,
        description: info.description?.substring(0, 200) + '...' || '',
        url: info.webpage_url || url,
        formats: allFormats,
        totalFormatsAvailable: info.formats?.length || 0,
        fetchedWith: successStrategy
      }
    });

  } catch (error) {
    console.error('❌ All strategies failed. Last error:', error.message);

    if (error.message.includes('Video unavailable') ||
      error.message.includes('Private video') ||
      error.message.includes('not available') ||
      error.message.includes('been deleted') ||
      error.message.includes('This video is unavailable')) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        message: 'This video is unavailable, deleted, or private. Try a different YouTube video.',
        hint: 'Test with: https://www.youtube.com/watch?v=jNQXAC9IVRw (popular "Me at the zoo" video)'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch video information',
      message: error.message,
      hint: 'Try testing with a different YouTube video'
    });
  }
};

export const downloadVideo = async (req, res) => {
  let tempFilePath = null;

  try {
    const { formatId } = req.params;
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL parameter is required'
      });
    }

    const platform = detectPlatform(url);

    console.log(`📥 Downloading ${platform}: ${url.substring(0, 60)}...`);

    // Get video info with fallback strategies
    const strategies = getYtDlpStrategies(platform);
    let info = null;

    for (const strategy of strategies) {
      try {
        console.log(`🔄 Info fetch with: ${strategy.name}`);
        info = await ytDlpWrap(url, strategy.options);
        console.log(`✅ Info fetched with ${strategy.name}`);
        break;
      } catch (error) {
        console.log(`❌ ${strategy.name} failed`);
        continue;
      }
    }

    if (!info) {
      throw new Error('Could not fetch video info with any strategy');
    }

    const sanitizedTitle = info.title
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);

    let filename, downloadOptions;

    const baseOptions = {
      noWarnings: true,
      noPlaylist: true,
      noCheckCertificate: true,
    };

    if (platform === 'YouTube') {
      baseOptions.extractorArgs = 'youtube:player_client=android_embedded';
    }

    if (formatId === 'mp3-best') {
      filename = `${sanitizedTitle}.mp3`;
      tempFilePath = path.join(TEMP_DIR, `${timestamp}_${randomId}.mp3`);

      downloadOptions = {
        ...baseOptions,
        format: 'bestaudio',
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0,
        output: tempFilePath,
      };

      res.setHeader('Content-Type', 'audio/mpeg');
    } else {
      filename = `${sanitizedTitle}.mp4`;
      tempFilePath = path.join(TEMP_DIR, `${timestamp}_${randomId}.mp4`);

      if (formatId.includes('+')) {
        downloadOptions = {
          ...baseOptions,
          format: formatId,
          mergeOutputFormat: 'mp4',
          output: tempFilePath,
        };
      } else {
        const requestedFormat = info.formats?.find(f => f.format_id === formatId);
        const hasAudio = requestedFormat && hasAudioTrack(requestedFormat);

        downloadOptions = {
          ...baseOptions,
          format: hasAudio ? formatId : `${formatId}+bestaudio/best`,
          mergeOutputFormat: hasAudio ? undefined : 'mp4',
          output: tempFilePath,
        };
      }

      res.setHeader('Content-Type', 'video/mp4');
    }

    console.log(`⬇️ Downloading: ${filename}`);

    await ytDlpWrap(url, downloadOptions);

    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Downloaded file not found');
    }

    const fileSize = fs.statSync(tempFilePath).size;
    console.log(`✅ Downloaded: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', fileSize);

    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      setTimeout(() => {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          console.log(`🗑️ Cleaned up temp file`);
        }
      }, 5000);
    });

    fileStream.on('error', (error) => {
      console.error('Stream error:', error.message);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    });

  } catch (error) {
    console.error('❌ Download error:', error.message);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Download failed',
        message: error.message
      });
    }
  }
};