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
  if (url.includes('linkedin.com')) return 'LinkedIn';
  return 'Unknown';
};

const isVideoFormat = (format) => {
  if (format.vcodec && format.vcodec !== 'none') return true;
  if (format.width && format.height && format.width > 0 && format.height > 0) return true;
  return false;
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

const getYtDlpOptions = (platform) => {
  const baseOptions = {
    dumpSingleJson: true,
    noWarnings: true,
    noCheckCertificate: true,
    noPlaylist: true,
  };

  if (platform === 'YouTube') {
    return {
      ...baseOptions,
      extractorArgs: 'youtube:player_client=android_creator,web_creator,android,ios',
      userAgent: 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip',
    };
  }

  return {
    ...baseOptions,
    preferFreeFormats: true,
    addHeader: [
      'referer:youtube.com',
      'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ]
  };
};

export const testApi = (req, res) => {
  res.json({
    success: true,
    message: 'Multi-Platform Video Downloader API',
    engine: 'yt-dlp',
    supported: 'YouTube, Instagram, Facebook, TikTok, Twitter, Snapchat, Reddit, Vimeo, Twitch, LinkedIn, and 1000+ more',
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
    const options = getYtDlpOptions(platform);

    const info = await ytDlpWrap(url, options);

    let allFormats = [];

    if (platform === 'YouTube') {
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

      const bestAudio = info.formats
        .filter(af => af.acodec && af.acodec !== 'none' && (!af.vcodec || af.vcodec === 'none'))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

      const audioFormatId = bestAudio?.format_id || '140';

      const videoOnlyFormats = (info.formats || [])
        .filter(f =>
          f.vcodec && f.vcodec !== 'none' &&
          (!f.acodec || f.acodec === 'none') &&
          f.height && f.height >= 720 &&
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
        .slice(0, 3);

      allFormats = [...videoOnlyFormats, ...videoFormatsWithAudio].slice(0, 6);

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
        .slice(0, 2);

      allFormats = [...allFormats, ...audioFormats];
    } else {
      const bestAudio = info.formats
        ?.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
        .sort((a, b) => (b.abr || 0) - (a.abr || 0))[0];

      const audioFormatId = bestAudio?.format_id;

      const videoFormats = (info.formats || [])
        .filter(f => {
          if (f.vcodec === 'none') return false;
          if (f.vcodec && f.vcodec !== 'none') return true;
          if (f.width && f.height && f.width > 0 && f.height > 0) {
            if (['mp4', 'webm', 'mov', 'm4v'].includes(f.ext)) return true;
          }
          if (['mp4', 'webm', 'mov', 'm4v'].includes(f.ext) && f.url) {
            if (!f.acodec || f.acodec === 'none' || f.acodec === undefined || f.acodec === null) return true;
            if ((f.vcodec === null || f.vcodec === undefined) && (f.acodec === null || f.acodec === undefined)) return true;
          }
          if (f.format_id && f.format_id.includes('video')) return true;
          return false;
        })
        .map(format => {
          const hasAudio = hasAudioTrack(format);
          let finalFormatId;

          if (hasAudio) {
            finalFormatId = format.format_id;
          } else if (audioFormatId) {
            finalFormatId = `${format.format_id}+${audioFormatId}`;
          } else {
            finalFormatId = format.format_id;
          }

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

      const audioFormats = (info.formats || [])
        .filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
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
        .slice(0, 2);

      allFormats = [...videoFormats, ...audioFormats];
    }

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
        totalFormatsAvailable: info.formats?.length || 0
      }
    });

  } catch (error) {
    console.error('Video info error:', error.message);

    if (error.message.includes('Sign in to confirm') || error.message.includes('not a bot')) {
      return res.status(503).json({
        success: false,
        error: 'YouTube restriction',
        message: 'This YouTube video cannot be downloaded due to platform restrictions. All other platforms (Instagram, Facebook, Twitter, TikTok) work perfectly. This is a known YouTube limitation.'
      });
    }

    if (error.message.includes('unavailable for certain audiences') || error.message.includes('inappropriate')) {
      return res.status(403).json({
        success: false,
        error: 'Content restricted',
        message: 'This content is age-restricted or unavailable for certain audiences.'
      });
    }

    if (error.message.includes('Unsupported URL')) {
      return res.status(400).json({
        success: false,
        error: 'Platform not supported',
        message: 'Please use a supported platform like YouTube, Instagram, Facebook, TikTok, Twitter, etc.'
      });
    }

    if (error.message.includes('Video unavailable') || error.message.includes('Private video') ||
      error.message.includes('not available') || error.message.includes('been deleted')) {
      return res.status(404).json({
        success: false,
        error: 'Video not found',
        message: 'This video is unavailable, deleted, or private.'
      });
    }

    if (error.message.includes('login required') || error.message.includes('Sign in') ||
      error.message.includes('members-only')) {
      return res.status(403).json({
        success: false,
        error: 'Authentication required',
        message: 'This content requires login or is members-only.'
      });
    }

    if (error.message.includes('not available in your country') || error.message.includes('geo-restricted')) {
      return res.status(451).json({
        success: false,
        error: 'Content blocked',
        message: 'This video is not available in your region.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to fetch video information',
      message: error.message
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
    const options = getYtDlpOptions(platform);

    const info = await ytDlpWrap(url, options);

    const sanitizedTitle = info.title
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100);

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(7);

    let filename, downloadOptions;

    if (formatId === 'mp3-best') {
      filename = `${sanitizedTitle}.mp3`;
      tempFilePath = path.join(TEMP_DIR, `${timestamp}_${randomId}.mp3`);

      downloadOptions = {
        format: 'bestaudio',
        extractAudio: true,
        audioFormat: 'mp3',
        audioQuality: 0,
        output: tempFilePath,
        noPlaylist: true,
      };

      if (platform === 'YouTube') {
        downloadOptions.extractorArgs = 'youtube:player_client=android_creator,web_creator,android,ios';
        downloadOptions.userAgent = 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip';
      }

      res.setHeader('Content-Type', 'audio/mpeg');
    } else {
      filename = `${sanitizedTitle}.mp4`;
      tempFilePath = path.join(TEMP_DIR, `${timestamp}_${randomId}.mp4`);

      if (formatId.includes('+')) {
        const [videoId, audioId] = formatId.split('+');
        const videoExists = info.formats?.some(f => f.format_id === videoId);
        const audioExists = info.formats?.some(f => f.format_id === audioId);

        downloadOptions = {
          format: (videoExists && audioExists) ? formatId : 'bestvideo+bestaudio/best',
          mergeOutputFormat: 'mp4',
          output: tempFilePath,
          noPlaylist: true,
        };
      } else {
        const requestedFormat = info.formats?.find(f => f.format_id === formatId);

        if (requestedFormat) {
          const hasAudio = hasAudioTrack(requestedFormat);

          downloadOptions = hasAudio ? {
            format: formatId,
            output: tempFilePath,
            noPlaylist: true,
          } : {
            format: `${formatId}+bestaudio`,
            mergeOutputFormat: 'mp4',
            output: tempFilePath,
            noPlaylist: true,
          };
        } else {
          downloadOptions = {
            format: 'bestvideo+bestaudio/best',
            mergeOutputFormat: 'mp4',
            output: tempFilePath,
            noPlaylist: true,
          };
        }
      }

      if (platform === 'YouTube') {
        downloadOptions.extractorArgs = 'youtube:player_client=android_creator,web_creator,android,ios';
        downloadOptions.userAgent = 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip';
      }

      res.setHeader('Content-Type', 'video/mp4');
    }

    await ytDlpWrap(url, downloadOptions);

    if (!fs.existsSync(tempFilePath)) {
      throw new Error('Downloaded file not found');
    }

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const stat = fs.statSync(tempFilePath);
    res.setHeader('Content-Length', stat.size);

    const fileStream = fs.createReadStream(tempFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      setTimeout(() => {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
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
    console.error('Download error:', error.message);

    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    if (!res.headersSent) {
      if (error.message.includes('Sign in to confirm') || error.message.includes('not a bot')) {
        return res.status(503).json({
          success: false,
          error: 'YouTube restriction',
          message: 'This YouTube video cannot be downloaded due to platform restrictions. All other platforms work perfectly.'
        });
      }

      if (error.message.includes('unavailable for certain audiences') || error.message.includes('inappropriate')) {
        return res.status(403).json({
          success: false,
          error: 'Content restricted',
          message: 'This content is age-restricted or unavailable.'
        });
      }

      if (error.message.includes('Video unavailable') || error.message.includes('not available') || error.message.includes('been deleted')) {
        return res.status(404).json({
          success: false,
          error: 'Video not found',
          message: 'This video is unavailable, deleted, or private.'
        });
      }

      if (error.message.includes('Private video') || error.message.includes('members-only') ||
        error.message.includes('login required')) {
        return res.status(403).json({
          success: false,
          error: 'Private content',
          message: 'This video is private or requires login to access.'
        });
      }

      if (error.message.includes('not available in your country') || error.message.includes('geo')) {
        return res.status(451).json({
          success: false,
          error: 'Content blocked',
          message: 'This video is not available in your region.'
        });
      }

      if (error.message.includes('Requested format is not available')) {
        return res.status(400).json({
          success: false,
          error: 'Format unavailable',
          message: 'The requested quality is not available. Try a different format.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'Download failed',
        message: error.message
      });
    }
  }
};