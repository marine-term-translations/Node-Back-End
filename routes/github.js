import express from "express";
import { diffLines } from "diff";
import { parse, stringify } from "yaml";
import { GitHubService } from "../services/githubService.js";
import { ERROR_MESSAGES, STATUS_CODES } from "../utils/constants.js";
import {
  validateGitHubToken,
  validateQueryParams,
  validateBodyFields,
  validateBranchPrefix,
  validateGitHubOwner,
} from "../middleware/validation.js";

const router = express.Router();

/**
 * GET /api/github/branches
 * Get branches for a repository filtered by key prefix
 */
router.get(
  "/branches",
  validateGitHubToken,
  validateQueryParams(["repo"]),
  validateGitHubOwner,
  async (req, res) => {
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
 */
router.get(
  "/content",
  validateGitHubToken,
  validateQueryParams(["repo", "path", "branch"]),
  validateGitHubOwner,
  async (req, res) => {
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
 */
router.get("/user", validateGitHubToken, async (req, res) => {
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
 */
router.get(
  "/reviewers",
  validateGitHubToken,
  validateQueryParams(["repo"]),
  validateGitHubOwner,
  async (req, res) => {
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

export default router;
