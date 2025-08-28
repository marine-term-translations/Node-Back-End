// Constants and environment configuration
export const PORT = 5000;

export const GITHUB_SCOPES = "write:packages%20write:repo_hook%20read:repo_hook%20repo";

export const GITHUB_API_VERSION = "2022-11-28";

export const ERROR_MESSAGES = {
  GITHUB_CLIENT_ID_MISSING: "GitHub Client ID is missing in the environment variables.",
  GITHUB_CLIENT_SECRET_MISSING: "GitHub Client ID or Client Secret is missing in the environment variables.",
  GITHUB_OWNER_MISSING: "GitHub owner is not set in environment variables.",
  GITHUB_ORG_MISSING: "GitHub organization is not set in environment variables.",
  GITHUB_ORG_TOKEN_MISSING: "GitHub organization token is not set in environment variables.",
  UNAUTHORIZED: "Authorization token is required in the headers.",
  ORG_TOKEN_UNAUTHORIZED: "Organization admin token is required in the headers.",
  REPO_REQUIRED: 'The "repo" query parameter is required.',
  BRANCH_REQUIRED: 'The "branch" query parameter is required.',
  CODE_REQUIRED: 'The "code" field is required.',
  USERNAME_REQUIRED: 'The "username" parameter is required.',
  TEAM_SLUG_REQUIRED: 'The "team_slug" parameter is required.',
  INVALID_BRANCH_PREFIX: "Invalid branch name. The branch name must start with the specified key branch prefix.",
  REVIEWERS_NOT_FOUND: "reviewers.json file not found in the main branch.",
  NO_VALID_REVIEWERS: "No valid reviewers found in reviewers.json.",
  USER_NOT_FOUND: "User not found.",
  TEAM_NOT_FOUND: "Team not found.",
  ORG_NOT_FOUND: "Organization not found.",
  USER_ALREADY_MEMBER: "User is already a member.",
  USER_NOT_MEMBER: "User is not a member.",
  TRANSLATION_FIELDS_REQUIRED: '"text" and "target" fields are required in the request body.',
  TRANSLATION_ERROR: "An error occurred while translating the text.",
  INTERNAL_SERVER_ERROR: "An unexpected error occurred.",
  GITHUB_API_ERROR: "An error occurred while communicating with the GitHub API.",
  GATEWAY_TIMEOUT: "No response received from GitHub API."
};

export const STATUS_CODES = {
  OK: 200,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  GATEWAY_TIMEOUT: 504
};