import express from 'express';
import { getVideoInfo, testApi } from '../controller/videoController.js'; 

const router = express.Router();

router.post('/video-info', getVideoInfo);
router.get('/test', testApi);

export default router; 