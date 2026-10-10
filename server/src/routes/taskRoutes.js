import { Router } from 'express';
import { addComment, createTask, deleteTask, listTasks, reviewTask, updateTask } from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/roleMiddleware.js';

const router = Router();

router.use(protect);
router.get('/', listTasks);
router.post('/', authorize('admin', 'manager'), createTask);
router.patch('/:id', updateTask);
router.delete('/:id', authorize('admin', 'manager'), deleteTask);
router.post('/:id/comments', addComment);
router.post('/:id/review', authorize('admin', 'manager'), reviewTask);

export default router;
