import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorMiddleware.js';
import activityRoutes from './routes/activityRoutes.js';
import analysisRoutes from './routes/analysisRoutes.js';
import authRoutes from './routes/authRoutes.js';
import cameraRoutes from './routes/cameraRoutes.js';
import consentRoutes from './routes/consentRoutes.js';
import downloadRoutes from './routes/downloadRoutes.js';
import employeeRoutes from './routes/employeeRoutes.js';
import internalRoutes from './routes/internalRoutes.js';
import performanceRoutes from './routes/performanceRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import screenshotRoutes from './routes/screenshotRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import trackingRoutes from './routes/trackingRoutes.js';
import userRoutes from './routes/userRoutes.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  const clientOrigins = new Set([
    ...env.CLIENT_ORIGIN.split(',').map((origin) => origin.trim()),
    'https://ai-powered-employee-performance-and.vercel.app'
  ]);
  app.use(cors({ origin: [...clientOrigins] }));
  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'performance-tracker-api',
      database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString()
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/downloads', downloadRoutes);
  app.use('/api/employees', employeeRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/activity', activityRoutes);
  app.use('/api/performance', performanceRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/consent', consentRoutes);
  app.use('/api/tracking', trackingRoutes);
  app.use('/api/screenshots', screenshotRoutes);
  app.use('/api/analysis', analysisRoutes);
  app.use('/api/camera', cameraRoutes);
  app.use('/api/internal', internalRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
