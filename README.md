# add-pr-review-comment
A Github action to add review comments to Pull Requests.

# Usage

```yaml
on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: nbaztec/add-pr-review-comment@v1
        with:
          message: |
            [{"path":"lib/main.js","line":10,"text":"something was deleted","side":"RIGHT"},{"path":"lib/main.js","line":8,"text":"something was added","side":"LEFT"}]
          repo-token: ${{ secrets.GITHUB_TOKEN }}
          repo-token-user-login: 'github-actions[bot]' # The user.login for temporary GitHub tokens
          allow-repeats: false # This is the default
```