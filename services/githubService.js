import { Octokit } from "octokit";
import { parse } from "yaml";
import { diffLines } from "diff";
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
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: this.owner,
        repo,
        path: path,
        ref: branch,
      }
    );

    const content = Buffer.from(response.data.content, "base64").toString(
      "utf-8"
    );
    return parse(content);
  }

  /**
   * Update file content
   */
  async updateFile(repo, path, content, message, branch, sha) {
    return await this.octokit.request(
      "PUT /repos/{owner}/{repo}/contents/{path}",
      {
        owner: this.owner,
        repo,
        path,
        message,
        content: Buffer.from(content).toString("base64"),
        sha,
        branch,
      }
    );
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
   * Get detailed diff with file contents
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
              ref: "main",
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
              ref: branch,
            }
          );
          const afterContent = Buffer.from(
            afterResponse.data.content,
            "base64"
          ).toString("utf-8");

          // Parse YAML content
          const beforeData = parse(beforeContent);
          const afterData = parse(afterContent);

          // Generate line-by-line diff
          const diff = diffLines(beforeContent, afterContent);

          return {
            filename: file.filename,
            status: file.status,
            changes: file.changes,
            beforeContent: beforeData,
            afterContent: afterData,
            diff: diff,
          };
        } catch (error) {
          console.error(`Error processing file ${file.filename}:`, error);
          return {
            filename: file.filename,
            status: file.status,
            error: "Unable to retrieve file content or parse YAML",
          };
        }
      })
    );

    return diffsData;
  }

  /**
   * Check for conflicts between branch and main
   */
  async getConflicts(repo, branch) {
    // Get files from the branch comparison
    const files = await this.getDiff(repo, branch);

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
          for (const [key, value] of Object.entries(parsedBranch)) {
            if (parsedSync.hasOwnProperty(key)) {
              for (const [langKey, langValue] of Object.entries(value)) {
                if (
                  parsedSync[key].hasOwnProperty(langKey) &&
                  parsedSync[key][langKey] !== langValue
                ) {
                  conflicts.push({
                    key,
                    language: langKey,
                    branchValue: langValue,
                    mainValue: parsedSync[key][langKey],
                  });
                }
              }
            }
          }

          return conflicts.length > 0 ? { filename, conflicts } : null;
        } catch (error) {
          console.error(`Error checking conflicts for ${filename}:`, error);
          return null;
        }
      })
    );

    return conflictslist.filter((item) => item !== null);
  }

  /**
   * Update file with translations
   */
  async updateFileWithTranslations(repo, translations, branch, filename) {
    // Get current file content and SHA
    const currentFileResponse = await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: this.owner,
        repo,
        path: filename,
        ref: branch,
      }
    );

    const currentContent = Buffer.from(
      currentFileResponse.data.content,
      "base64"
    ).toString("utf-8");

    // Parse current content
    const parsedContent = parse(currentContent);

    // Update with new translations
    for (const [key, value] of Object.entries(translations)) {
      if (parsedContent.hasOwnProperty(key)) {
        for (const [lang, translation] of Object.entries(value)) {
          parsedContent[key][lang] = translation;
        }
      } else {
        parsedContent[key] = value;
      }
    }

    // Convert back to YAML
    const updatedContent = stringify(parsedContent);

    // Update the file
    return await this.updateFile(
      repo,
      filename,
      updatedContent,
      `Update translations in ${filename}`,
      branch,
      currentFileResponse.data.sha
    );
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
   * Get changed files and their status
   */
  async getChangedFiles(repo, branch) {
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

    if (!pullsResponse.data.length) {
      throw new Error("No pull request found for this branch");
    }

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

    return {
      pullRequestNumber: prNumber,
      files: response.data,
    };
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
   * Merge branch to main
   */
  async mergeBranch(repo, branch, title, body) {
    // First create a pull request
    const pullResponse = await this.octokit.request(
      "POST /repos/{owner}/{repo}/pulls",
      {
        owner: this.owner,
        repo,
        title,
        body,
        head: branch,
        base: "main",
      }
    );

    // Then merge it
    const mergeResponse = await this.octokit.request(
      "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
      {
        owner: this.owner,
        repo,
        pull_number: pullResponse.data.number,
        commit_title: title,
        commit_message: body,
        merge_method: "squash",
      }
    );

    return {
      pullRequest: pullResponse.data,
      merge: mergeResponse.data,
    };
  }
}
