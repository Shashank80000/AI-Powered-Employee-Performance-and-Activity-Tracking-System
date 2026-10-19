import { Router } from 'express';
import { ask, listRuns, metrics, rateRun, status } from '../controllers/agentController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

// Every role may use the agent; the scope checks in agentService limit each person to the data they may see.
router.use(protect);
router.get('/status', status);
router.get('/metrics', metrics);
router.post('/insights', ask);
router.get('/runs', listRuns);
router.post('/runs/:id/feedback', rateRun);

export default router;
