import { Router } from 'express';
import { getConsent, saveConsent, withdrawConsent } from '../controllers/consentController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect, authorize('employee'));
router.get('/', getConsent);
router.put('/', saveConsent);
router.delete('/', withdrawConsent);

export default router;
