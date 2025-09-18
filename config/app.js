import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerFile from '../swagger_output.json' with { type: 'json' };
import { PORT } from '../utils/constants.js';

// Route imports
import authRoutes from '../routes/auth.js';
import githubRoutes from '../routes/github.js';
import translationRoutes from '../routes/translation.js';
import leaderboardRoutes from '../routes/leaderboard.js';

// Load environment variables
dotenv.config();

/**
 * Create and configure Express application
 */
export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Swagger documentation
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerFile));

  // Routes
  app.use("/api/github", authRoutes);
  app.use("/api/github", githubRoutes);
  app.use("/api/translation", translationRoutes);
  app.use("/api", leaderboardRoutes);

  return app;
}

/**
 * Start the server
 */
export function startServer(app) {
  app.listen(PORT, () => {
    console.log(`Backend server listening to http://localhost:${PORT}`);
    console.log(`Client ID is : ${process.env.GITHUB_CLIENT_ID}`);
  });
}