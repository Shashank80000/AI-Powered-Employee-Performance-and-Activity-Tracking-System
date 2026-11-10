import { Router } from 'express';
import { createReport, employeeOverview, getReport, listReports } from '../controllers/reportController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.get('/', listReports);
// Before '/:id', which would otherwise take "overview" as a report id.
router.get('/overview', employeeOverview);
router.get('/:id', getReport);
router.post('/', authorize('admin', 'manager'), createReport);

export default router;
