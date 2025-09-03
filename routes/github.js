import express from "express";
import { GitHubService, GitHubOrgService } from "../services/githubService.js";
import { ERROR_MESSAGES, STATUS_CODES } from "../utils/constants.js";
import {
  validateGitHubToken,
  validateQueryParams,
  validateBodyFields,
  validateBranchPrefix,
  validateGitHubOwner,
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams,
  validateWorkflowScope,
  validateWorkflowScopeConditional,
} from "../middleware/validation.js";

const router = express.Router();

/**
 * GET /api/github/branches
 * Get branches for a repository filtered by key prefix
 * #swagger.description = 'Get repository branches filtered by key prefix from GitHub'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['repo'] = {
 *   in: 'query',
 *   description: 'Repository name',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.responses[200] = {
 *   description: 'Branches retrieved successfully',
 *   schema: {
 *     type: 'array',
 *     items: {
 *       type: 'object',
 *       properties: {
 *         name: { type: 'string', description: 'Branch name' },
 *         commit: { type: 'object', description: 'Latest commit information' }
 *       }
 *     }
 *   }
 * }
 */
router.get(
  "/branches",
  validateGitHubToken,
  validateQueryParams(["repo"]),
  validateGitHubOwner,
  async (req, res) => {
    // #swagger.tags = ['GitHub']
    // #swagger.description = 'Get repository branches filtered by key prefix from GitHub'
    const { repo } = req.query;
    const token = req.headers.authorization;

    const keyBranchPrefix = process.env.GITHUB_KEY_BRANCH;
    if (!keyBranchPrefix) {
      console.error(
        "GitHub key branch prefix is missing in environment variables."
      );
      return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message:
          "GitHub key branch prefix is not set in environment variables.",
      });
    }

    try {
      const githubService = new GitHubService(token);
      const branches = await githubService.getBranches(repo);
      res.json(branches);
    } catch (error) {
      console.error("Error while retrieving branches:", error);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/tree
 * Get YAML files from repository tree
 * #swagger.description = 'Get YAML files from repository tree structure'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['repo'] = {
 *   in: 'query',
 *   description: 'Repository name',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['branch'] = {
 *   in: 'query',
 *   description: 'Branch name to get tree from',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.responses[200] = {
 *   description: 'Repository tree retrieved successfully',
 *   schema: {
 *     type: 'array',
 *     items: {
 *       type: 'object',
 *       properties: {
 *         path: { type: 'string', description: 'File path' },
 *         type: { type: 'string', description: 'File type' },
 *         sha: { type: 'string', description: 'Git SHA hash' }
 *       }
 *     }
 *   }
 * }
 */
router.get(
  "/tree",
  validateGitHubToken,
  validateQueryParams(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, branch } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const files = await githubService.getRepositoryTree(repo, branch);
      res.json(files);
    } catch (error) {
      console.error("Error while retrieving the file count:", error);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/content
 * Get content of a specific file
 * #swagger.description = 'Get content of a specific file from GitHub repository'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['repo'] = {
 *   in: 'query',
 *   description: 'Repository name',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['path'] = {
 *   in: 'query',
 *   description: 'File path in the repository',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['branch'] = {
 *   in: 'query',
 *   description: 'Branch name to get file from',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.responses[200] = {
 *   description: 'File content retrieved successfully',
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       content: { type: 'string', description: 'Base64 encoded file content' },
 *       encoding: { type: 'string', description: 'Content encoding' },
 *       size: { type: 'number', description: 'File size in bytes' }
 *     }
 *   }
 * }
 */
router.get(
  "/content",
  validateGitHubToken,
  validateQueryParams(["repo", "path", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    // #swagger.tags = ['GitHub']
    // #swagger.description = 'Get content of a specific file from GitHub repository'
    const { repo, path, branch } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const content = await githubService.getFileContent(repo, path, branch);
      res.json(content);
    } catch (error) {
      console.error("Error while retrieving the file content:", error);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/user
 * Get current GitHub user information
 * #swagger.description = 'Get current authenticated GitHub user information'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.responses[200] = {
 *   description: 'User information retrieved successfully',
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       login: { type: 'string', description: 'GitHub username' },
 *       name: { type: 'string', description: 'User display name' },
 *       email: { type: 'string', description: 'User email' }
 *     }
 *   }
 * }
 */
router.get("/user", validateGitHubToken, async (req, res) => {
  // #swagger.tags = ['GitHub']
  // #swagger.description = 'Get current authenticated GitHub user information'
  const token = req.headers.authorization;

  try {
    const githubService = new GitHubService(token);
    const user = await githubService.getUser();
    res.json(user);
  } catch (error) {
    console.error("Error while retrieving user:", error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Internal Server Error",
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
});

/**
 * GET /api/github/reviewers
 * Get list of reviewers from reviewers.json
 * #swagger.description = 'Get list of available reviewers for repository from reviewers.json'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['repo'] = {
 *   in: 'query',
 *   description: 'Repository name',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.responses[200] = {
 *   description: 'Reviewers list retrieved successfully',
 *   schema: {
 *     type: 'array',
 *     items: {
 *       type: 'object',
 *       properties: {
 *         username: { type: 'string', description: 'Reviewer GitHub username' },
 *         name: { type: 'string', description: 'Reviewer display name' }
 *       }
 *     }
 *   }
 * }
 */
router.get(
  "/reviewers",
  validateGitHubToken,
  validateQueryParams(["repo"]),
  validateGitHubOwner,
  async (req, res) => {
    // #swagger.tags = ['GitHub']
    // #swagger.description = 'Get list of available reviewers for repository from reviewers.json'
    const { repo } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const reviewers = await githubService.getReviewers(repo);
      console.log(reviewers);
      res.json(reviewers);
    } catch (error) {
      console.error("Error reading reviewers.json:", error);

      if (error.message.includes("not found")) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          error: "Reviewers Not Found",
          message: ERROR_MESSAGES.REVIEWERS_NOT_FOUND,
        });
      }

      if (error.message.includes("No valid reviewers")) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          error: "Bad Request",
          message: ERROR_MESSAGES.NO_VALID_REVIEWERS,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: "Error reading or parsing reviewers.json file.",
      });
    }
  }
);

/**
 * POST /api/github/comment
 * Create a comment on a pull request
 * #swagger.description = 'Create a comment on a pull request'
 */
router.post(
  "/comment",
  validateBodyFields([
    "token",
    "pull_number",
    "repo",
    "comment",
    "path",
    "sha",
    "line",
    "side",
  ]),
  async (req, res) => {
    const { token, pull_number, repo, comment, path, sha, line, side } =
      req.body;

    try {
      const githubService = new GitHubService(token);
      const response = await githubService.createPRComment(
        repo,
        pull_number,
        comment,
        sha,
        path,
        line,
        side
      );
      res.json(response);
    } catch (error) {
      console.error("Error while creating comment:", error);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/diff
 * Get detailed diff with file contents between branch and main
 * #swagger.description = 'Get detailed diff with file contents between branch and main'
 */
router.get(
  "/diff",
  validateGitHubToken,
  validateQueryParams(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, branch } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const filesContent = await githubService.getDetailedDiff(repo, branch);
      res.json(filesContent);
    } catch (error) {
      console.error("Error while retrieving diff and file contents:", error);

      if (error.response) {
        // Handle GitHub API-specific errors
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      // Handle other unexpected errors
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred while retrieving the diff.",
      });
    }
  }
);

/**
 * GET /api/github/conflicts
 * Check for conflicts between branch and main
 * #swagger.description = 'Check for conflicts between branch and main'
 */
router.get(
  "/conflicts",
  validateGitHubToken,
  validateQueryParams(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, branch } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const conflicts = await githubService.getConflicts(repo, branch);

      if (conflicts.length === 0) {
        return res.status(STATUS_CODES.NO_CONTENT).send("No conflicts found");
      }

      res.json(conflicts);
    } catch (error) {
      console.error("Error while checking conflicts:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * PUT /api/github/update
 * Update file with translations
 */
router.put(
  "/update",
  validateGitHubToken,
  validateBodyFields(["repo", "translations", "branch", "filename"]),
  validateWorkflowScopeConditional,
  validateGitHubOwner,
  async (req, res) => {
    const { repo, translations, branch, filename } = req.body;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const response = await githubService.updateFileWithTranslations(
        repo,
        translations,
        branch,
        filename
      );
      res.json(response.data);
    } catch (error) {
      console.error("Error while updating file:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/commits
 * Get commits for a repository
 */
router.get(
  "/commits",
  validateGitHubToken,
  validateQueryParams(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, branch, since } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const commits = await githubService.getCommits(repo, branch, since);
      res.json(commits);
    } catch (error) {
      console.error("Error while retrieving commits:", error);
      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/pr/comments
 * Get pull request comments by PR number
 */
router.get(
  "/pr/comments",
  validateGitHubToken,
  validateQueryParams(["repo", "prNumber"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, prNumber } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const comments = await githubService.getPRComments(repo, prNumber);
      res.json(comments);
    } catch (error) {
      console.error("Error while retrieving PR comments:", error);
      res
        .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
        .send("Server internal error");
    }
  }
);

/**
 * GET /api/github/changed
 * Get changed files and their status
 */
router.get(
  "/changed",
  validateGitHubToken,
  validateQueryParams(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, branch } = req.query;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const result = await githubService.getChangedFiles(repo, branch);
      res.json(result);
    } catch (error) {
      console.error("Error while retrieving changed files:", error);

      if (error.message.includes("No pull request found")) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          error: "Not Found",
          message: "No pull request found for this branch.",
        });
      }

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * PUT /api/github/merge
 * Merge branch to main
 */
router.put(
  "/merge",
  validateGitHubToken,
  validateBodyFields(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { repo, branch } = req.body;
    const token = req.headers.authorization;

    try {
      const githubService = new GitHubService(token);
      const result = await githubService.mergeBranch(repo, branch);
      res.json(result);
    } catch (error) {
      console.error("Error during merge:", error);

      if (error.status === 404) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          error: "Not Found",
          message: error.message,
        });
      }

      if (error.status === 400) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          error: error.type || "Merge Failed",
          message: error.message,
        });
      }

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message ||
            "Error occurred while communicating with the GitHub API.",
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred during the merge process.",
      });
    }
  }
);

/**
 * GET /api/github/pr/:prNumber/file/:filePath/approved
 * Check if a specific file in a pull request has been approved
 */
router.get(
  "/pr/:prNumber/file/:filePath/approved",
  validateGitHubToken,
  validateQueryParams(["repo", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
    const { prNumber, filePath } = req.params;
    const { repo, branch } = req.query;
    const token = req.headers.authorization;

    // Validate PR number
    if (!prNumber || isNaN(prNumber)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: "Bad Request",
        message: "Valid PR number is required.",
      });
    }

    if (!filePath) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: "Bad Request",
        message: "File path is required.",
      });
    }

    try {
      const githubService = new GitHubService(token);
      const approvalStatus = await githubService.checkFileApproval(
        repo,
        parseInt(prNumber),
        filePath,
        branch
      );

      if (approvalStatus.approved) {
        res.json({
          approved: true,
          approvedLabels: approvalStatus.approvedLabels,
          unapprovedLabels: approvalStatus.unapprovedLabels,
          eligible_reviewers: approvalStatus.eligible_reviewers,
          checked_file: approvalStatus.checked_file,
        });
      } else {
        res.json({
          approved: false,
          approvedLabels: approvalStatus.approvedLabels,
          unapprovedLabels: approvalStatus.unapprovedLabels,
          eligible_reviewers: approvalStatus.eligible_reviewers,
          checked_file: approvalStatus.checked_file,
        });
      }
    } catch (error) {
      console.error("Error checking file approval:", error);

      if (error.status === 404) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          error: "Not Found",
          message: "File not found or PR does not exist.",
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * POST /api/github/pr/:prNumber/file/:filePath/approve
 * Approve a specific file in a pull request
 */
router.post(
  "/pr/:prNumber/file/:filePath/approve",
  validateGitHubToken,
  validateBodyFields(["repo", "sha", "lang", "label_name"]),
  validateGitHubOwner,
  async (req, res) => {
    const { prNumber, filePath } = req.params;
    const { repo, sha, lang, label_name } = req.body;
    const token = req.headers.authorization;

    // Validate PR number
    if (!prNumber || isNaN(prNumber)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: "Bad Request",
        message: "Valid PR number is required.",
      });
    }

    if (!filePath) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: "Bad Request",
        message: "File path is required.",
      });
    }

    try {
      const githubService = new GitHubService(token);
      const response = await githubService.approveFile(
        repo,
        parseInt(prNumber),
        filePath,
        sha,
        lang,
        label_name
      );

      res.json({
        success: true,
        comment: response,
        message: `File ${decodeURIComponent(
          filePath
        )} has been approved for label "${label_name}" in language "${lang}".`,
      });
    } catch (error) {
      console.error("Error approving file:", error);

      if (error.status === 404) {
        return res.status(STATUS_CODES.NOT_FOUND).json({
          error: "Not Found",
          message: "File not found or PR does not exist.",
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

// Organization Management Routes

/**
 * GET /api/github/org/members
 * Get all members of the organization
 * #swagger.description = 'Get all members of the GitHub organization'
 */
router.get(
  "/org/members",
  validateGitHubOrgToken,
  validateGitHubOrg,
  async (req, res) => {
    // #swagger.tags = ['Organization']
    // #swagger.description = 'Get all members of the GitHub organization'
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const members = await githubOrgService.getOrganizationMembers();
      res.json(members);
    } catch (error) {
      console.error("Error retrieving organization members:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * PUT /api/github/org/members/:username
 * Invite a user to the organization
 * #swagger.description = 'Invite a user to the GitHub organization'
 */
router.put(
  "/org/members/:username",
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams(["username"]),
  async (req, res) => {
    // #swagger.tags = ['Organization']
    // #swagger.description = 'Invite a user to the GitHub organization'
    const { username } = req.params;
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const result = await githubOrgService.inviteUserToOrganization(username);
      res.json(result);
    } catch (error) {
      console.error("Error inviting user to organization:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * DELETE /api/github/org/members/:username
 * Remove a user from the organization
 * #swagger.description = 'Remove a user from the GitHub organization'
 */
router.delete(
  "/org/members/:username",
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams(["username"]),
  async (req, res) => {
    // #swagger.tags = ['Organization']
    // #swagger.description = 'Remove a user from the GitHub organization'
    const { username } = req.params;
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const success = await githubOrgService.removeUserFromOrganization(username);
      
      if (success) {
        res.status(STATUS_CODES.NO_CONTENT).send();
      } else {
        res.status(STATUS_CODES.BAD_REQUEST).json({
          error: "Bad Request",
          message: "Failed to remove user from organization",
        });
      }
    } catch (error) {
      console.error("Error removing user from organization:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

// Team Management Routes

/**
 * GET /api/github/org/teams
 * Get all teams in the organization
 * #swagger.description = 'Get all teams in the GitHub organization'
 */
router.get(
  "/org/teams",
  validateGitHubOrgToken,
  validateGitHubOrg,
  async (req, res) => {
    // #swagger.tags = ['Teams']
    // #swagger.description = 'Get all teams in the GitHub organization'
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const teams = await githubOrgService.getOrganizationTeams();
      res.json(teams);
    } catch (error) {
      console.error("Error retrieving organization teams:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * GET /api/github/org/teams/:team_slug/members
 * Get all members of a specific team
 * #swagger.description = 'Get all members of a specific team in the GitHub organization'
 */
router.get(
  "/org/teams/:team_slug/members",
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams(["team_slug"]),
  async (req, res) => {
    // #swagger.tags = ['Teams']
    // #swagger.description = 'Get all members of a specific team in the GitHub organization'
    const { team_slug } = req.params;
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const members = await githubOrgService.getTeamMembers(team_slug);
      res.json(members);
    } catch (error) {
      console.error("Error retrieving team members:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * PUT /api/github/org/teams/:team_slug/members/:username
 * Add a user to a team
 * #swagger.description = 'Add a user to a specific team in the GitHub organization'
 */
router.put(
  "/org/teams/:team_slug/members/:username",
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams(["team_slug", "username"]),
  async (req, res) => {
    // #swagger.tags = ['Teams']
    // #swagger.description = 'Add a user to a specific team in the GitHub organization'
    const { team_slug, username } = req.params;
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const result = await githubOrgService.addUserToTeam(team_slug, username);
      res.json(result);
    } catch (error) {
      console.error("Error adding user to team:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * DELETE /api/github/org/teams/:team_slug/members/:username
 * Remove a user from a team
 * #swagger.description = 'Remove a user from a specific team in the GitHub organization'
 */
router.delete(
  "/org/teams/:team_slug/members/:username",
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams(["team_slug", "username"]),
  async (req, res) => {
    // #swagger.tags = ['Teams']
    // #swagger.description = 'Remove a user from a specific team in the GitHub organization'
    const { team_slug, username } = req.params;
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const success = await githubOrgService.removeUserFromTeam(team_slug, username);
      
      if (success) {
        res.status(STATUS_CODES.NO_CONTENT).send();
      } else {
        res.status(STATUS_CODES.BAD_REQUEST).json({
          error: "Bad Request",
          message: "Failed to remove user from team",
        });
      }
    } catch (error) {
      console.error("Error removing user from team:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * POST /api/github/org/teams/:from_team_slug/move/:to_team_slug/:username
 * Move a user from one team to another
 * #swagger.description = 'Move a user from one team to another in the GitHub organization'
 */
router.post(
  "/org/teams/:from_team_slug/move/:to_team_slug/:username",
  validateGitHubOrgToken,
  validateGitHubOrg,
  validateRouteParams(["from_team_slug", "to_team_slug", "username"]),
  async (req, res) => {
    // #swagger.tags = ['Teams']
    // #swagger.description = 'Move a user from one team to another in the GitHub organization'
    const { from_team_slug, to_team_slug, username } = req.params;
    const token = req.headers.authorization;

    try {
      const githubOrgService = new GitHubOrgService(token);
      const result = await githubOrgService.moveUserBetweenTeams(
        from_team_slug,
        to_team_slug,
        username
      );
      res.json(result);
    } catch (error) {
      console.error("Error moving user between teams:", error);

      if (error.response) {
        return res.status(error.response.status).json({
          error: "GitHub API Error",
          message:
            error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
        });
      }

      res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
        error: "Internal Server Error",
        message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      });
    }
  }
);

/**
 * POST /api/github/repos/create
 * Create a new repository with initial configuration and workflow files
 * #swagger.description = 'Create a new repository in the organization with initial config and workflows'
 * #swagger.parameters['authorization'] = {
 *   in: 'header',
 *   description: 'Bearer token for GitHub authentication (format: Bearer YOUR_GITHUB_TOKEN)',
 *   required: true,
 *   type: 'string'
 * }
 * #swagger.parameters['body'] = {
 *   in: 'body',
 *   description: 'Repository creation parameters',
 *   required: true,
 *   schema: {
 *     type: 'object',
 *     required: ['vocabularyName', 'languageTag'],
 *     properties: {
 *       vocabularyName: {
 *         type: 'string',
 *         description: 'Vocabulary name (e.g., P02)',
 *         example: 'P02'
 *       },
 *       languageTag: {
 *         type: 'string',
 *         description: 'Language tag (e.g., en, nl, es)',
 *         example: 'nl'
 *       }
 *     }
 *   }
 * }
 * #swagger.responses[201] = {
 *   description: 'Repository created successfully',
 *   schema: {
 *     type: 'object',
 *     properties: {
 *       repository: {
 *         type: 'object',
 *         properties: {
 *           name: { type: 'string', description: 'Repository name' },
 *           html_url: { type: 'string', description: 'Repository URL' },
 *           clone_url: { type: 'string', description: 'Clone URL' }
 *         }
 *       },
 *       files: {
 *         type: 'array',
 *         description: 'Created files information'
 *       }
 *     }
 *   }
 * }
 */
router.post(
  "/repos/create",
  validateGitHubToken,
  validateWorkflowScope,
  validateBodyFields(["vocabularyName", "languageTag"]),
  validateGitHubOwner,
  async (req, res) => {
    // #swagger.tags = ['Repository']
    // #swagger.description = 'Create a new repository in the organization with initial config and workflows'
    const { vocabularyName, languageTag } = req.body;
    const token = req.headers.authorization;

    // Validate input format
    if (!/^[A-Za-z0-9_-]+$/.test(vocabularyName)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: "Bad Request",
        message: "vocabularyName must contain only alphanumeric characters, hyphens, and underscores"
      });
    }

    if (!/^[a-z]{2,3}$/.test(languageTag)) {
      return res.status(STATUS_CODES.BAD_REQUEST).json({
        error: "Bad Request", 
        message: "languageTag must be a valid language code (2-3 lowercase letters)"
      });
    }

    try {
      const githubService = new GitHubService(token);
      
      console.log(`Processing repository creation request for ${vocabularyName}-${languageTag.toUpperCase()}`);
      const result = await githubService.createRepositoryWithInitialFiles(vocabularyName, languageTag);
      
      res.status(STATUS_CODES.CREATED).json({
        success: true,
        message: `Repository ${vocabularyName}-${languageTag.toUpperCase()} created successfully`,
        repository: {
          name: result.repository.name,
          html_url: result.repository.html_url,
          clone_url: result.repository.clone_url,
          ssh_url: result.repository.ssh_url
        },
        files: result.files.map(file => ({
          path: file.content.path,
          url: file.content.html_url,
          sha: file.content.sha
        }))
      });
    } catch (error) {
      console.error("Error creating repository:", error);

      if (error.response) {
        // Handle GitHub API-specific errors
        const status = error.response.status;
        const message = error.response.data?.message || ERROR_MESSAGES.GITHUB_API_ERROR;
        
        if (status === 422) {
          return res.status(STATUS_CODES.CONFLICT).json({
            error: "Repository Already Exists",
            message: `Repository ${vocabularyName}-${languageTag.toUpperCase()} already exists in the organization`,
            details: message
          });
        } else if (status === 403) {
          return res.status(STATUS_CODES.UNAUTHORIZED).json({
            error: "Insufficient Permissions",
            message: "The provided token does not have sufficient permissions to create repositories",
            details: message
          });
        } else if (status === 404) {
          return res.status(STATUS_CODES.NOT_FOUND).json({
            error: "Organization Not Found",
            message: "The specified organization was not found or is not accessible",
            details: message
          });
        } else {
          return res.status(status).json({
            error: "GitHub API Error",
            message: message,
            details: `HTTP ${status} error from GitHub API`
          });
        }
      } else if (error.message.includes('template')) {
        // Handle template-related errors
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
          error: "Template Error",
          message: "Failed to read or process template files",
          details: error.message
        });
      } else if (error.message.includes('already exists')) {
        // Handle repository already exists
        return res.status(STATUS_CODES.CONFLICT).json({
          error: "Repository Already Exists",
          message: error.message
        });
      } else {
        // Handle other errors
        return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred while creating the repository",
          details: error.message
        });
      }
    }
  }
);

export default router;
