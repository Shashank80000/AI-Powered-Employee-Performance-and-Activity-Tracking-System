import { Router } from 'express';
import { createEmployee, deactivateEmployee, getEmployee, getMyProfile, listEmployees, listManagers, reactivateEmployee, updateEmployee } from '../controllers/employeeController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.get('/', authorize('admin', 'manager'), listEmployees);
router.post('/', authorize('admin'), createEmployee);
router.get('/managers', authorize('admin'), listManagers);
router.get('/me', authorize('employee'), getMyProfile);
router.get('/:id', getEmployee);
router.patch('/:id', authorize('admin', 'manager'), updateEmployee);
router.delete('/:id', authorize('admin'), deactivateEmployee);
router.post('/:id/reactivate', authorize('admin'), reactivateEmployee);

export default router;
