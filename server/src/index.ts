import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, AppError } from './middleware/error.js';
import healthRoutes from './routes/health.routes.js';
import apiV1Routes from './routes/index.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// CORS configuration
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8443,http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin or any localhost/127.0.0.1 development origin
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
      ) {
        callback(null, true);
      } else {
        callback(new Error(`Origin '${origin}' not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-emergency-token', 'emergency-token'],
  })
);

// Standard middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// System health check
app.use('/api/health', healthRoutes);

// API v1 routes
app.use('/api/v1', apiV1Routes);

// 404 Handler
app.use((_req, _res, next) => {
  next(new AppError('Endpoint not found', 404));
});

// Centralized error handling middleware
app.use(errorHandler);

import { startSosEscalationSweeper } from './services/sosEscalation.service.js';

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🚀 RuralCare Backend API running on port ${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`🔐 API v1 Base:  http://localhost:${PORT}/api/v1`);
  console.log(`🏥 Mode:         ${process.env.NODE_ENV || 'development'}`);
  console.log(`=========================================`);

  // Start background 10s sweeper for SOS escalation deadlines
  startSosEscalationSweeper();
});

// Graceful shutdown
function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Gracefully shutting down...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export default app;

