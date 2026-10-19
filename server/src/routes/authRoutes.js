import { Router } from 'express';
import { changePassword, demoInfo, demoLogin, login, logout, me, setupAdmin, setupStatus } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/login', login);
router.post('/logout', protect, logout);
router.get('/setup', setupStatus);
router.post('/setup', setupAdmin);
router.get('/me', protect, me);
router.post('/password', protect, changePassword);
router.get('/demo', demoInfo);
router.post('/demo', demoLogin);

export default router;
