import { Router } from 'express';
import { dashboard, employeePerformance, recalculate } from '../controllers/performanceController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.get('/dashboard', dashboard);
router.get('/employees/:id', employeePerformance);
router.post('/recalculate', authorize('admin'), recalculate);

export default router;
