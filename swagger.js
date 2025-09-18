import swaggerAutogen from "swagger-autogen";
import dotenv from "dotenv";
import { PORT } from "./utils/constants.js";

// Load environment variables
dotenv.config();

const doc = {
  info: {
    title: "Marine Term Translations API",
    description: "API for managing GitHub repositories and translation workflows for marine terminology",
    version: "1.0.0",
  },
  host: `${process.env.DOMAIN_NAME}:${PORT}`,
  schemes: ["http"],
  securityDefinitions: {
    bearerAuth: {
      type: "apiKey",
      name: "authorization",
      in: "header",
      description: `GitHub Bearer Token Authentication

**How to get your GitHub token:**
1. Go to GitHub.com → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate a new token with 'repo' scope permissions
3. Copy the generated token

**How to use in Swagger UI:**
1. Click the 'Authorize' button below
2. Enter: Bearer YOUR_GITHUB_TOKEN (replace YOUR_GITHUB_TOKEN with your actual token)
3. Click 'Authorize' and then 'Close'

**Example format:** Bearer ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

**Required scopes:** repo (for repository access)`
    }
  },
  security: [
    {
      bearerAuth: []
    }
  ],
  tags: [
    {
      name: "Authentication",
      description: "GitHub OAuth authentication endpoints"
    },
    {
      name: "GitHub",
      description: "GitHub repository management endpoints"
    },
    {
      name: "Translation",
      description: "Translation service endpoints"
    },
    {
      name: "Analytics",
      description: "Analytics and reporting endpoints"
    }
  ]
};

const outputFile = "./swagger_output.json";
// Point to the route files where the actual endpoints are defined
const routes = [
  "./routes/auth.js",
  "./routes/github.js", 
  "./routes/translation.js",
  "./routes/leaderboard.js"
];

swaggerAutogen()(outputFile, routes, doc);
