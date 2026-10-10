import { Router } from 'express';
import { createManager, listAllManagers, resetPassword, updateManager } from '../controllers/userController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

// Account administration: admins only.
router.use(protect, authorize('admin'));
router.get('/managers', listAllManagers);
router.post('/managers', createManager);
router.patch('/managers/:id', updateManager);
router.post('/:id/password', resetPassword);

export default router;
