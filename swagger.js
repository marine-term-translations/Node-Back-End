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
      description: "Bearer token for GitHub authentication. Format: Bearer YOUR_GITHUB_TOKEN"
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
    }
  ]
};

const outputFile = "./swagger_output.json";
// Point to the route files where the actual endpoints are defined
const routes = [
  "./routes/auth.js",
  "./routes/github.js", 
  "./routes/translation.js"
];

swaggerAutogen()(outputFile, routes, doc);
