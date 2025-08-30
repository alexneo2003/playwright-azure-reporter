# Playwright Azure Reporter

Playwright Azure Reporter is a TypeScript package that creates a Playwright reporter for integrating test results with Azure DevOps Test Plans. It allows publishing test results directly to Azure DevOps using test case IDs embedded in test names or annotations.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## CRITICAL: Timeout Requirements

**NEVER CANCEL LONG-RUNNING COMMANDS**. This repository has specific timing requirements:

- **Dependencies**: `yarn install` - 60+ second timeout required  
- **Build**: `yarn build` - 30+ second timeout required
- **Tests**: `yarn test:reporter` - 120+ second timeout required (59 tests)
- **Complete workflow**: 180+ second timeout required for full validation
- **Browser installation**: Will fail due to network issues - document but continue

**Set explicit timeouts for ALL commands to prevent premature cancellation.**

## Working Effectively

- **Bootstrap the repository:**
  - `yarn install --ignore-engines` - Installs all dependencies. Takes ~15 seconds. NEVER CANCEL. Set timeout to 60+ seconds.
  - `npx playwright install` - Installs Playwright browsers. May fail due to network issues - document if it fails.

- **Build the project:**
  - `yarn build` - Full build (clean + lint + TypeScript compile). Takes ~8 seconds. NEVER CANCEL. Set timeout to 30+ seconds.
  - `yarn clean` - Removes dist/ directory. Takes <1 second.
  - `yarn dev` - Development build (lint + TypeScript compile). Takes ~8 seconds. Set timeout to 30+ seconds.

- **Run tests:**
  - `yarn test:reporter` - Run reporter unit tests. Takes ~50 seconds (59 tests). NEVER CANCEL. Set timeout to 120+ seconds.
  - `yarn test` - Run example integration tests. REQUIRES Playwright browsers to be installed.

- **Code quality:**
  - `yarn lint` - Type check and ESLint validation. Takes ~3 seconds. Set timeout to 30+ seconds.
  - `yarn lint:fix` - Auto-fix ESLint issues. Takes ~2 seconds. Set timeout to 30+ seconds.
  - `yarn format` - Format code with Prettier. Takes ~1.5 seconds. Set timeout to 30+ seconds.

## Validation

- **ALWAYS run the reporter test suite after making changes:**
  - `yarn test:reporter` validates the core reporter functionality without requiring browser installation
  - These tests cover all reporter modes, configuration validation, and Azure DevOps integration logic
  - Set timeout to 120+ seconds as tests take ~50 seconds to complete

- **Test the example suite only if browsers are available:**
  - The main test suite (`yarn test`) requires Playwright browsers and demonstrates Azure DevOps test case ID formats
  - If browsers fail to install due to network issues, document this but don't let it block your work

- **ALWAYS run code quality checks before completing changes:**
  - `yarn lint` - Type checking and linting (required for CI). Takes ~3 seconds. Set timeout to 30+ seconds.
  - `yarn format` - Code formatting (required for CI). Takes ~1.5 seconds. Set timeout to 30+ seconds.
  - These are enforced by the pre-commit hook and CI pipeline

- **Complete development workflow validation:**
  - Full workflow: `yarn build && yarn test:reporter && yarn lint && yarn format`
  - Takes ~63 seconds total. NEVER CANCEL. Set timeout to 180+ seconds.

## Playwright Browser Installation Issues

- **KNOWN ISSUE**: `npx playwright install` consistently fails with network timeouts or download failures
- **Error signature**: "Download failed: size mismatch" or "Download failure, code=1"
- **Impact**: Only affects the example integration tests (`yarn test`), not core development
- **Workaround**: Continue development without browsers - the reporter tests cover all functionality
- **Resolution**: Document the failure but do not let it block development work

## Common Tasks

### Building and Testing Workflow
```bash
# Complete development workflow (takes ~63 seconds total)
yarn install --ignore-engines     # ~15 seconds, timeout: 60+ seconds
yarn build                        # ~8 seconds, timeout: 30+ seconds  
yarn test:reporter                 # ~50 seconds, timeout: 120+ seconds
yarn lint                         # ~3 seconds, timeout: 30+ seconds
yarn format                       # ~1.5 seconds, timeout: 30+ seconds
```

### Code Quality Validation
```bash
# Before committing (enforced by pre-commit hook)
yarn lint          # Type checking + ESLint - ~3 seconds
yarn lint:fix      # Auto-fix linting issues - ~2 seconds
yarn format        # Format with Prettier - ~1.5 seconds
```

### Development Mode
```bash
# Watch mode requires nodemon to be installed globally
yarn dev:watch     # Auto-rebuild on file changes (if nodemon available)
# Alternative: Run yarn dev manually after changes
```

## Repository Structure

### Source Code (`src/`)
- `playwright-azure-reporter.ts` - Main reporter implementation
- `logger.ts` - Logging utilities
- `utils.ts` - Helper functions

### Tests (`tests/`)
- `tests/reporter/` - Comprehensive reporter unit tests (59 tests)
- `tests/example.spec.ts` - Example integration tests showing test case ID formats
- `tests/config/` - Test configuration and fixtures

### Key Files
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `playwright.config.ts` - Main Playwright configuration (requires Azure DevOps environment variables)
- `tests/reporter/playwright.config.ts` - Reporter test configuration
- `.eslintrc.js` - ESLint configuration
- `.prettierrc` - Prettier configuration

## Configuration Requirements

### For Integration Testing
The reporter requires Azure DevOps environment variables:
- `AZURE_PW_ORGURL` - Azure DevOps organization URL
- `AZURE_PW_TOKEN` - Personal access token
- `AZURE_PW_PLANID` - Test plan ID
- `AZURE_PW_PROJECTNAME` - Project name

### Test Case ID Formats
The reporter supports multiple test case ID formats:
- `[1] Test name` - Single test case
- `[1,2,3] Test name` - Multiple test cases
- `[1, 2, 3] Test name` - Multiple with spaces
- Tag format: `test('Test name', { tag: ['@[1]'] })`

## CI/CD Integration

- **GitHub Actions**: Uses `tests.yml` workflow
- **Pre-commit hooks**: Automatically runs `yarn lint`
- **Required Node.js**: Version 18+
- **Package manager**: Yarn (uses yarn.lock)

## Development Notes

- **TypeScript compilation**: Outputs to `dist/` directory with source maps and type definitions
- **Husky**: Git hooks are configured (install with `yarn install`)
- **Testing strategy**: Unit tests cover reporter logic, integration tests demonstrate usage
- **Build artifacts**: JavaScript files, type definitions, and source maps in `dist/`

## Validation Scenarios

After making changes to the reporter:

1. **Core functionality validation:**
   ```bash
   yarn build && yarn test:reporter  # Validates all reporter features
   ```

2. **Code quality validation:**
   ```bash
   yarn lint && yarn format  # Required for CI to pass
   ```

3. **Integration testing (if browsers available):**
   ```bash
   yarn test  # Tests example scenarios with test case IDs
   ```

## Common File Locations

### Frequently Modified Files
- `src/playwright-azure-reporter.ts` - Main reporter logic
- `tests/reporter/*.spec.ts` - Test files for specific features
- `package.json` - Dependencies and version updates

### Configuration Files
- `.eslintrc.js` - Linting rules
- `tsconfig.json` - TypeScript settings
- `playwright.config.ts` - Example configuration

### Generated Files (Do Not Edit)
- `dist/` - Built JavaScript and type definitions
- `test-results/` - Test output artifacts
- `node_modules/` - Dependencies