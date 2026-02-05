import fallenApiClient from "../utils/apiClient.js";

export const getVideoInfo = async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ 
        success: false, 
        error: 'YouTube URL is required' 
      });
    }

 
    const response = await fallenApiClient.get('/api/get_url', {
      params: { url: url }
    });

    const videoData = response.data;
    
    res.json({
      success: true,
      data: {
        // The API returns results array
        results: videoData.results || [],
        // Or format like vidssave.com if multiple qualities returned
        formats: videoData.results?.map(item => ({
          quality: item.quality || 'Unknown',
          format: item.format || 'MP4',
          size: item.size,
          url: item.url || item.download_url,
          platform: item.platform
        })) || []
      }
    });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch video information',
      details: error.response?.data || error.message
    });
  }
};

// Test controller
export const testApi = (req, res) => {
  res.json({ 
    success: true, 
    message: 'Video API is working!' 
  });
};