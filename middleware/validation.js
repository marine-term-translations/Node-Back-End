import { ERROR_MESSAGES, STATUS_CODES } from '../utils/constants.js';
import { Octokit } from 'octokit';

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
 * Validates required route parameters
 */
export const validateRouteParams = (requiredParams) => {
  return (req, res, next) => {
    for (const param of requiredParams) {
      if (!req.params[param]) {
        return res.status(STATUS_CODES.BAD_REQUEST).json({
          error: "Bad Request",
          message: `The "${param}" parameter is required.`,
        });
      }
    }
    next();
  };
};

/**
 * Validates GitHub organization token in request headers
 */
export const validateGitHubOrgToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) {
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      error: "Unauthorized",
      message: ERROR_MESSAGES.ORG_TOKEN_UNAUTHORIZED,
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

/**
 * Validates GitHub organization environment variables
 */
export const validateGitHubOrg = (req, res, next) => {
  const org = process.env.GITHUB_ORG;
  if (!org) {
    console.error("GitHub organization is missing in environment variables.");
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Internal Server Error",
      message: ERROR_MESSAGES.GITHUB_ORG_MISSING,
    });
  }
  req.githubOrg = org;
  next();
};

/**
 * Validates that the GitHub token has required scopes for workflow operations
 */
export const validateWorkflowScope = async (req, res, next) => {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.status(STATUS_CODES.UNAUTHORIZED).json({
      error: "Unauthorized",
      message: ERROR_MESSAGES.UNAUTHORIZED,
    });
  }

  try {
    const octokit = new Octokit({ auth: token });
    
    // Get the current token's scopes by making a request to the GitHub API
    const response = await octokit.request('GET /user');
    
    // GitHub includes token scopes in the X-OAuth-Scopes header
    const scopes = response.headers['x-oauth-scopes'] || '';
    const scopeArray = scopes.split(',').map(s => s.trim()).filter(s => s);
    
    // Check if workflow scope is present
    if (!scopeArray.includes('workflow') && !scopeArray.includes('repo')) {
      console.error(`Token missing workflow scope. Current scopes: ${scopes}`);
      return res.status(STATUS_CODES.UNAUTHORIZED).json({
        error: "Insufficient Permissions",
        message: ERROR_MESSAGES.WORKFLOW_SCOPE_REQUIRED,
        details: `Current token scopes: ${scopes}. Required: 'workflow' or 'repo' scope.`
      });
    }
    
    req.tokenScopes = scopeArray;
    next();
  } catch (error) {
    console.error("Error validating token scopes:", error);
    
    if (error.response) {
      return res.status(error.response.status).json({
        error: "GitHub API Error",
        message: error.response.data.message || ERROR_MESSAGES.GITHUB_API_ERROR,
      });
    }
    
    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      error: "Internal Server Error",
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
    });
  }
};

/**
 * Conditionally validates workflow scope only if the file being updated is a workflow file
 */
export const validateWorkflowScopeConditional = async (req, res, next) => {
  const { filename } = req.body;
  
  // Check if the file is a workflow file
  if (filename && filename.startsWith('.github/workflows/')) {
    // Apply workflow scope validation
    return validateWorkflowScope(req, res, next);
  }
  
  // Skip validation for non-workflow files
  next();
};