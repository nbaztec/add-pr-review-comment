const core = require('@actions/core');
const github = require('@actions/github');
const { HttpClient } = require('@actions/http-client');

async function existingCommentsFrom(octokit, owner, repo, prNumber, userLogin) {
  const res = await octokit.pulls.listReviewComments({
    owner: owner,
    repo: repo,
    pull_number: prNumber
  })

  const userComments = res.data.reduce((acc, v) => {
    if (v.user.login !== userLogin) {
      return acc
    }

    acc.add(commentKey(v.path, v.line, v.user.login, v.body))

    return acc
  }, new Set())

  return userComments
}

async function execute() {
  const { allowRepeats, comments, repoToken, repoTokenUserLogin } = getInputs()
  let commentsCreated = comments.map(() => false)

  if (!repoToken) {
    throw new Error(
      'no github token provided, set one with the repo-token input or GITHUB_TOKEN env variable'
    )
  }

  const {
    payload: { pull_request: pullRequest, repository },
  } = github.context

  if (!repository) {
    core.info('unable to determine repository from request type')
    setOutputs(commentsCreated)
    return
  }

  const [owner, repo] = repository.full_name.split('/')
  const commitSha = pullRequest.head.sha

  let prNumber

  if (pullRequest && pullRequest.number) {
    prNumber = pullRequest.number
  } else {
    // If this is not a pull request, attempt to find a PR matching the sha
    const commitPullsList = await listCommitPulls({ repoToken, owner, repo, commitSha })
    prNumber = commitPullsList && commitPullsList.length && commitPullsList[0].number
  }

  if (!prNumber) {
    core.info('this action only works on pull_request events or other commits associated with a pull')
    setOutputs(commentsCreated)
    return
  }

  const octokit = github.getOctokit(repoToken)
  const existingComments = await existingCommentsFrom(octokit, owner, repo, prNumber, repoTokenUserLogin)

  commentsCreated = []
  for (const c of comments) {
    const key = commentKey(c.path, c.line, repoTokenUserLogin, c.text)

    const shouldCreateComment = allowRepeats || !existingComments.has(key)
    if (shouldCreateComment) {
      const res = await octokit.pulls.createReviewComment({
        owner: owner,
        repo: repo,
        pull_number: prNumber,
        body: c.text,
        commit_id: commitSha,
        path: c.path,
        line: c.line,
        side: c.side || 'RIGHT',
      })

      core.debug(`created ${res.data.url}`)
    }

    commentsCreated.push(shouldCreateComment)
  }

  setOutputs(commentsCreated)
}

function getInputs() {
  return {
    allowRepeats: core.getInput('allow-repeats') === 'true',
    comments: JSON.parse(core.getInput('comments') || '[]'),
    repoToken: core.getInput('repo-token') || process.env['GITHUB_TOKEN'],
    repoTokenUserLogin: core.getInput('repo-token-user-login') || 'github-actions[bot]',
  }
}

const regexClean = RegExp('[\\R\\s\\n\\r]', 'g')
function commentKey(path, line, user, text) {
  return `${path}:${line}:${user}:${text.replace(regexClean, '')}`
}

async function listCommitPulls(repoToken, owner, repo, commitSha) {
  const http = new HttpClient('http-client-add-pr-review-comment')

  const additionalHeaders = {
    accept: 'application/vnd.github.groot-preview+json',
    authorization: `token ${repoToken}`,
  }

  const res = await http.getJson(
    `https://api.github.com/repos/${owner}/${repo}/commits/${commitSha}/pulls`,
    additionalHeaders
  )

  return res.result
}

function setOutputs(createdComments) {
  core.setOutput('comments-created-all', createdComments.every(x => x))
  core.setOutput('comments-created-some', createdComments.some(x => x))
  core.setOutput('comments-created-list', JSON.stringify(createdComments))
}

execute().catch((err) => {
  console.log(err)
  core.setFailed(err.message)
})