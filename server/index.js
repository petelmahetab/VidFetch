import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import videoRoutes from './routes/videoRoutes.js';


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); 
app.use(express.json()); 

// Test route
app.get('/', (req, res) => {
  res.json({ message: 'YouTube Downloader API is running!' });
});


app.use('/api', videoRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});