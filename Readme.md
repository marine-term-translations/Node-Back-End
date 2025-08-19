![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/marine-term-translations/Node-Back-End?utm_source=oss&utm_medium=github&utm_campaign=marine-term-translations%2FNode-Back-End&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

# Backend Server

This project connects a term translation website with files in a specified GitHub repository (link to [Demo_Repo_Translate_Term](https://github.com/marine-term-translations/Demo_Repo_Translate_Term)).
This backend server using Express, Axios, CORS, Dotenv, and Octokit to interact with the GitHub API. The server provides several endpoints for managing GitHub OAuth tokens, retrieving file content, listing YAML files, updating translations, and managing pull requests.

## Getting Started
### Prerequisites

Make sure you have the following tools installed on your machine:

- [Node.js v20.15.0](https://nodejs.org/)
- [Docker](https://docs.docker.com/get-docker/)
- [Docker Compose](https://docs.docker.com/compose/install/)

### Deployment Instructions

1. **Clone the Repository**  
   First, clone the repository to your local machine:
   ```bash
   git clone https://github.com/marine-term-translations/Back-End.git
   cd project-repo
   ```

2. **Change environment variable**
   If you deploy the project in a different environment or repository, it is recommended to update the following variables in the `.env` file:
   - `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for GitHub OAuth.
   - `GITHUB_OWNER` for the owner (user or organization) of the target repository.
   - `DOMAIN_NAME` for the backend server's domain.
3. **Build the Docker Image**  
   Build the project Docker image locally:
   ```bash
   docker compose build
   ```

4. **Run Docker Compose**  
   Deploy the server using Docker Compose:
   ```bash
   docker-compose up -d
   ```

5. **Check Deployment**  
   After deployment, you can verify that the server is running by accessing:
   ```
   https://[Your-back-end-url]:5002/api-docs
   ```

## API Documentation

### Swagger API

This project includes a Swagger-based API documentation for connecting the translation website to a GitHub repository. Below are the available API endpoints.

### Endpoints

#### 1. **GET /api/github/oauth/link**  
   Fetches the OAuth link for GitHub authentication.  

   ##### **Description:**  
   This endpoint returns the necessary GitHub OAuth link for user authentication.  

   ##### **Responses:**
   - `200`: OK  
     Returns the GitHub `client_id` and required `scope` for the OAuth process.
   - `500`: Internal Server Error  
     Occurs when the GitHub Client ID is missing in the environment variables. The error message will specify that the `GITHUB_CLIENT_ID` is not set.

#### 2. **POST /api/github/token**  
   Exchanges a GitHub OAuth authorization code for an access token.

   ##### **Description:**  
   This endpoint accepts a GitHub OAuth authorization code and returns the associated access token.

   ##### **Body Parameters:**
   - `code`: (string) GitHub OAuth authorization code, required.

   ##### **Responses:**
   - `200`: OK
     Returns the GitHub OAuth access token.
   - `400`: Bad Request
     Occurs if the `code` field is missing or if GitHub API returns an error.
   - `500`: Internal Server Error
     Occurs when the GitHub Client ID or Client Secret is missing in the environment variables, or if there is an internal server issue.
   - `504`: Gateway Timeout
     Occurs if no response is received from the GitHub API.

#### 3. **GET /api/github/branches**  
   Retrieves the branches from the specified GitHub repository that match a specified prefix.

   ##### **Description:**  
   This endpoint fetches branches from a GitHub repository and filters them based on a prefix defined in the environment variable `GITHUB_KEY_BRANCH`. For each branch, it also retrieves the date of the latest commit.

   ##### **Query Parameters:**
   - `repo`: (string) GitHub repository name, required.

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns an array of branches with their latest commit date.  
     ```json
     [
       {
         "name": "branch-name",
         "lastCommit": "2023-08-14T12:00:00Z"
       }
     ]
     ```
   - `400`: Bad Request  
     Occurs if the `repo` query parameter is missing.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if there are missing environment variables (`GITHUB_OWNER`, `GITHUB_KEY_BRANCH`) or if an internal error occurs during branch retrieval.
   - GitHub API errors are returned with the appropriate status code and error message.

#### 4. **GET /api/github/diff**  
   Retrieves the differences between the `main` branch and a specified branch, including the content of the changed files.

   ##### **Description:**  
   This endpoint fetches the differences between the `main` branch and a specified branch in a GitHub repository. If a pull request exists for the specified branch, it fetches the changed files in the pull request. Otherwise, it compares the `main` branch and the specified branch directly. The response includes the content of each changed file.

   ##### **Query Parameters:**
   - `repo`: (string) GitHub repository name, required.
   - `branch`: (string) Branch name, required.

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns an array of files with their content and filename.  
     ```json
     [
       {
         "filename": "path/to/file.yaml",
         "content": {
           "key1": "value1",
           "key2": "value2"
         }
       }
     ]
     ```
   - `400`: Bad Request  
     Occurs if the `repo` or `branch` query parameter is missing or if the branch name does not start with the key branch prefix defined in the environment variable `GITHUB_KEY_BRANCH`.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if the environment variable `GITHUB_OWNER` is missing, if an internal error occurs during the retrieval of the diff, or if the content of a file cannot be retrieved.
   - GitHub API errors are returned with the appropriate status code and error message.

#### 5. **GET /api/github/conflicts**  
   Detects translation conflicts between a specified branch and the `main` branch in a GitHub repository.

   ##### **Description:**  
   This endpoint compares translation files between a specified branch and the `main` branch. It identifies any conflicts in the translation labels and returns a list of files with conflicting translations, including the differences in values.

   ##### **Query Parameters:**
   - `repo`: (string) GitHub repository name, required.
   - `branch`: (string) Branch name, required.

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns a list of files with conflicts in translations, if any.  
     ```json
     [
       {
         "filename": "path/to/file.yaml",
         "conflicts": [
           {
             "label": "label_name",
             "language": "fr",
             "syncValue": "sync_translation_value",
             "branchValue": "branch_translation_value"
           }
         ]
       }
     ]
     ```
   - `204`: No Content  
     If no conflicts are found between the branches.
   - `400`: Bad Request  
     Occurs if the `repo` or `branch` query parameters are missing.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if there is an issue retrieving the content or any other unexpected error.

#### 6. **GET /api/github/content**  
   Retrieves the content of a specified file from a GitHub repository.

   ##### **Description:**  
   This endpoint fetches the content of a file located in a specific branch of a GitHub repository. The content is returned in a parsed format.

   ##### **Query Parameters:**
   - `repo`: (string) GitHub repository name, required.
   - `path`: (string) File path in the repository, required.
   - `branch`: (string) Branch name, required.

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns the parsed content of the specified file.  
     ```json
     {
       "parsed_content": "content details"
     }
     ```
   - `400`: Bad Request  
     Occurs if any required query parameters are missing.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if there is an issue retrieving the file content or any other unexpected error.

#### 7. **PUT /api/github/update**  
   Updates the translations in a specified file within a GitHub repository.

   ##### **Description:**  
   This endpoint updates the translations for labels in a specified file located in a specific branch of a GitHub repository.

   ##### **Request Body:**
   ```json
   {
     "repo": "repository_name",
     "translations": {
       "label_name": {
         "language": "term"
       }
     },
     "branch": "branch_name",
     "filename": "path/to/file"
   }
   ```

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns the updated file details.  
     ```json
     {
       "content": {...},
       "commit": {...}
     }
     ```
   - `400`: Bad Request  
     Occurs if any required fields are missing from the request body.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if there is an issue updating the file or any other unexpected error.

#### 8. **GET /api/github/changed**  
   Retrieves the changed files and comments from a pull request or compares a branch with the main branch if no pull request exists.

   ##### **Description:**  
   This endpoint checks for changes in a specified branch compared to the main branch. If there are changes and no pull request exists, it creates one and retrieves the changed files and their diffs.

   ##### **Query Parameters:**
   - `repo`: (string) The name of the repository.
   - `branch`: (string) The name of the branch to compare.

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns the diffs and comments for the changed files.
     ```json
     {
       "diffsData": [
         {
           "filename": "path/to/file",
           "before": "content before changes",
           "after": "content after changes",
           "filesha": "sha of the file",
           "diff": "diff data"
         }
       ],
       "commentsData": [
         {
           "path": "path/to/file",
           "line": "line_number",
           "body": "comment body",
           "created_at": "timestamp"
         }
       ],
       "pullNumber": "pull_request_number"
     }
     ```
   - `400`: Bad Request  
     Occurs if the `repo` or `branch` query parameters are missing.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if there is an issue retrieving changed files or any other unexpected error.

#### 9. **PUT /api/github/merge**  
   Merges a pull request for a specified branch into the main branch and deletes the branch if the merge is successful.

   ##### **Description:**  
   This endpoint checks if a pull request exists for the specified branch and attempts to merge it into the main branch. If the merge is successful, the branch is deleted.

   ##### **Request Body:**
   ```json
   {
     "repo": "repository_name",
     "branch": "branch_name"
   }
   ```

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns a success message if the merge was successful and the branch was deleted.
     ```json
     {
       "message": "Merge successful and branch deleted"
     }
     ```
   - `400`: Bad Request  
     Occurs if the `repo` or `branch` fields are missing or if the pull request is not mergeable.
   - `404`: Not Found  
     Occurs if no pull requests are found for the specified branch.
   - `500`: Internal Server Error  
     Occurs if there is an issue during the merge process or any other unexpected error.

#### 10. **POST /api/github/comment**  
   Adds a comment to a specified line in a pull request.

   ##### **Description:**  
   This endpoint allows users to post a comment on a specific line in a pull request. It requires the pull request number and the specific line details where the comment should be added. **Note: This feature is currently in development and is not yet in use.**

   ##### **Request Body:**
   ```json
   {
     "token": "your_github_token",
     "pull_number": 123,
     "repo": "repository_name",
     "comment": "Your comment here",
     "path": "file_path",
     "sha": "commit_sha",
     "line": 10,
     "side": "RIGHT" // or "LEFT"
   }
   ```

   ##### **Responses:**
   - `200`: OK  
     Returns the details of the created comment.
     ```json
     {
       // Comment details
     }
     ```
   - `500`: Internal Server Error  
     Occurs if there is an issue with the request or any unexpected error.

#### 11. **GET /api/github/pr/:prNumber/file/:filePath/approved**  
   Checks if a specific file in a pull request has been approved by any of the designated reviewers.

   ##### **Description:**  
   This endpoint reads the `reviewers.txt` file from the main branch, parses it as JSON, and checks if any of the designated reviewers have posted an "approved" comment on the specified file in the given pull request.

   ##### **Path Parameters:**
   - `prNumber`: (number) Pull request number, required.
   - `filePath`: (string) File path in the repository (URL encoded if contains special characters), required.

   ##### **Query Parameters:**
   - `repo`: (string) GitHub repository name, required.

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns approval status and metadata.
     ```json
     // If approved:
     {
       "approved": true,
       "reviewer": "reviewer_username",
       "timestamp": "2023-08-14T12:00:00Z",
       "comment_id": 123456,
       "comment_url": "https://github.com/owner/repo/pull/123#discussion_r123456"
     }
     
     // If not approved:
     {
       "approved": false,
       "eligible_reviewers": ["reviewer1", "reviewer2"],
       "checked_file": "path/to/file.txt"
     }
     ```
   - `400`: Bad Request  
     Occurs if required parameters are missing or invalid.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `404`: Not Found  
     Occurs if the `reviewers.txt` file is not found in the main branch.
   - `500`: Internal Server Error  
     Occurs if there are issues reading/parsing `reviewers.txt` or unexpected errors.

#### 12. **POST /api/github/pr/:prNumber/file/:filePath/approve**  
   Adds an "approved" comment to a specific file in a pull request.

   ##### **Description:**  
   This endpoint posts a comment with the text "approved" on the specified file in the given pull request. The comment is associated with a specific commit SHA.

   ##### **Path Parameters:**
   - `prNumber`: (number) Pull request number, required.
   - `filePath`: (string) File path in the repository (URL encoded if contains special characters), required.

   ##### **Request Body:**
   ```json
   {
     "repo": "repository_name",
     "sha": "commit_sha"
   }
   ```

   ##### **Headers:**
   - `Authorization`: (string) GitHub OAuth token, required.

   ##### **Responses:**
   - `200`: OK  
     Returns confirmation of the created approval comment.
     ```json
     {
       "success": true,
       "comment_id": 123456,
       "comment_url": "https://github.com/owner/repo/pull/123#discussion_r123456",
       "timestamp": "2023-08-14T12:00:00Z",
       "file_path": "path/to/file.txt",
       "commenter": "authenticated_user"
     }
     ```
   - `400`: Bad Request  
     Occurs if required parameters are missing or invalid.
   - `401`: Unauthorized  
     Occurs if the `Authorization` header is missing.
   - `500`: Internal Server Error  
     Occurs if there are issues with the GitHub API or unexpected errors.

### Running Locally

To run the backend locally:

```bash
node serveur.js
```

The server runs on `http://[Your-back-end-url]:5002`, and the API can be accessed via the `/api/github` path. Additionally, you can view the API documentation at the Swagger page available at `/api-docs`.
