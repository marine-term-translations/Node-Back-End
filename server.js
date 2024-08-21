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

app.post('/api/github/token', async (req, res) => {
  const { code } = req.body;
  // console.log("code :", code);
  const CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('GitHub Client ID or Client Secret is missing.');
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Bad server initialization.',
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
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
      {
        headers: {
          Accept: 'application/json',
        }
      }
    );
    // console.log(response.data);
    if (response.status === 200) {
      const responseData = response.data;

      // Check for error in response data
      if (responseData.error) {
        console.error('GitHub API returned an error:', responseData.error);
        return res.status(400).json({
          error: responseData.error,
          message: responseData.error_description,
          documentation_url: responseData.error_uri,
        });
      }

      return res.json(responseData);
    }

    // Handle unexpected status codes
    console.error('Unexpected status code from GitHub API:', response.status);
    return res.status(response.status).json({
      error: 'GitHub API Error',
      message: `Received status code ${response.status} from GitHub API.`,
    });

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

app.get('/api/github/branch', async (req, res) => {
  const {repo,} = req.query;
  const token = req.headers.authorization;
  try{
    const octokit = new Octokit({
      auth: token
    });
    const response = await octokit.request('GET /repos/{owner}/{repo}/branches', {
      owner: process.env.GITHUB_OWNER,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    const branchs = response.data.filter(branche => branche.name.startsWith(process.env.GITHUB_KEY_BRANCH));
    res.json(branchs);
  }catch(error){
    console.error('Error while retrieving the file count', error);
    res.status(500).send('Server internal error');
  }
});

app.get('/api/github/content', async (req, res) => {
  const { repo, path } = req.query;
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
      ref: process.env.GITHUB_BRANCH
    });
    res.json(Buffer.from(response.data.content, 'base64').toString('utf-8'));
  }catch (error){
    console.error('Error while retrieving the file count', error);
    res.status(500).send('Server internal error');
  }

});

app.get('/api/github/list', async (req, res) => {
  const { repo, path, branch} = req.query;
  const token = req.headers.authorization;
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
    const files = response.data.filter(item => item.type === 'file' && item.name.endsWith('.yml'));
    res.json(files);
  }catch (error){
    console.error('Error while retrieving file list', error);
    res.status(500).send('Server internal error');
  }
});

app.put('/api/github/update', async (req, res) => {
  // console.log("update");
  const { repo, path, translations, language } = req.body;
  const token = req.headers.authorization;
  try{
    // console.log("1");
    const octokit = new Octokit({
      auth: token
    });
    // console.log(token);
    // console.log(repo);
    // console.log(path);
    const response = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner: process.env.GITHUB_OWNER,
      repo,
      path,
      ref: process.env.GITHUB_BRANCH
    });
    // console.log("2");
    const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
    const contentObj = parse(content);
    contentObj.labels.forEach(label => {
      const translationKey = label.name;
      if (translations.hasOwnProperty(translationKey)) {
        const translationObj = label.translations.find(t => t.hasOwnProperty(language));
        if (translationObj) {
          translationObj[language] = translations[translationKey];
        }else{
          console.error("there is no " + language + " in the translation proposal ")
        }
      }
      
    });
    // console.log("3");
    const updatedContent = stringify(contentObj,{ quotingType: '"', prettyErrors: true });
    // console.log("4");
    const response2 = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: process.env.GITHUB_OWNER,
      repo,
      path,
      branch: process.env.GITHUB_BRANCH,
      message: `Update translations for ${path}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha : response.data.sha,
      headers :{
        'Content-Type':'application/json',
        'Authorization': 'token %s' % octokit.auth,
      }
    });
    // console.log("5");
    // console.log(response2);
    res.json(response2);
  }catch (error){
    console.error('Error while updating the file', error);
    res.status(500).send('Server internal error');
  }

});

app.get('/api/github/changed', async (req, res) => {
  const { repo } = req.query;
  const token = req.headers.authorization;
  try {
    let pullnumber;
    const octokit = new Octokit({ auth: token });

    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner: process.env.GITHUB_OWNER,
      repo,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      },
      direction: process.env.GITHUB_BRANCH,
    });
    // console.log(response.data);
    if(!response.data[0]){
      const responseCompare = await octokit.request('GET /repos/{owner}/{repo}/compare/{base}...{head}', {
        owner: process.env.GITHUB_OWNER,
        repo,
        base: process.env.GITHUB_BRANCH,
        head: 'main'
      });
      if (responseCompare.data.behind_by == 0){
        res.json({compare: true});
        return;
      }
      const responseCreate = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner: process.env.GITHUB_OWNER,
        repo,
        title: 'Amazing new translate',
        body: 'Please pull these awesome changes in!',
        head: process.env.GITHUB_BRANCH,
        base: 'main',
        draft : true,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      pullnumber = responseCreate.data.number;
    }else{
      pullnumber = response.data[0].number;
    }
    

    const { data: files } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/files', {
      owner: process.env.GITHUB_OWNER,
      repo,
      pull_number: pullnumber,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });


    const diffsData = await Promise.all(files.map(async file => {
      const beforeResponse = await octokit.request(`GET /repos/{owner}/{repo}/contents/{path}`, {
        owner: process.env.GITHUB_OWNER,
        repo,
        path: file.filename,
      });
      const beforeContent = Buffer.from(beforeResponse.data.content, 'base64').toString('utf-8');

      const afterResponse = await octokit.request(`GET ${file.contents_url}`);
      const afterContent = Buffer.from(afterResponse.data.content, 'base64').toString('utf-8');

      const diff = diffLines(beforeContent, afterContent);

      return {
        filename: file.filename,
        before: beforeContent,
        after: afterContent,
        filesha : file.sha,
        diff: diff
      };
    }));


    const commentsResponse = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
      owner: process.env.GITHUB_OWNER,
      repo,
      pull_number: pullnumber,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    const commentsData = commentsResponse.data.map(comment => ({
      path: comment.path,
      line: comment.position,
      body: comment.body,
      created_at: comment.created_at,
    }));
    res.json({ diffsData, commentsData, pullnumber });
  } catch (error) {
    console.error('Aïe', error);
    res.status(500).send('Error while retrieving data.');
  }
});

app.put('/api/github/pull', async (req, res) => {
  const {repo, pullnumber } = req.body;
  const token = req.headers.authorization;
  try {
    const octokit = new Octokit({ auth: token });
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner: process.env.GITHUB_OWNER,
      repo,
      pull_number : pullnumber,
      headers: {
        'X-GitHub-Api-Version': '2022-11-28'
      },
      direction: process.env.GITHUB_BRANCH,
    });
    if(response.data.mergeable){
      const markReadyQuery = `
        mutation($pullRequestId: ID!) {
          markPullRequestReadyForReview(input: {pullRequestId: $pullRequestId}) {
            pullRequest {
              id
              number
              state
            }
          }
        }
      `;

      const pullRequestId = response.data.node_id;

      const responserfr = await octokit.graphql(markReadyQuery, {
        pullRequestId
      });
      const mergeResponse = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner: process.env.GITHUB_OWNER,
        repo,
        pull_number: pullnumber,
        commit_title: 'Merge pull'+pullnumber,
        commit_message: 'Add a new value to the merge_method',
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      })
      res.json(mergeResponse.data)
    }else{
    }
  } catch (error) {
    console.error('Error during merge:', error);
    // console.log("______________________________________");
    res.status(500).send('Server internal error');
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
  console.log(`Domain's name is : ${process.env.DOMAIN_NAME}`);
  console.log(`Client ID is : ${process.env.GITHUB_CLIENT_ID}`);
});
