import { Router } from 'express';
import { changePassword, demoInfo, demoLogin, login, me } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/login', login);
router.get('/me', protect, me);
router.post('/password', protect, changePassword);
router.get('/demo', demoInfo);
router.post('/demo', demoLogin);

export default router;
