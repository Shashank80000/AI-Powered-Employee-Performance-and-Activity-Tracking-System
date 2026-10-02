import express, { Router } from 'express';
import {
  deleteOwnScreenshot,
  getOwnImage,
  getTeamImage,
  listOwnScreenshots,
  listTeamScreenshots,
  uploadScreenshot
} from '../controllers/screenshotController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);

// Managers see their own team's screenshots; admins see everyone's. Every image view is logged.
router.get('/team', authorize('manager', 'admin'), listTeamScreenshots);
router.get('/team/:id/image', authorize('manager', 'admin'), getTeamImage);

// The person's own screenshots.
router.post('/', authorize('employee'), express.raw({ type: 'image/jpeg', limit: '2mb' }), uploadScreenshot);
router.get('/', authorize('employee'), listOwnScreenshots);
router.get('/:id/image', authorize('employee'), getOwnImage);
router.delete('/:id', authorize('employee'), deleteOwnScreenshot);

export default router;
