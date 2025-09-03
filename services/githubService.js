import { Octokit } from "octokit";
import { diffLines } from "diff";
import { parse, stringify } from "yaml";
import {
  ERROR_MESSAGES,
  STATUS_CODES,
  GITHUB_API_VERSION,
} from "../utils/constants.js";

/**
 * GitHub API service for handling all GitHub-related operations
 */
export class GitHubService {
  constructor(token) {
    this.octokit = new Octokit({ auth: token });
    this.owner = process.env.GITHUB_OWNER;
  }

  /**
   * Get branches for a repository filtered by key prefix
   */
  async getBranches(repo) {
    const keyBranchPrefix = process.env.GITHUB_KEY_BRANCH;
    if (!keyBranchPrefix) {
      throw new Error(
        "GitHub key branch prefix is not set in environment variables."
      );
    }

    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/branches",
      {
        owner: this.owner,
        repo,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    const filteredBranches = response.data.filter((branch) =>
      branch.name.startsWith(keyBranchPrefix)
    );

    const branchesWithCommitDates = await Promise.all(
      filteredBranches.map(async (branch) => {
        const commitResponse = await this.octokit.request(
          "GET /repos/{owner}/{repo}/commits/{ref}",
          {
            owner: this.owner,
            repo,
            ref: branch.commit.sha,
            headers: {
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
          }
        );

        return {
          name: branch.name,
          lastCommit: commitResponse.data.commit.committer.date,
        };
      })
    );

    return branchesWithCommitDates;
  }

  /**
   * Get repository tree/files
   */
  async getRepositoryTree(repo, branch) {
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
      {
        owner: this.owner,
        repo,
        tree_sha: branch,
        recursive: true,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    const yamlFiles = response.data.tree.filter(
      (file) => file.path.endsWith(".yml") || file.path.endsWith(".yaml")
    );

    return yamlFiles.map((file) => ({
      path: file.path,
      url: file.url,
    }));
  }

  /**
   * Get file content
   */
  async getFileContent(repo, path, branch) {
    try {
      console.log(`Getting file content: ${path} from branch: ${branch}`);
      
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner,
          repo,
          path: path,
          ref: branch,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );

      const content = Buffer.from(response.data.content, "base64").toString(
        "utf-8"
      );
      
      console.log(`File content retrieved successfully: ${path}`);
      return parse(content);
      
    } catch (error) {
      console.error(`Failed to get file content for ${path}:`, error.message);
      
      if (error.response && error.response.status === 404) {
        throw new Error(`File ${path} not found in repository ${repo} on branch ${branch}`);
      } else if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || 'Unknown GitHub API error';
        throw new Error(`GitHub API error getting file content (status ${status}): ${message}`);
      } else {
        throw new Error(`Failed to get file content for ${path}: ${error.message}`);
      }
    }
  }

  /**
   * Update file content
   */
  async updateFile(repo, path, content, message, branch, sha) {
    try {
      // Validate required parameters
      if (!repo || !path || !content || !message || !sha) {
        throw new Error('All parameters (repo, path, content, message, sha) are required for file updates');
      }
      
      console.log(`Updating file: ${path} in repository: ${repo}`);
      
      const response = await this.octokit.request(
        "PUT /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner,
          repo,
          path,
          message,
          content: Buffer.from(content).toString("base64"),
          sha,
          branch,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );
      
      console.log(`File updated successfully: ${path}`);
      return response;
      
    } catch (error) {
      console.error(`Failed to update file ${path}:`, error.message);
      
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || 'Unknown GitHub API error';
        
        if (status === 409) {
          throw new Error(`Conflict updating file ${path}: The file has been modified by another process. SHA mismatch.`);
        } else if (status === 404) {
          throw new Error(`File ${path} not found in repository ${repo}`);
        } else {
          throw new Error(`GitHub API error updating file ${path} (status ${status}): ${message}`);
        }
      } else {
        throw new Error(`Failed to update file ${path}: ${error.message}`);
      }
    }
  }

  /**
   * Get diff between branch and main
   */
  async getDiff(repo, branch) {
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/compare/{basehead}",
      {
        owner: this.owner,
        repo,
        basehead: `main...${branch}`,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    return response.data.files;
  }

  /**
   * Get user information
   */
  async getUser() {
    const response = await this.octokit.request("GET /user");
    return response.data;
  }

  /**
   * Get reviewers from reviewers.json file
   */
  async getReviewers(repo) {
    try {
      const reviewersResponse = await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner,
          repo,
          path: "reviewers.json",
          ref: "main",
        }
      );

      const reviewersContent = Buffer.from(
        reviewersResponse.data.content,
        "base64"
      ).toString("utf-8");

      const reviewers = JSON.parse(reviewersContent);

      if (!Array.isArray(reviewers)) {
        throw new Error("Reviewers file must contain an array of objects");
      }

      // Extract reviewer usernames (first key in each dict object)
      const reviewerUsernames = reviewers
        .map((reviewerObj) => {
          const keys = Object.keys(reviewerObj);
          return keys.length > 0 ? keys[0] : null;
        })
        .filter((username) => username !== null);

      if (reviewerUsernames.length === 0) {
        throw new Error("No valid reviewers found in reviewers.json");
      }

      return reviewerUsernames;
    } catch (error) {
      if (error.status === 404) {
        throw new Error("reviewers.json file not found in the main branch");
      }
      throw error;
    }
  }

  /**
   * Create PR comment
   */
  async createPRComment(repo, pullNumber, comment, sha, path, line, side) {
    const response = await this.octokit.request(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      {
        owner: this.owner,
        repo,
        pull_number: pullNumber,
        body: comment,
        commit_id: sha,
        path,
        line,
        side,
      }
    );
    return response.data;
  }

  /**
   * Get PR comments
   */
  async getPRComments(repo, pullNumber) {
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      {
        owner: this.owner,
        repo,
        pull_number: pullNumber,
      }
    );
    return response.data;
  }

  /**
   * Get detailed diff with file contents - matching server-original.js structure
   */
  async getDetailedDiff(repo, branch) {
    // Check if there are existing pull requests for this branch
    const pullsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: this.owner,
        repo,
        head: `${this.owner}:${branch}`,
        base: "main",
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    let files;
    if (!pullsResponse.data.length) {
      // Get the diff between main and the specified branch
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/compare/{basehead}",
        {
          owner: this.owner,
          repo,
          basehead: `main...${branch}`,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );
      files = response.data.files;
    } else {
      // Get the diff from the existing pull request
      const prNumber = pullsResponse.data[0].number;
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
        {
          owner: this.owner,
          repo,
          pull_number: prNumber,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );
      files = response.data;
    }

    // Retrieve the content of each changed file
    const filesContent = await Promise.all(
      files.map(async (file) => {
        try {
          const contentResponse = await this.octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner: this.owner,
              repo,
              path: file.filename,
              ref: branch,
            }
          );
          const content = parse(
            Buffer.from(contentResponse.data.content, "base64").toString(
              "utf-8"
            )
          );
          return { filename: file.filename, content: content };
        } catch (error) {
          console.error(
            `Error retrieving content for file ${file.filename}:`,
            error
          );
          throw new Error(
            `Failed to retrieve content for file: ${file.filename}`
          );
        }
      })
    );

    return filesContent;
  }

  /**
   * Check for conflicts between branch and main - matching server-original.js structure
   */
  async getConflicts(repo, branch) {
    // Compare main with the specified branch
    let files;
    const pullsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: this.owner,
        repo,
        head: `${this.owner}:${branch}`,
        base: "main",
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    if (!pullsResponse.data.length) {
      // Get the diff between main and the specified branch
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/compare/{basehead}",
        {
          owner: this.owner,
          repo,
          basehead: `main...${branch}`,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );
      files = response.data.files;
    } else {
      // Retrieve changed files in the pull request
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
        {
          owner: this.owner,
          repo,
          pull_number: pullsResponse.data[0].number,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );
      files = response.data;
    }

    // Compare the specified branch with main
    const compareResponseSync = await this.octokit.request(
      "GET /repos/{owner}/{repo}/compare/{basehead}",
      {
        owner: this.owner,
        repo,
        basehead: `${branch}...main`,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    // Get filenames of modified files
    const mainBranchFiles = files.map((file) => file.filename);
    const syncBranchFiles = compareResponseSync.data.files.map(
      (file) => file.filename
    );

    // Find common files between the two comparisons
    const commonFiles = mainBranchFiles.filter((filename) =>
      syncBranchFiles.includes(filename)
    );

    // If no common files, return no conflict
    if (commonFiles.length === 0) {
      return [];
    }

    // Fetch and compare the content of the common files
    const conflictslist = await Promise.all(
      commonFiles.map(async (filename) => {
        try {
          // Get content of the file in the main branch
          const contentResponseSync = await this.octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner: this.owner,
              repo,
              path: filename,
              ref: "main",
            }
          );
          const contentSync = Buffer.from(
            contentResponseSync.data.content,
            "base64"
          ).toString("utf-8");

          // Get content of the file in the specified branch
          const contentResponseBranch = await this.octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner: this.owner,
              repo,
              path: filename,
              ref: branch,
            }
          );
          const contentBranch = Buffer.from(
            contentResponseBranch.data.content,
            "base64"
          ).toString("utf-8");

          // Parse contents
          const parsedSync = parse(contentSync);
          const parsedBranch = parse(contentBranch);

          // Identify conflicts
          const conflicts = [];
          const labelsSync = parsedSync.labels;
          const labelsBranch = parsedBranch.labels;
          labelsSync.forEach((syncLabel) => {
            const branchLabel = labelsBranch.find(
              (label) => label.name === syncLabel.name
            );
            if (branchLabel) {
              syncLabel.translations.forEach((syncTranslation) => {
                const branchTranslation = branchLabel.translations.find((t) =>
                  Object.keys(t).some(
                    (lang) =>
                      syncTranslation[lang] !== undefined &&
                      t[lang] !== undefined
                  )
                );
                if (branchTranslation) {
                  Object.entries(syncTranslation).forEach(
                    ([lang, syncValue]) => {
                      if (
                        syncValue !== branchTranslation[lang] &&
                        syncValue !== ""
                      ) {
                        conflicts.push({
                          label: syncLabel.name,
                          language: lang,
                          syncValue,
                          branchValue: branchTranslation[lang],
                        });
                      }
                    }
                  );
                }
              });
            }
          });
          return { filename, conflicts };
        } catch (err) {
          console.error(`Error retrieving content for file ${filename}:`, err);
          return {
            filename,
            conflicts: [
              { error: `Failed to retrieve content for file: ${filename}` },
            ],
          };
        }
      })
    );

    var boolConflict = false;
    conflictslist.forEach((conflict) => {
      if (conflict.conflicts.length > 0) {
        boolConflict = true;
      }
    });

    // Return the conflicts
    if (boolConflict) {
      return conflictslist;
    } else {
      return [];
    }
  }

  /**
   * Update file with translations - matching server-original.js structure
   */
  async updateFileWithTranslations(repo, translations, branch, filename) {
    try {
      const value = translations;
      const path = filename;

      console.log(`Updating translations in file: ${path}`);

      // Fetch the file content from GitHub (this will give us both content and SHA)
      const response = await this.octokit.request(
        "GET /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner,
          repo,
          path,
          ref: branch,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );

      const content = parse(
        Buffer.from(response.data.content, "base64").toString("utf-8")
      );

      // Update the content with the provided translations
      content.labels.forEach((label) => {
        const translationKey = label.name;
        if (value.hasOwnProperty(translationKey)) {
          Object.entries(value[translationKey]).forEach(([language, term]) => {
            const translationObj = label.translations.find((t) =>
              t.hasOwnProperty(language)
            );
            if (translationObj) {
              translationObj[language] = term;
            } else {
              console.warn(
                `Language ${language} not found for label ${translationKey}`
              );
            }
          });
        }
      });

      const updatedContent = stringify(content, {
        quotingType: '"',
        prettyErrors: true,
        lineWidth: 0,
        defaultStringType: "QUOTE_DOUBLE",
        defaultKeyType: "PLAIN",
      });

      // Use the SHA from the first request (no need to fetch again)
      const sha = response.data.sha;

      // Commit the updated file to the repository
      const response2 = await this.octokit.request(
        "PUT /repos/{owner}/{repo}/contents/{path}",
        {
          owner: this.owner,
          repo,
          path,
          branch,
          message: `Update translations for ${path}`,
          content: Buffer.from(updatedContent).toString("base64"),
          sha,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );

      console.log(`Translations updated successfully in: ${path}`);
      return response2;
      
    } catch (error) {
      console.error(`Failed to update translations in ${filename}:`, error.message);
      
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || 'Unknown GitHub API error';
        
        if (status === 404) {
          throw new Error(`File ${filename} not found in repository ${repo} on branch ${branch}`);
        } else if (status === 409) {
          throw new Error(`Conflict updating ${filename}: The file has been modified by another process`);
        } else {
          throw new Error(`GitHub API error updating translations (status ${status}): ${message}`);
        }
      } else {
        throw new Error(`Failed to update translations in ${filename}: ${error.message}`);
      }
    }
  }

  /**
   * Get commits for a repository
   */
  async getCommits(repo, branch, since) {
    const params = {
      owner: this.owner,
      repo,
      sha: branch,
    };

    if (since) {
      params.since = since;
    }

    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/commits",
      params
    );

    return response.data;
  }

  /**
   * Get pull request comments by PR number - matching server-original.js structure
   */
  async getPRComments(repo, pullNumber) {
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      {
        owner: this.owner,
        repo,
        pull_number: pullNumber,
      }
    );

    return response.data;
  }

  /**
   * Get pull request comments
   */
  async getPullRequestComments(repo, branch) {
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/comments",
      {
        owner: this.owner,
        repo,
        head: `${this.owner}:${branch}`,
      }
    );

    return response.data;
  }

  /**
   * Get changed files and their status - matching server-original.js structure
   */
  async getChangedFiles(repo, branch) {
    let pullNumber;

    // Retrieve pull requests related to the branch
    const pullsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: this.owner,
        repo,
        head: `${this.owner}:${branch}`,
        base: "main",
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    // If there's no existing PR, compare the branch with main
    if (!pullsResponse.data.length) {
      const compareResponse = await this.octokit.request(
        "GET /repos/{owner}/{repo}/compare/{base}...{head}",
        {
          owner: this.owner,
          repo,
          base: "main",
          head: branch,
        }
      );

      // If the branch has no commits ahead of main, return success
      if (compareResponse.data.ahead_by === 0) {
        return {
          compare: true,
          message: "The branch has no changes to compare with main.",
        };
      }

      // Create a new pull request if the branch has changes to compare
      const createPullResponse = await this.octokit.request(
        "POST /repos/{owner}/{repo}/pulls",
        {
          owner: this.owner,
          repo,
          title: "New changes from " + branch,
          body: "Please review and merge these changes from " + branch,
          head: branch,
          base: "main",
          draft: true,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );

      pullNumber = createPullResponse.data.number;
    } else {
      // Use the existing pull request
      pullNumber = pullsResponse.data[0].number;
    }

    // Retrieve changed files in the pull request
    const { data: files } = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/files",
      {
        owner: this.owner,
        repo,
        pull_number: pullNumber,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    // Retrieve diffs and file contents for each file
    const diffsData = await Promise.all(
      files.map(async (file) => {
        try {
          // Get the content of the file before the changes (from main)
          const beforeResponse = await this.octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner: this.owner,
              repo,
              path: file.filename,
              ref: "main", // Refers to the main branch
            }
          );
          const beforeContent = Buffer.from(
            beforeResponse.data.content,
            "base64"
          ).toString("utf-8");

          // Get the content of the file after the changes (from the branch)
          const afterResponse = await this.octokit.request(
            "GET /repos/{owner}/{repo}/contents/{path}",
            {
              owner: this.owner,
              repo,
              path: file.filename,
              ref: branch, // Refers to the branch being compared
            }
          );
          const afterContent = Buffer.from(
            afterResponse.data.content,
            "base64"
          ).toString("utf-8");

          // Calculate the diff between the two versions of the file
          const diff = diffLines(beforeContent, afterContent);

          return {
            filename: file.filename,
            before: beforeContent,
            after: afterContent,
            filesha: file.sha,
            diff,
          };
        } catch (fileError) {
          console.error(
            `Error retrieving content for file ${file.filename}:`,
            fileError
          );
          throw new Error(
            `Failed to retrieve content for file: ${file.filename}`
          );
        }
      })
    );

    // Retrieve comments on the pull request
    const commentsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      {
        owner: this.owner,
        repo,
        pull_number: pullNumber,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    const commentsData = commentsResponse.data.map((comment) => ({
      path: comment.path,
      line: comment.position,
      body: comment.body,
      created_at: comment.created_at,
    }));

    return { diffsData, commentsData, pullNumber };
  }

  /**
   * Check if a file in a PR has been approved
   */
  async checkFileApproval(repo, prNumber, filePath, branch) {
    // Decode the file path in case it was URL encoded
    const decodedFilePath = decodeURIComponent(filePath);

    // Fetch the file content
    const fileContentResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: this.owner,
        repo,
        path: decodedFilePath,
        ref: branch,
      }
    );

    const fileContent = Buffer.from(
      fileContentResponse.data.content,
      "base64"
    ).toString("utf-8");

    // Parse lines with "- name" to find labels
    const lines = fileContent.split("\n");
    const linesWithName = lines
      .map((line, index) => ({ line, index: index + 1 }))
      .filter(({ line }) => line.includes("- name"));

    // Fetch PR comments
    const commentsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      {
        owner: this.owner,
        repo,
        pull_number: prNumber,
      }
    );

    const comments = commentsResponse.data;

    // Check approvals
    const unapprovedLabels = [];
    const approvedLabels = [];

    // Get reviewers list
    const reviewers = await this.getReviewers(repo);

    linesWithName.forEach(({ line, index }) => {
      const label = line.trim();
      const labelToCompare = ("approved-" + label)
        .replace(/- name\s*"?([^"]*)"?/, "$1")
        .replace(": ", "")
        .replace('"', "")
        .trim()
        .toLowerCase();

      // Check if any reviewer has approved this label
      const isApproved = comments.some((comment) => {
        const commentBody = comment.body.trim().toLowerCase();
        const isReviewer = reviewers.includes(comment.user.login);
        return (
          comment.path === decodedFilePath &&
          isReviewer &&
          commentBody.includes(labelToCompare)
        );
      });

      if (isApproved) {
        const approvalComment = comments.find((comment) => {
          const commentBody = comment.body.trim().toLowerCase();
          const isReviewer = reviewers.includes(comment.user.login);
          return (
            comment.path === decodedFilePath &&
            isReviewer &&
            commentBody.includes(labelToCompare)
          );
        });

        approvedLabels.push({
          label: label
            .replace(/- name\s*"?([^"]*)"?/, "$1")
            .replace(": ", "")
            .replace('"', "")
            .trim(),
          lineNumber: index,
          reviewer: approvalComment.user.login,
          timestamp: approvalComment.created_at,
          comment_id: approvalComment.id,
          comment_url: approvalComment.html_url,
        });
      } else {
        unapprovedLabels.push({
          label: label
            .replace(/- name\s*"?([^"]*)"?/, "$1")
            .replace('"', "")
            .replace(": ", "")
            .trim(),
          lineNumber: index,
        });
      }
    });

    return {
      approved: unapprovedLabels.length === 0 && approvedLabels.length > 0,
      approvedLabels,
      unapprovedLabels,
      eligible_reviewers: reviewers,
      checked_file: decodedFilePath,
    };
  }

  /**
   * Approve a file in a PR by adding a comment
   */
  async approveFile(repo, prNumber, filePath, sha, lang, labelName) {
    // Create approval comment
    const commentBody = `approved-${labelName}: ${lang}`;

    const response = await this.octokit.request(
      "POST /repos/{owner}/{repo}/pulls/{pull_number}/comments",
      {
        owner: this.owner,
        repo,
        pull_number: prNumber,
        body: commentBody,
        commit_id: sha,
        path: decodeURIComponent(filePath),
        line: 1,
        side: "RIGHT",
      }
    );

    return response.data;
  }

  /**
   * Merge branch to main - matching server-original.js structure
   */
  async mergeBranch(repo, branch) {
    console.log("merge");

    // Fetch all pull requests for the given repo and branch
    const pullsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls",
      {
        owner: this.owner,
        repo,
        head: `${this.owner}:${branch}`,
        base: "main",
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    // Check if there are no pull requests for this branch
    if (pullsResponse.data.length === 0) {
      const error = new Error(`No pull requests found for branch: ${branch}`);
      error.status = 404;
      throw error;
    }

    // Get details of the first pull request for the branch
    const pullRequest = pullsResponse.data[0];
    const pullDetailsResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/pulls/{pull_number}",
      {
        owner: this.owner,
        repo,
        pull_number: pullRequest.number,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    // Check if the pull request is mergeable
    if (pullDetailsResponse.data.mergeable) {
      // If the pull request is in draft, mark it ready for review
      if (pullDetailsResponse.data.draft) {
        const markReadyQuery = `
          mutation($pullRequestId: ID!) {
            markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
              pullRequest {
                id
                number
                state
              }
            }
          }
        `;
        const pullRequestId = pullDetailsResponse.data.node_id;
        await this.octokit.graphql(markReadyQuery, { pullRequestId });
      }

      // Merge the pull request
      const mergeResponse = await this.octokit.request(
        "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
        {
          owner: this.owner,
          repo,
          pull_number: pullDetailsResponse.data.number,
          commit_title: `Merge pull request #${pullDetailsResponse.data.number}`,
          commit_message: "Merging pull request",
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );

      // If the merge is successful, delete the branch
      if (mergeResponse.data.merged) {
        await this.octokit.request(
          "DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}",
          {
            owner: this.owner,
            repo,
            branch,
            headers: {
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
          }
        );

        return { message: "Merge successful and branch deleted" };
      } else {
        const error = new Error("The merge operation could not be completed.");
        error.status = 400;
        error.type = "Merge Failed";
        throw error;
      }
    } else {
      const error = new Error(
        "The pull request is not mergeable. Please check for conflicts."
      );
      error.status = 400;
      error.type = "Not Mergeable";
      throw error;
    }
  }

  // Organization Management Methods

  /**
   * Get all members of the organization
   */
  async getOrganizationMembers(org) {
    const response = await this.octokit.request(
      "GET /orgs/{org}/members",
      {
        org,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Invite a user to the organization
   */
  async inviteUserToOrganization(org, username) {
    const response = await this.octokit.request(
      "PUT /orgs/{org}/memberships/{username}",
      {
        org,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Remove a user from the organization
   */
  async removeUserFromOrganization(org, username) {
    const response = await this.octokit.request(
      "DELETE /orgs/{org}/memberships/{username}",
      {
        org,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.status === 204;
  }

  // Team Management Methods

  /**
   * Get all teams in the organization
   */
  async getOrganizationTeams(org) {
    const response = await this.octokit.request(
      "GET /orgs/{org}/teams",
      {
        org,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Get all members of a specific team
   */
  async getTeamMembers(org, teamSlug) {
    const response = await this.octokit.request(
      "GET /orgs/{org}/teams/{team_slug}/members",
      {
        org,
        team_slug: teamSlug,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Add a user to a team
   */
  async addUserToTeam(org, teamSlug, username) {
    const response = await this.octokit.request(
      "PUT /orgs/{org}/teams/{team_slug}/memberships/{username}",
      {
        org,
        team_slug: teamSlug,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Remove a user from a team
   */
  async removeUserFromTeam(org, teamSlug, username) {
    const response = await this.octokit.request(
      "DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}",
      {
        org,
        team_slug: teamSlug,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.status === 204;
  }

  /**
   * Move a user from one team to another
   */
  async moveUserBetweenTeams(org, fromTeamSlug, toTeamSlug, username) {
    // First, add user to the destination team
    await this.addUserToTeam(org, toTeamSlug, username);
    
    // Then, remove user from the source team
    await this.removeUserFromTeam(org, fromTeamSlug, username);
    
    return { message: `User ${username} moved from ${fromTeamSlug} to ${toTeamSlug}` };
  }

  /**
   * Create a new repository in the organization
   */
  async createRepository(name, description, isPrivate = false) {
    try {
      // Validate inputs
      if (!name || typeof name !== 'string') {
        throw new Error('Repository name is required and must be a string');
      }
      
      if (!this.owner) {
        throw new Error('GitHub owner/organization is not configured');
      }
      
      console.log(`Creating repository: ${name} in organization: ${this.owner}`);
      
      const response = await this.octokit.request(
        "POST /orgs/{org}/repos",
        {
          org: this.owner,
          name,
          description: description || `Repository for ${name}`,
          private: isPrivate,
          auto_init: true,
          headers: {
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
        }
      );
      
      console.log(`Repository created successfully: ${response.data.html_url}`);
      return response.data;
      
    } catch (error) {
      console.error(`Failed to create repository ${name}:`, error.message);
      
      if (error.response) {
        const status = error.response.status;
        const message = error.response.data?.message || 'Unknown GitHub API error';
        
        if (status === 422) {
          throw new Error(`Repository ${name} already exists in organization ${this.owner}`);
        } else if (status === 403) {
          throw new Error(`Insufficient permissions to create repository in organization ${this.owner}`);
        } else if (status === 404) {
          throw new Error(`Organization ${this.owner} not found or not accessible`);
        } else {
          throw new Error(`GitHub API error creating repository (status ${status}): ${message}`);
        }
      } else {
        throw new Error(`Failed to create repository ${name}: ${error.message}`);
      }
    }
  }

  /**
   * Create multiple files in a repository at once
   */
  async createMultipleFiles(repo, files) {
    const results = [];
    
    for (const file of files) {
      try {
        console.log(`Creating file: ${file.path}`);
        
        // Validate file content
        if (!file.content) {
          throw new Error(`File content is empty for ${file.path}`);
        }
        
        const response = await this.octokit.request(
          "PUT /repos/{owner}/{repo}/contents/{path}",
          {
            owner: this.owner,
            repo,
            path: file.path,
            message: file.message || `Add ${file.path}`,
            content: Buffer.from(file.content).toString("base64"),
            headers: {
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
          }
        );
        
        console.log(`File created successfully: ${file.path}`);
        results.push(response.data);
        
      } catch (error) {
        console.error(`Failed to create file ${file.path}:`, error.message);
        
        // Handle specific GitHub API errors
        if (error.response) {
          const status = error.response.status;
          const message = error.response.data?.message || 'Unknown GitHub API error';
          
          if (status === 422) {
            // File already exists - this might happen if the repository was created with auto_init
            console.warn(`File ${file.path} already exists, attempting to update it`);
            
            try {
              // Get current file to get its SHA
              const currentFile = await this.octokit.request(
                "GET /repos/{owner}/{repo}/contents/{path}",
                {
                  owner: this.owner,
                  repo,
                  path: file.path,
                  headers: {
                    "X-GitHub-Api-Version": GITHUB_API_VERSION,
                  },
                }
              );
              
              // Update the file with SHA
              const updateResponse = await this.octokit.request(
                "PUT /repos/{owner}/{repo}/contents/{path}",
                {
                  owner: this.owner,
                  repo,
                  path: file.path,
                  message: file.message || `Update ${file.path}`,
                  content: Buffer.from(file.content).toString("base64"),
                  sha: currentFile.data.sha,
                  headers: {
                    "X-GitHub-Api-Version": GITHUB_API_VERSION,
                  },
                }
              );
              
              console.log(`File updated successfully: ${file.path}`);
              results.push(updateResponse.data);
              continue;
              
            } catch (updateError) {
              console.error(`Failed to update existing file ${file.path}:`, updateError.message);
              throw new Error(`Failed to create or update file ${file.path}: ${updateError.message}`);
            }
          } else {
            throw new Error(`GitHub API error creating file ${file.path} (status ${status}): ${message}`);
          }
        } else {
          throw new Error(`Failed to create file ${file.path}: ${error.message}`);
        }
      }
    }
    
    return results;
  }

  /**
   * Create a new repository with initial configuration and workflow files
   */
  async createRepositoryWithInitialFiles(vocabularyName, languageTag) {
    const repoName = `${vocabularyName}-${languageTag.toUpperCase()}`;
    const description = `Translation repository for ${vocabularyName} vocabulary in ${languageTag}`;
    
    try {
      // Create the repository
      console.log(`Creating repository: ${repoName}`);
      const repo = await this.createRepository(repoName, description, false);
      console.log(`Repository created successfully: ${repo.html_url}`);
      
      // Read template files from the filesystem with proper error handling
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const templatesDir = path.join(__dirname, '..', 'templates');
      
      // Validate template directory and files exist
      try {
        await fs.access(templatesDir);
      } catch (error) {
        console.error(`Templates directory not found: ${templatesDir}`);
        throw new Error(`Templates directory not found: ${templatesDir}. Cannot create repository files.`);
      }
      
      // Read template content with individual error handling
      let configTemplate, reviewersTemplate, ldesFragmentTemplate, ldesSyncTemplate;
      
      try {
        console.log('Reading template files...');
        configTemplate = await fs.readFile(path.join(templatesDir, 'config.yml'), 'utf-8');
        reviewersTemplate = await fs.readFile(path.join(templatesDir, 'reviewers.json'), 'utf-8');
        ldesFragmentTemplate = await fs.readFile(path.join(templatesDir, 'ldes_fragment_maker.yml'), 'utf-8');
        ldesSyncTemplate = await fs.readFile(path.join(templatesDir, 'ldes_sync_harvest.yml'), 'utf-8');
        console.log('Template files read successfully');
      } catch (error) {
        console.error(`Failed to read template files: ${error.message}`);
        throw new Error(`Failed to read template files: ${error.message}. Ensure all required template files exist.`);
      }
      
      // Replace template variables in config.yml
      const configContent = configTemplate
        .replace(/\{\{vocabularyName\}\}/g, vocabularyName)
        .replace(/\{\{languageTag\}\}/g, languageTag)
        .replace(/\{\{languageTag\.toUpperCase\(\)\}\}/g, languageTag.toUpperCase());
      
      // Prepare files to create
      const filesToCreate = [
        {
          path: 'config.yml',
          content: configContent,
          message: 'Add initial config.yml'
        },
        {
          path: 'reviewers.json',
          content: reviewersTemplate,
          message: 'Add empty reviewers.json'
        },
        {
          path: '.github/workflows/ldes_fragment_maker.yml',
          content: ldesFragmentTemplate,
          message: 'Add LDES fragment maker workflow'
        },
        {
          path: '.github/workflows/ldes_sync_harvest.yml',
          content: ldesSyncTemplate,
          message: 'Add LDES sync harvest workflow'
        }
      ];
      
      // Create all files with enhanced error handling
      console.log(`Creating ${filesToCreate.length} initial files...`);
      const fileResults = await this.createMultipleFiles(repoName, filesToCreate);
      console.log('All files created successfully');
      
      return {
        repository: repo,
        files: fileResults
      };
    } catch (error) {
      console.error(`Error in createRepositoryWithInitialFiles: ${error.message}`);
      
      // If repository was created but file creation failed, log warning
      if (error.message.includes('template') || error.message.includes('file')) {
        console.warn(`Repository ${repoName} was created but initial files may not have been added properly`);
      }
      
      // Re-throw with enhanced context
      throw error;
    }
  }
}

/**
 * GitHub Organization API service for handling organization and team operations
 * Uses organization admin token for privileged operations
 */
export class GitHubOrgService {
  constructor(orgToken) {
    this.octokit = new Octokit({ auth: orgToken });
    this.org = process.env.GITHUB_ORG;
  }

  /**
   * Get all members of the organization
   */
  async getOrganizationMembers() {
    const response = await this.octokit.request(
      "GET /orgs/{org}/members",
      {
        org: this.org,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Invite a user to the organization
   */
  async inviteUserToOrganization(username) {
    const response = await this.octokit.request(
      "PUT /orgs/{org}/memberships/{username}",
      {
        org: this.org,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Remove a user from the organization
   */
  async removeUserFromOrganization(username) {
    const response = await this.octokit.request(
      "DELETE /orgs/{org}/memberships/{username}",
      {
        org: this.org,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.status === 204;
  }

  /**
   * Get all teams in the organization
   */
  async getOrganizationTeams() {
    const response = await this.octokit.request(
      "GET /orgs/{org}/teams",
      {
        org: this.org,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Get all members of a specific team
   */
  async getTeamMembers(teamSlug) {
    const response = await this.octokit.request(
      "GET /orgs/{org}/teams/{team_slug}/members",
      {
        org: this.org,
        team_slug: teamSlug,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Add a user to a team
   */
  async addUserToTeam(teamSlug, username) {
    const response = await this.octokit.request(
      "PUT /orgs/{org}/teams/{team_slug}/memberships/{username}",
      {
        org: this.org,
        team_slug: teamSlug,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.data;
  }

  /**
   * Remove a user from a team
   */
  async removeUserFromTeam(teamSlug, username) {
    const response = await this.octokit.request(
      "DELETE /orgs/{org}/teams/{team_slug}/memberships/{username}",
      {
        org: this.org,
        team_slug: teamSlug,
        username,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );
    return response.status === 204;
  }

  /**
   * Move a user from one team to another
   */
  async moveUserBetweenTeams(fromTeamSlug, toTeamSlug, username) {
    // First, add user to the destination team
    await this.addUserToTeam(toTeamSlug, username);
    
    // Then, remove user from the source team
    await this.removeUserFromTeam(fromTeamSlug, username);
    
    return { message: `User ${username} moved from ${fromTeamSlug} to ${toTeamSlug}` };
  }
}
