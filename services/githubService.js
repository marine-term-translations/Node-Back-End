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
    const value = translations;
    const path = filename;

    // Fetch the file content from GitHub
    const response = await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: this.owner,
        repo,
        path,
        ref: branch,
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

    // Fetch the sha of file content from GitHub
    const responseSha = await this.octokit.request(
      "GET /repos/{owner}/{repo}/contents/{path}",
      {
        owner: this.owner,
        repo,
        path,
        ref: branch,
      }
    );

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
        sha: responseSha.data.sha,
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      }
    );

    return response2;
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
}
