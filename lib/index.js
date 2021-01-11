const core = require('@actions/core');
const github = require('@actions/github');


async function existingCommentsFrom(octokit, owner, repo, prNumber, userLogin) {
  const res = await octokit.pulls.listReviewComments({
    owner: owner,
    repo: repo,
    pull_number: prNumber
  })

  return res.data.reduce((acc, v) => {
    if (v.user.login !== userLogin) {
      return acc
    }

    acc.add(commentKey(v.path, v.line, v.user.login, v.body))

    return acc
  }, new Set())
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

function setOutputs(createdComments) {
  core.setOutput('comments-created-all', createdComments.every(x => x))
  core.setOutput('comments-created-some', createdComments.some(x => x))
  core.setOutput('comments-created-list', JSON.stringify(createdComments))
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
    sha
  } = github.context

  if (!repository) {
    core.info('unable to determine repository from request type')
    setOutputs(commentsCreated)
    return
  }

  const [owner, repo] = repository.full_name.split('/')

  let commitSha
  let prNumber

  if (pullRequest && pullRequest.number) {
    prNumber = pullRequest.number
    commitSha = pullRequest.head.sha
  } else {
    core.info('this action only works on pull_request events')
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
    } else {
      core.info(`skip commenting since comment already exists`)
    }

    commentsCreated.push(shouldCreateComment)
  }

  setOutputs(commentsCreated)
}

execute().catch((err) => {
  console.log(err)
  core.setFailed(err.message)
})