import { Router } from 'express';
import { createReport, getReport, listReports } from '../controllers/reportController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.get('/', listReports);
router.get('/:id', getReport);
router.post('/', authorize('admin', 'manager'), createReport);

export default router;
