import { Router } from 'express';
import { getDailyAnalysis } from '../controllers/analysisController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.use(protect);
router.get('/daily', getDailyAnalysis);

export default router;
