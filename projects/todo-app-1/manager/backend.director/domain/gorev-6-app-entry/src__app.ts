import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import { errorHandler } from '@/middlewares/errorHandler';

const app: Application = express();

// Global Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check Route
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Error Handling Middleware
app.use(errorHandler);

export default app;
