import express, { json, response } from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import { Octokit } from "octokit";
import { parse, stringify } from "yaml";
import { diffLines } from "diff";

import swaggerUi from 'swagger-ui-express';
import swaggerFile from'./swagger_output.json' assert { type: 'json' };

dotenv.config();

const app = express();
const port = 5000;

app.use(cors());
app.use(json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerFile));

app.get('/api/github/oauth/link', async (req, res) => {
  const client_id = process.env.GITHUB_CLIENT_ID;

  // Validate the presence of the GitHub Client ID
  if (!client_id) {
    console.error('GitHub Client ID is missing.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub Client ID is missing in the environment variables.',
    });
  }

  // Generate the GitHub OAuth authorization link
  const scope = 'write:packages%20write:repo_hook%20read:repo_hook%20repo';

  // Respond with the OAuth link
  res.json({ client_id, scope });
});

app.post('/api/github/token', async (req, res) => {
  const { code } = req.body;
  const client_id = process.env.GITHUB_CLIENT_ID;
  const client_secret = process.env.GITHUB_CLIENT_SECRET;

  if (!client_id || !client_secret) {
    console.error('GitHub Client ID or Client Secret is missing.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub Client ID or Client Secret is missing in the environment variables.',
    });
  }

  if (!code) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'The "code" field is required.',
    });
  }

  try {
    const response = await axios.post(
      'https://github.com/login/oauth/access_token',
      new URLSearchParams({
        client_id,
        client_secret,
        code: code,
      }),
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    if (response.status !== 200) {
      console.error('GitHub API responded with a non-200 status code:', response.status);
      return res.status(response.status).json({
        error: 'GitHub API Error',
        message: `Received status code ${response.status} from GitHub API.`,
      });
    }
    if (response.data.error) {
      console.error('GitHub API responded with a error with 200 status code:', response.data.error_description);
      return res.status(400).json({
        error: response.data.error,
        message: response.data.error_description,
      });
    }

    res.json(response.data);
  } catch (error) {
    if (error.response) {
      // Server responded with a status other than 2xx
      console.error('GitHub API error:', error.response.status, error.response.data);
      res.status(error.response.status).json({
        error: 'GitHub API Error',
        message: error.response.data.error || 'An error occurred while communicating with the GitHub API.',
      });
    } else if (error.request) {
      // Request was made but no response was received
      console.error('No response from GitHub API:', error.request);
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'No response received from GitHub API.',
      });
    } else {
      // Something happened in setting up the request
      console.error('Error while setting up the request:', error.message);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred.',
      });
    }
  }
});

app.get('/api/github/branches', async (req, res) => {
  const { repo } = req.query;
  const token = req.headers.authorization;

  // Validate token
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization token is required in the headers.',
    });
  }

  // Validate repo query parameter
  if (!repo) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'The "repo" query parameter is required.',
    });
  }

  // Validate GITHUB_OWNER and GITHUB_KEY_BRANCH environment variables
  const owner = process.env.GITHUB_OWNER;
  const keyBranchPrefix = process.env.GITHUB_KEY_BRANCH;

  if (!owner) {
    console.error('GitHub owner is missing in environment variables.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub owner is not set in environment variables.',
    });
  }

  if (!keyBranchPrefix) {
    console.error('GitHub key branch prefix is missing in environment variables.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub key branch prefix is not set in environment variables.',
    });
  }

  try {
    const octokit = new Octokit({
      auth: token,
    });

    const response = await octokit.request('GET /repos/{owner}/{repo}/branches', {
      owner,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Filter branches based on the key branch prefix
    const branches = response.data.filter(branch => branch.name.startsWith(keyBranchPrefix));

    // Retrieve details for each branch
    const branchDetails = await Promise.all(branches.map(async (branch) => {
      try {
        // Get the branch's latest commit
        const commitResponse = await octokit.request('GET /repos/{owner}/{repo}/commits/{sha}', {
          owner,
          repo,
          sha: branch.commit.sha,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });

        return {
          name: branch.name,
          lastCommit: commitResponse.data.commit.committer.date,
        };
      } catch (commitError) {
        console.error(`Error retrieving commit details for branch ${branch.name}:`, commitError);
        return {
          name: branch.name,
          lastCommit: 'Error retrieving commit details',
        };
      }
    }));
    // console.log(branchDetails);
    res.json(branchDetails);
    
  } catch (error) {
    if (error.status) {
      // GitHub API responded with an error status
      console.error('GitHub API error:', error.status, error.message);
      return res.status(error.status).json({
        error: 'GitHub API Error',
        message: error.message || 'An error occurred while communicating with the GitHub API.',
      });
    }

    // Other unexpected errors
    console.error('Error while retrieving branches:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while retrieving the branches.',
    });
  }
});

app.get('/api/github/diff', async (req, res) => {
  const { repo, branch } = req.query;
  const token = req.headers.authorization;

  // Validate token
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization token is required in the headers.',
    });
  }

  // Validate repo and branch query parameters
  if (!repo || !branch) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Both "repo" and "branch" query parameters are required.',
    });
  }

  // Validate branch name prefix
  if (!branch.startsWith(process.env.GITHUB_KEY_BRANCH)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid branch name. The branch name must start with the specified key branch prefix.',
    });
  }

  // Validate environment variables
  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    console.error('GitHub owner is missing in environment variables.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub owner is not set in environment variables.',
    });
  }

  try {
    let files;
    const octokit = new Octokit({
      auth: token,
    });

    const pullsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      head: `${owner}:${branch}`,
      base: 'main',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!pullsResponse.data.length) {
      // Get the diff between main and the specified branch
      const response = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
        owner,
        repo,
        basehead: `main...${branch}`,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      files = response.data.files;
    }else{
      // Retrieve changed files in the pull request
      const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
        owner,
        repo,
        pull_number: pullsResponse.data[0].number,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      files = response.data;
    }
    // Retrieve the content of each changed file
    const filesContent = await Promise.all(
      files.map(async (file) => {
        try {
          const contentResponse = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner,
            repo,
            path: file.filename,
            ref: branch,
          });
          const content = parse(Buffer.from(contentResponse.data.content, 'base64').toString('utf-8'));
          return {"filename": file.filename ,"content": content};
        } catch (error) {
          console.error(`Error retrieving content for file ${file.filename}:`, error);
          throw new Error(`Failed to retrieve content for file: ${file.filename}`);
        }
      })
    );

    // Respond with the file contents
    res.json(filesContent);
  } catch (error) {
    console.error('Error while retrieving diff and file contents:', error);

    if (error.response) {
      // Handle GitHub API-specific errors
      return res.status(error.response.status).json({
        error: 'GitHub API Error',
        message: error.response.data.message || 'An error occurred while communicating with the GitHub API.',
      });
    }

    // Handle other unexpected errors
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while retrieving the diff.',
    });
  }
});

app.get('/api/github/conflicts', async (req, res) => {
  const { repo, branch } = req.query;
  const token = req.headers.authorization;

  // Validate token
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization token is required in the headers.',
    });
  }

  // Validate repo and branch query parameters
  if (!repo || !branch) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Both "repo" and "branch" query parameters are required.',
    });
  }

  // Validate environment variables
  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    console.error('GitHub owner is missing in environment variables.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub owner is not set in environment variables.',
    });
  }

  try {
    const octokit = new Octokit({
      auth: token,
    });

    // Compare main with the specified branch
    let files;
    const pullsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      head: `${owner}:${branch}`,
      base: 'main',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!pullsResponse.data.length) {
      // Get the diff between main and the specified branch
      const response = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
        owner,
        repo,
        basehead: `main...${branch}`,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      files = response.data.files;
    }else{
      // Retrieve changed files in the pull request
      const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
        owner,
        repo,
        pull_number: pullsResponse.data[0].number,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });
      files = response.data;
    }
    // const compareResponseMain = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
    //   owner,
    //   repo,
    //   basehead: `main...${branch}`,
    //   headers: {
    //     'X-GitHub-Api-Version': '2022-11-28',
    //   },
    // });

    // Compare the specified branch with ldes_sync
    const compareResponseSync = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner,
      repo,
      basehead: `${branch}...ldes_sync`,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Get filenames of modified files
    const mainBranchFiles = files.map(file => file.filename);
    const syncBranchFiles = compareResponseSync.data.files.map(file => file.filename);

    // Find common files between the two comparisons
    const commonFiles = mainBranchFiles.filter(filename => syncBranchFiles.includes(filename));

    // If no common files, return no conflict
    if (commonFiles.length === 0) {
      return res.status(204).send('No conflicts found');
    }

    // Fetch and compare the content of the common files
    const conflictslist = await Promise.all(
      commonFiles.map(async (filename) => {
        try {
          // Get content of the file in the ldes_sync branch
          const contentResponseSync = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner,
            repo,
            path: filename,
            ref: 'ldes_sync',
          });
          const contentSync = Buffer.from(contentResponseSync.data.content, 'base64').toString('utf-8');
          
          // Get content of the file in the specified branch
          const contentResponseBranch = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
            owner,
            repo,
            path: filename,
            ref: branch,
          });
          const contentBranch = Buffer.from(contentResponseBranch.data.content, 'base64').toString('utf-8');

          // Parse contents
          const parsedSync = parse(contentSync);
          const parsedBranch = parse(contentBranch);

          // Identify conflicts
          const conflicts = [];
          const labelsSync = parsedSync.labels;
          const labelsBranch = parsedBranch.labels;
          labelsSync.forEach(syncLabel => {
            const branchLabel = labelsBranch.find(label => label.name === syncLabel.name);
            if (branchLabel) {
              syncLabel.translations.forEach(syncTranslation => {
                const branchTranslation = branchLabel.translations.find(t =>
                  Object.keys(t).some(lang => syncTranslation[lang] !== undefined && t[lang] !== undefined)
                );
                if (branchTranslation) {
                  Object.entries(syncTranslation).forEach(([lang, syncValue]) => {
                    if (syncValue !== branchTranslation[lang] && syncValue !== "") {
                      conflicts.push({
                        label: syncLabel.name,
                        language: lang,
                        syncValue,
                        branchValue: branchTranslation[lang],
                      });
                    }
                  });
                }
              });
            }
          });
          return { filename, conflicts };
        } catch (err) {
          console.error(`Error retrieving content for file ${filename}:`, err);
          return { filename, conflicts: [{ error: `Failed to retrieve content for file: ${filename}` }] };
        }
      })
    );
    var boolConflict = false
    conflictslist.forEach(conflict => {
      if(conflict.conflicts.length > 0){
        boolConflict=true;
      }
    })
    // Return the conflicts
    if(boolConflict){
      res.json(conflictslist);
    }else{
      return res.status(204).send('No conflicts found');
    }

  } catch (error) {
    console.error('Error while checking for conflicts:', error);

    if (error.response) {
      // Handle GitHub API-specific errors
      return res.status(error.response.status).json({
        error: 'GitHub API Error',
        message: error.response.data.message || 'An error occurred while communicating with the GitHub API.',
      });
    }

    // Handle other unexpected errors
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while checking for conflicts.',
    });
  }
});

app.get('/api/github/content', async (req, res) => {
  const { repo, path, branch} = req.query;
  const token = req.headers.authorization;
  // console.log(token);
  try{
    const octokit = new Octokit({
      auth: token
    });
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: process.env.GITHUB_OWNER,
      repo,
      path: path,
      ref: branch
    });
    res.json(parse(Buffer.from(response.data.content, 'base64').toString('utf-8')));
  }catch (error){
    console.error('Error while retrieving the file count', error);
    res.status(500).send('Server internal error');
  }

});

// translations forma {[labelname] : {[language] : term, ...}, ...}
app.put('/api/github/update', async (req, res) => {
  const { repo, translations, branch, filename } = req.body;
  const token = req.headers.authorization;

  // Validate request parameters
  if (!repo || !translations || !branch || !filename) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'The "repo", "translations", "filename", and "branch" fields are required in the request body.',
    });
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization token is required in the headers.',
    });
  }

  const owner = process.env.GITHUB_OWNER;

  if (!owner) {
    console.error('GitHub owner is missing in environment variables.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub owner is not set in environment variables.',
    });
  }

  try {
    const octokit = new Octokit({
      auth: token,
    });
    const value = translations;
    const path = filename
    // Fetch the file content from GitHub
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path,
      ref: branch,
    });
    
    const content = parse(Buffer.from(response.data.content, 'base64').toString('utf-8'));

    // Update the content with the provided translations

    content.labels.forEach(label => {
      const translationKey = label.name;
      if (value.hasOwnProperty(translationKey)) {
        Object.entries(value[translationKey]).forEach(([language, term]) => {
          const translationObj = label.translations.find(t => t.hasOwnProperty(language));
          if (translationObj) {
            translationObj[language] = term;
          } else {
            console.warn(`Language ${language} not found for label ${translationKey}`);
          }
        });
      }
    });

    const updatedContent = stringify(content, { quotingType: '"', prettyErrors: true, lineWidth: 0, defaultStringType: 'QUOTE_DOUBLE', defaultKeyType: 'PLAIN' });

    // Fetch the sha of file content from GitHub
    const responseSha = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path,
      ref: branch,
    });
    

    // Commit the updated file to the repository
    const response2 = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path,
      branch,
      message: `Update translations for ${path}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: responseSha.data.sha,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    res.json(response2.data);
  } catch (error) {
    console.error('Error while updating the file:', error);

    if (error.response) {
      // Handle GitHub API-specific errors
      return res.status(error.response.status).json({
        error: 'GitHub API Error',
        message: error.response.data.message || 'An error occurred while communicating with the GitHub API.',
      });
    }

    // Handle unexpected errors
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while updating the file.',
    });
  }
});

app.get('/api/github/changed', async (req, res) => {
  const { repo, branch } = req.query;
  const token = req.headers.authorization;

  // Validate required fields
  if (!repo || !branch) {
    return res.status(400).json({
      error: 'Bad Request',
      message: '"repo" and "branch" query parameters are required.',
    });
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization token is required in the headers.',
    });
  }

  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    console.error('GitHub owner is missing in environment variables.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub owner is not set in environment variables.',
    });
  }

  try {
    let pullNumber;
    const octokit = new Octokit({ auth: token });

    // Retrieve pull requests related to the branch
    const pullsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      head: `${owner}:${branch}`,
      base: 'main',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // If there's no existing PR, compare the branch with main
    if (!pullsResponse.data.length) {
      const compareResponse = await octokit.request('GET /repos/{owner}/{repo}/compare/{base}...{head}', {
        owner,
        repo,
        base: 'main',
        head: branch,
      });

      // If the branch has no commits ahead of main, return success
      if (compareResponse.data.ahead_by === 0) {
        return res.json({ compare: true, message: 'The branch has no changes to compare with main.' });
      }

      // Create a new pull request if the branch has changes to compare
      const createPullResponse = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner,
        repo,
        title: 'New changes from ' + branch,
        body: 'Please review and merge these changes from ' + branch,
        head: branch,
        base: 'main',
        draft: true,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      pullNumber = createPullResponse.data.number;
    } else {
      // Use the existing pull request
      pullNumber = pullsResponse.data[0].number;
    }

    // Retrieve changed files in the pull request
    const { data: files } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Retrieve diffs and file contents for each file
    const diffsData = await Promise.all(files.map(async file => {
      try {
        // Get the content of the file before the changes (from main)
        const beforeResponse = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path: file.filename,
          ref: 'main',  // Refers to the main branch
        });
        const beforeContent = Buffer.from(beforeResponse.data.content, 'base64').toString('utf-8');

        // Get the content of the file after the changes (from the branch)
        const afterResponse = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
          owner,
          repo,
          path: file.filename,
          ref: branch,  // Refers to the branch being compared
        });
        const afterContent = Buffer.from(afterResponse.data.content, 'base64').toString('utf-8');

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
        console.error(`Error retrieving content for file ${file.filename}:`, fileError);
        throw new Error(`Failed to retrieve content for file: ${file.filename}`);
      }
    }));

    // Retrieve comments on the pull request
    const commentsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
      owner,
      repo,
      pull_number: pullNumber,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    const commentsData = commentsResponse.data.map(comment => ({
      path: comment.path,
      line: comment.position,
      body: comment.body,
      created_at: comment.created_at,
    }));

    res.json({ diffsData, commentsData, pullNumber });
  } catch (error) {
    console.error('Error while retrieving changed files or comments:', error);

    if (error.response) {
      // Handle GitHub API-specific errors
      return res.status(error.response.status).json({
        error: 'GitHub API Error',
        message: error.response.data.message || 'An error occurred while communicating with the GitHub API.',
      });
    }

    // Handle unexpected errors
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while retrieving the changed files or comments.',
    });
  }
});

app.put('/api/github/merge', async (req, res) => {
  const { repo, branch } = req.body;
  const token = req.headers.authorization;
  console.log("merge")

  // Validate request parameters
  if (!repo || !branch) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Both "repo" and "branch" fields are required in the request body.',
    });
  }

  // Validate authorization token
  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authorization token is required in the headers.',
    });
  }

  const owner = process.env.GITHUB_OWNER;
  if (!owner) {
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'GitHub owner is not set in environment variables.',
    });
  }

  try {
    const octokit = new Octokit({ auth: token });

    // Fetch all pull requests for the given repo and branch
    const pullsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo,
      head: `${owner}:${branch}`,
      base: 'main',
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    // Check if there are no pull requests for this branch
    if (pullsResponse.data.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: `No pull requests found for branch: ${branch}`,
      });
    }

    // Get details of the first pull request for the branch
    const pullRequest = pullsResponse.data[0];
    const pullDetailsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo,
      pull_number: pullRequest.number,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

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
        await octokit.graphql(markReadyQuery, { pullRequestId });
      }

      // Merge the pull request
      const mergeResponse = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner,
        repo,
        pull_number: pullDetailsResponse.data.number,
        commit_title: `Merge pull request #${pullDetailsResponse.data.number}`,
        commit_message: 'Merging pull request',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      // If the merge is successful, delete the branch
      if (mergeResponse.data.merged) {
        await octokit.request('DELETE /repos/{owner}/{repo}/git/refs/heads/{branch}', {
          owner,
          repo,
          branch,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28',
          },
        });

        res.json({ message: 'Merge successful and branch deleted' });
      } else {
        res.status(400).json({
          error: 'Merge Failed',
          message: 'The merge operation could not be completed.',
        });
      }
    } else {
      res.status(400).json({
        error: 'Not Mergeable',
        message: 'The pull request is not mergeable. Please check for conflicts.',
      });
    }
  } catch (error) {
    console.error('Error during merge:', error);

    if (error.response) {
      // GitHub API-specific error handling
      return res.status(error.response.status).json({
        error: 'GitHub API Error',
        message: error.response.data.message || 'Error occurred while communicating with the GitHub API.',
      });
    }

    // Generic error handling
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred during the merge process.',
    });
  }
});

app.post('/api/github/comment', async (req, res) => {
  const { token, pull_number, repo, comment, path, sha, line, side } = req.body;

  try {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
      owner: process.env.GITHUB_OWNER,
      repo,
      pull_number,
      body: comment,
      commit_id: sha,
      path,
      line,
      side,
    })
    res.json(response.data);
  } catch (error) {
    console.error('Error while retrieving the token:', error);
    res.status(500).send(`CLIENT_ID = ${CLIENT_ID} or ${process.env.GITHUB_CLIENT_ID} Server internal error`);
  }
});

app.listen(port, () => {
  console.log(`Serveur backend en écoute sur http://localhost:${port}`);
  // console.log(`Domain's name is : ${process.env.DOMAIN_NAME}`);
  console.log(`Client ID is : ${process.env.GITHUB_CLIENT_ID}`);
});
