import { Router } from 'express';
import { getDay, getImage, listCameraEmployees, listScreenshots, saveResult, upsertDailyAnalysis } from '../controllers/internalController.js';
import { requireServiceKey } from '../middleware/authMiddleware.js';

const router = Router();

router.use(requireServiceKey);
router.get('/screenshots', listScreenshots);
router.get('/screenshots/:id/image', getImage);
router.patch('/screenshots/:id', saveResult);
router.get('/day/:employeeId', getDay);
router.get('/camera/employees', listCameraEmployees);
router.put('/daily-analyses', upsertDailyAnalysis);

export default router;
