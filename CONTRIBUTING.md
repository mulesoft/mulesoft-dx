# Contributing Guide for anypoint-public-api-specs

This page lists the operational governance model of this project, as well as the recommendations and requirements for how to best contribute to anypoint-public-api-specs. We strive to obey these as best as possible. As always, thanks for contributing — we hope these guidelines make it easier and shed some light on our approach and processes.

# Governance Model

## Salesforce Sponsored

The intent and goal of open sourcing this project is to increase the contributor and user base. However, only Salesforce employees will be given `admin` rights and will be the final arbiters of what contributions are accepted or not.

# Issues, Requests & Ideas

Use the GitHub Issues page to submit issues, enhancement requests, and discuss ideas.

### Bug Reports and Fixes

- If you find a bug in an API specification, please search for it in the [Issues](https://github.com/mulesoft/anypoint-public-api-specs/issues), and if it isn't already tracked, [create a new issue](https://github.com/mulesoft/anypoint-public-api-specs/issues/new). Even if an Issue is closed, feel free to comment and add details — it will still be reviewed.
- Issues that have been identified as a bug (note: able to reproduce) will be labelled `bug`.
- If you'd like to submit a fix for a bug, [send a Pull Request](#creating-a-pull-request) and mention the Issue number.

### New Features

- If you'd like to add new functionality to this project, describe the problem you want to solve in a [new Issue](https://github.com/mulesoft/anypoint-public-api-specs/issues/new).
- Issues that have been identified as a feature request will be labelled `enhancement`.
- If you'd like to implement the new feature, please wait for feedback from the project maintainers before spending too much time writing the code. In some cases, `enhancement`s may not align well with the project objectives at the time.

### Documentation and Miscellaneous

- If you want to make the documentation clearer, you have an alternative implementation of something that may have advantages over the way it's currently done, or you have any other change, we would be happy to hear about it!
  - If it's a trivial change, go ahead and [send a Pull Request](#creating-a-pull-request) with the changes you have in mind.
  - If not, [open an Issue](https://github.com/mulesoft/anypoint-public-api-specs/issues/new) to discuss the idea first.

If you're new to our project and looking for some way to make your first contribution, look for Issues labelled `good first contribution`.

# Contribution Checklist

- [x] Clean, simple, well styled code
- [x] Commits should be atomic and messages must be descriptive. Related issues should be mentioned by Issue number.
- [x] API specifications must be valid OpenAPI 3.0.x or 3.1.x
- [x] Dependencies
  - Minimize number of dependencies.
  - Prefer Apache 2.0, BSD3, MIT, ISC and MPL licenses.
- [x] Reviews
  - Changes must be approved via peer code review

# Creating a Pull Request

1. **Ensure the bug/feature was not already reported** by searching on GitHub under Issues. If none exists, create a new issue so that other contributors can keep track of what you are trying to add/fix and offer suggestions (or let you know if there is already an effort in progress).
2. **Fork** the repository on GitHub.
3. **Clone** the forked repo to your machine.
4. **Create** a new branch to contain your work (e.g. `git checkout -b fix-issue-11`).
5. **Run any `make` command** (e.g. `make help`) — this auto-configures pre-commit and pre-push git hooks that validate your changes locally.
6. **Commit** changes to your own branch.
7. **Push** your work back up to your fork (e.g. `git push origin fix-issue-11`).
8. **Submit** a Pull Request against the `main` branch and refer to the issue(s) you are fixing. Try not to pollute your pull request with unintended changes. Keep it simple and small.
9. **Sign** the Salesforce CLA (you will be prompted to do so when submitting the Pull Request).

> **NOTE**: Be sure to [sync your fork](https://help.github.com/articles/syncing-a-fork/) before making a pull request.


# License

By contributing your code, you agree to license your contribution under the terms of our project [LICENSE](LICENSE.txt) and to sign the [Salesforce CLA](https://cla.salesforce.com/sign-cla).