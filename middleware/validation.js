import { ERROR_MESSAGES, STATUS_CODES } from '../utils/constants.js';

/**
 * Validates GitHub token in request headers
 */
export const validateGitHubToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      error: "Unauthorized",
      message: ERROR_MESSAGES.UNAUTHORIZED,
    });
  }
  next();
};

/**
 * Validates required query parameters
 */
export const validateQueryParams = (requiredParams) => {
  return (req, res, next) => {
    for (const param of requiredParams) {
      if (!req.query[param]) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          error: "Bad Request",
          message: `The "${param}" query parameter is required.`,
        });
      }
    }
    next();
  };
};

/**
 * Validates required body fields
 */
export const validateBodyFields = (requiredFields) => {
  return (req, res, next) => {
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          error: "Bad Request", 
          message: `The "${field}" field is required in the request body.`,
        });
      }
    }
    next();
  };
};

/**
 * Validates branch name prefix
 */
export const validateBranchPrefix = (req, res, next) => {
  const { branch } = req.query;
  if (branch && !branch.startsWith(process.env.GITHUB_KEY_BRANCH)) {
    return res.status(STATUS_CODES.BAD_REQUEST).json({
      error: "Bad Request",
      message: ERROR_MESSAGES.INVALID_BRANCH_PREFIX,
    });
  }
  next();
};

/**
 * Validates environment variables
 */
export const validateGitHubOwner = (req, res, next) => {
  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    console.error("GitHub owner is missing in environment variables.");
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Internal Server Error",
      message: ERROR_MESSAGES.GITHUB_OWNER_MISSING,
    });
  }
  req.githubOwner = owner;
  next();
};