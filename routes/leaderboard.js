import express from "express";
import { GitHubService } from "../services/githubService.js";
import { ERROR_MESSAGES, STATUS_CODES } from "../utils/constants.js";
import {
  validateGitHubToken,
  validateGitHubOwner,
} from "../middleware/validation.js";

const router = express.Router();

/**
 * GET /api/leaderboard
 * Get contributor leaderboard data across all repositories
 * #swagger.tags = ['Analytics']
 * #swagger.description = 'Get aggregated contributor statistics across all organization repositories'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.responses[200] = {
 *   description: 'Leaderboard data retrieved successfully',
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       leaderboard: {
 *         type: 'array',
 *         items: {
 *           type: 'object',
 *           properties: {
 *             userId: { type: 'string', description: 'GitHub username' },
 *             totalEdits: { type: 'number', description: 'Total commits across all projects' },
 *             projects: {
 *               type: 'object',
 *               description: 'Breakdown of commits per project',
 *               additionalProperties: { type: 'number' }
 *             }
 *           }
 *         }
 *       }
 *     }
 *   }
 * }
 */
router.get(
  "/leaderboard",
  validateGitHubToken,
  validateGitHubOwner,
  async (req, res) => {
    // #swagger.tags = ['Analytics']
    // #swagger.description = 'Get aggregated contributor statistics across all organization repositories'
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const leaderboardData = await githubService.getLeaderboardData();
      res.json(leaderboardData);
    } catch (error) {
      console.error("Error retrieving leaderboard data:", error);
      
      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message: error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

export default router;