import { Router } from 'express';
import { activitySummary, listActivity, uploadSnapshots } from '../controllers/activityController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.post('/snapshots', authorize('employee'), uploadSnapshots);
router.get('/', listActivity);
router.get('/summary', activitySummary);

export default router;
