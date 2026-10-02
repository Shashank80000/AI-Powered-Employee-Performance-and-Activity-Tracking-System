import { Router } from 'express';
import { createTask, deleteTask, listTasks, updateTask } from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.get('/', listTasks);
router.post('/', authorize('admin', 'manager'), createTask);
router.patch('/:id', updateTask);
router.delete('/:id', authorize('admin', 'manager'), deleteTask);

export default router;
