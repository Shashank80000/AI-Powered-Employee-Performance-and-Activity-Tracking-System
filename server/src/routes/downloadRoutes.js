import { Router } from 'express';
import { downloadInstaller, getDownloads } from '../controllers/downloadController.js';

const router = Router();

// Public, so the website's download page works before anyone has an account on this machine.
router.get('/', getDownloads);
router.get('/:file', downloadInstaller);

export default router;
