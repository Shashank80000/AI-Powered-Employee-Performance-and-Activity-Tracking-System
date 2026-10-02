import { Router } from 'express';
import { getTracking, setTracking } from '../controllers/trackingController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect, authorize('employee'));
router.get('/', getTracking);
router.put('/', setTracking);

export default router;
