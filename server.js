// Refactored server.js - now using modular structure following SOLID principles
// Original file created by Maxime ALBERT for VLIZ

import { createApp, startServer } from './config/app.js';

// Create and start the application
const app = createApp();
startServer(app);