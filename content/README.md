# content/

This folder is Annelyse's. It holds the site's longer texts in her own words, such as `submit.md`, the text of the Submit page.

She edits it on GitHub (midst-press/midst-web), in GitHub's editor or in her own pull request. Her changes come back to Gitea through the return path: a pull request from `github-main`.

Everyone else leaves it alone. On Gitea, a commit that changes anything here is refused, both by the pre-commit hook and in CI (`tools/check-content-owner.mjs`). The one exception is the return path's pull request. Annelyse, if you commit from a clone of your own, run `git config midst.contentOwner true` in it once, and the hook will let your commits through. Buttons, labels and short messages stay in the code and the catalog.

The files are Markdown: **bold**, *italic*, [a link](/app), and paragraphs separated by a blank line.
