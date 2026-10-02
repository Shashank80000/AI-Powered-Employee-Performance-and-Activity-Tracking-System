import { Router } from 'express';
import {
  getCameraConsent,
  listOwnObservations,
  listTeamObservations,
  recordObservation,
  saveCameraConsent,
  withdrawCameraConsent
} from '../controllers/cameraController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);

// Managers see their own team's camera labels; admins see everyone's. There are no images to see.
router.get('/team', authorize('manager', 'admin'), listTeamObservations);

// The person's own camera consent and observations (camera-agent and the dashboard).
router.get('/consent', authorize('employee'), getCameraConsent);
router.put('/consent', authorize('employee'), saveCameraConsent);
router.delete('/consent', authorize('employee'), withdrawCameraConsent);
router.post('/observations', authorize('employee'), recordObservation);
router.get('/observations', authorize('employee'), listOwnObservations);

export default router;
