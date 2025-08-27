import express from 'express';
import axios from 'axios';
import { ERROR_MESSAGES, STATUS_CODES, GITHUB_SCOPES } from '../utils/constants.js';
import { validateBodyFields } from '../middleware/validation.js';

const router = express.Router();

/**
 * GET /api/github/oauth/link
 * Generate GitHub OAuth authorization link
 */
router.get("/oauth/link", async (req, res) => {
  const client_id = process.env.GITHUB_CLIENT_ID;

  // Validate the presence of the GitHub Client ID
  if (!client_id) {
    console.error("GitHub Client ID is missing.");
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Internal Server Error",
      message: ERROR_MESSAGES.GITHUB_CLIENT_ID_MISSING,
    });
  }

  // Respond with the OAuth link
  res.json({ client_id, scope: GITHUB_SCOPES });
});

/**
 * POST /api/github/token
 * Exchange OAuth code for access token
 */
router.post("/token", validateBodyFields(['code']), async (req, res) => {
  const { code } = req.body;
  const client_id = process.env.GITHUB_CLIENT_ID;
  const client_secret = process.env.GITHUB_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    console.error("GitHub Client ID or Client Secret is missing.");
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Internal Server Error",
      message: ERROR_MESSAGES.GITHUB_CLIENT_SECRET_MISSING,
    });
  }

  try {
    const response = await axios.post(
      "https://github.com/login/oauth/access_token",
      new URLSearchParams({
        client_id,
        client_secret,
        code: code,
      }),
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (response.status !== STATUS_CODES.OK) {
      console.error(
        "GitHub API responded with a non-200 status code:",
        response.status
      );
      return res.status(response.status).json({
        error: "GitHub API Error",
        message: `Received status code ${response.status} from GitHub API.`,
      });
    }
    
    if (response.data.error) {
      console.error(
        "GitHub API responded with a error with 200 status code:",
        response.data.error_description
      );
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: response.data.error,
        message: response.data.error_description,
      });
    }

    res.json(response.data);
  } catch (error) {
    if (error.response) {
      // Server responded with a status other than 2xx
      console.error(
        "GitHub API error:",
        error.response.status,
        error.response.data
      );
      res.status(error.response.status).json({
        error: "GitHub API Error",
        message:
          error.response.data.error ||
          ERROR_MESSAGES.GITHUB_API_ERROR,
      });
    } else if (error.request) {
      // Request was made but no response was received
      console.error("No response from GitHub API:", error.request);
      res.status(STATUS_CODES.GATEWAY_TIMEOUT).json({
        error: "Gateway Timeout",
        message: ERROR_MESSAGES.GATEWAY_TIMEOUT,
      });
    } else {
      // Something happened in setting up the request
      console.error("Error while setting up the request:", error.message);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
});

export default router;