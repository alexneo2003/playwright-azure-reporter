# Releases

This project supports both stable releases and beta releases with sophisticated versioning workflows.

## Stable Releases

The stable release workflow provides enhanced version management capabilities:

- **Automatic Publishing**: Triggered when a GitHub release is published
- **Manual Versioning**: Can be triggered manually via workflow dispatch with version strategy selection
- **Version Management**: Supports patch, minor, and major version increments
- **Changelog Generation**: Automatically updates CHANGELOG.md using conventional commits
- **Git Operations**: Creates version tags and commits changes
- **Configuration**: Customizable via `.beta-release.json` configuration file

### Manual Stable Release

You can trigger a stable release manually using the GitHub Actions workflow:

1. Go to the Actions tab in the repository
2. Select "Publish" workflow
3. Click "Run workflow"
4. Select version increment strategy (patch, minor, major)

The workflow will:
- Generate the new version based on the selected strategy
- Update package.json and CHANGELOG.md
- Create a git tag and commit
- Build and publish to npm with the `latest` tag
- Create a GitHub release

## Beta Releases

This project supports two types of beta releases to help test new features and bug fixes before they are included in stable releases:

1. **Merge Beta Releases**: Automatically triggered when pull requests are merged
2. **PR Beta Releases**: Manually triggered for individual pull requests

### Merge Beta Releases

- **Automatic Triggering**: Beta releases are automatically triggered when pull requests are merged into the main branch (or other configured branches)
- **Version Strategy**: Beta versions follow semantic versioning with a `-beta.X` suffix (e.g., `1.13.2-beta.0`)
- **Installation**: Install beta releases using the beta tag: `npm install @alex_neo/playwright-azure-reporter@beta`

### PR Beta Releases

PR beta releases allow you to test changes from a specific pull request before it's merged:

- **Manual Triggering**: Comment `/beta-release` on any open pull request to create a beta version
- **Source Branch**: The beta is built from the PR's source branch, not the target branch
- **Unique Versioning**: Each PR beta gets a unique version like `1.13.3-pr42.feature-branch.a1b2c3d`
- **Installation**: Install with the pr-beta tag: `npm install @alex_neo/playwright-azure-reporter@pr-beta`

### Configuration

You can customize release behavior by creating a `.beta-release.json` file in your project root:

```json
{
  "betaRelease": {
    "enabled": true,
    "branches": ["main", "develop"],
    "versionStrategy": "patch",
    "publishTag": "beta",
    "createGitHubRelease": true,
    "prBetaRelease": {
      "enabled": true,
      "versionStrategy": "patch",
      "publishTag": "pr-beta",
      "createGitHubRelease": false
    }
  },
  "stableRelease": {
    "enabled": true,
    "versionStrategy": "patch",
    "publishTag": "latest",
    "createGitHubRelease": true
  }
}
```

**Configuration Options:**

**Merge Beta Releases:**
- `enabled` (boolean): Enable or disable automatic beta releases. Default: `true`
- `branches` (string[]): List of branches that trigger beta releases when PRs are merged. Default: `["main"]`
- `versionStrategy` (string): Version increment strategy - `"patch"`, `"minor"`, or `"major"`. Default: `"patch"`
- `publishTag` (string): npm dist-tag for publishing beta releases. Default: `"beta"`
- `createGitHubRelease` (boolean): Whether to create GitHub releases for beta versions. Default: `true`

**PR Beta Releases:**
- `prBetaRelease.enabled` (boolean): Enable or disable PR beta releases. Default: `false`
- `prBetaRelease.versionStrategy` (string): Version increment strategy for PR betas. Default: `"patch"`
- `prBetaRelease.publishTag` (string): npm dist-tag for PR beta releases. Default: `"pr-beta"`
- `prBetaRelease.createGitHubRelease` (boolean): Whether to create GitHub releases for PR betas. Default: `false`

**Stable Releases:**
- `stableRelease.enabled` (boolean): Enable or disable enhanced stable release workflow. Default: `true`
- `stableRelease.versionStrategy` (string): Version increment strategy for stable releases. Default: `"patch"`
- `stableRelease.publishTag` (string): npm dist-tag for publishing stable releases. Default: `"latest"`
- `stableRelease.createGitHubRelease` (boolean): Whether to create GitHub releases for stable versions. Default: `true`

### Installing Beta Releases

**Install the latest merge beta release:**

```bash
npm install @alex_neo/playwright-azure-reporter@beta
```

**Install the latest PR beta release:**

```bash
npm install @alex_neo/playwright-azure-reporter@pr-beta
```

**Install a specific beta version:**

```bash
npm install @alex_neo/playwright-azure-reporter@1.13.2-beta.0
```

**Install a specific PR beta version:**

```bash
npm install @alex_neo/playwright-azure-reporter@1.13.3-pr42.feature-branch.a1b2c3d
```

### Manual Beta Release

**Merge Beta Releases:**

You can trigger merge beta releases manually using the GitHub Actions workflow:

1. Go to the Actions tab in the repository
2. Select "Beta Release" workflow
3. Click "Run workflow"
4. Optionally specify a different branch

**PR Beta Releases:**

To create a beta release for a specific pull request:

1. **Open the pull request** you want to test
2. **Comment `/beta-release`** on the PR
3. **Wait for the workflow** to build and publish the beta version
4. **Follow the installation instructions** posted back to the PR

The PR beta release will include all changes from the PR's source branch and create a unique version identifier.

**Note:** Beta releases are for testing purposes and may contain experimental features. For production use, always use the latest stable release.