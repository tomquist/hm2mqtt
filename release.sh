#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if version is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <version>"
    print_info "Example: $0 1.5.0"
    print_info ""
    print_info "This script can be run:"
    print_info "  • Locally: ./release.sh 1.5.0"
    print_info "  • Via GitHub Actions: Go to Actions → Release → Run workflow"
    exit 1
fi

VERSION="$1"

RELEASE_BRANCH="release/v${VERSION}"
CURRENT_DATE=$(date +%Y-%m-%d)

# Add-on version that develop carries between releases. It doubles as the image
# tag the Home Assistant Supervisor pulls, and matches the `next` tag CI pushes
# for every commit on develop.
DEV_ADDON_VERSION="next"

# Validate version format (semantic versioning)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    print_error "Version must follow semantic versioning format (e.g., 1.2.3)"
    exit 1
fi

# Detect if running in GitHub Actions
if [ -n "$GITHUB_ACTIONS" ]; then
    print_info "Running in GitHub Actions environment"
else
    print_info "Running locally"
fi

print_info "Starting release process for version ${VERSION}"

# Check if we're on develop branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "develop" ]; then
    print_error "You must be on the 'develop' branch to create a release"
    print_info "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Check if working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    print_error "Working directory is not clean. Please commit or stash your changes."
    git status --short
    exit 1
fi

# Check if develop is up to date
print_info "Checking if develop branch is up to date..."
git fetch origin
LOCAL=$(git rev-parse develop)
REMOTE=$(git rev-parse origin/develop)

if [ "$LOCAL" != "$REMOTE" ]; then
    print_error "Your develop branch is not up to date with origin/develop"
    print_info "Please run: git pull origin develop"
    exit 1
fi

# Ensure we have an up-to-date view of main as well, since the release is
# merged into it further down.
if ! git rev-parse --verify --quiet origin/main >/dev/null; then
    print_error "Could not find origin/main. Make sure the repository was checked out with full history (fetch-depth: 0)."
    exit 1
fi

# Check if release branch already exists
if git show-ref --verify --quiet "refs/heads/$RELEASE_BRANCH"; then
    print_error "Release branch $RELEASE_BRANCH already exists"
    exit 1
fi

# Check if tag already exists
if git show-ref --verify --quiet "refs/tags/$VERSION"; then
    print_error "Tag $VERSION already exists"
    exit 1
fi

# Check if CHANGELOG has [Next] section
if ! grep -q "\[Next\]" CHANGELOG.md; then
    print_warning "No [Next] section found in CHANGELOG.md"
    print_info "Please add a [Next] section with your changes before creating a release"
    exit 1
fi

print_info "All pre-checks passed"

# ---------------------------------------------------------------------------
# Failure handling
#
# All operations that mutate the *remote* (git push) are deferred to the very
# end of this script, after every local merge/tag has already succeeded. That
# way a failure midway (most commonly a merge conflict between main and
# develop) never leaves a half-finished release pushed to origin — we only
# need to roll back local state.
# ---------------------------------------------------------------------------
RELEASE_BRANCH_CREATED=false
TAG_CREATED=false

cleanup_on_failure() {
    local exit_code=$?
    if [ "$exit_code" -eq 0 ]; then
        return
    fi
    print_error "Release failed (exit code ${exit_code}). Rolling back local changes..."
    # Abort any merge that may be in progress so the working tree is clean.
    git merge --abort 2>/dev/null || true
    # Return to the branch we started on.
    git checkout "$CURRENT_BRANCH" 2>/dev/null || true
    if [ "$TAG_CREATED" = true ]; then
        git tag -d "$VERSION" 2>/dev/null || true
    fi
    if [ "$RELEASE_BRANCH_CREATED" = true ]; then
        git branch -D "$RELEASE_BRANCH" 2>/dev/null || true
    fi
    print_info "Local state restored. Nothing was pushed to the remote."
}
trap cleanup_on_failure EXIT

# Create release branch
print_info "Creating release branch: $RELEASE_BRANCH"
git checkout -b "$RELEASE_BRANCH"
RELEASE_BRANCH_CREATED=true

# Incorporate any commits that exist on main but not on develop (e.g. docs or
# CI hotfixes that were merged directly into main). Doing this on the release
# branch first guarantees that merging the release branch back into main later
# is a clean fast-forward, and surfaces any genuine conflict *before* we touch
# the remote.
print_info "Merging origin/main into the release branch to reconcile any main-only changes"
if ! git merge origin/main --no-ff -m "Merge main into release v${VERSION}"; then
    print_error "Merge conflict between main and develop while preparing the release."
    print_info "This usually means commits were pushed directly to 'main' and never"
    print_info "merged back into 'develop'. Resolve it once by running, e.g.:"
    print_info "    git checkout develop && git merge origin/main"
    print_info "  (fix conflicts, commit, push develop), then re-run the release."
    exit 1
fi

# Update version in package.json
print_info "Updating version in package.json"
sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json
rm package.json.bak

# Update version in config.yaml
print_info "Updating version in ha_addon/config.yaml"
sed -i.bak "s/version: \"[^\"]*\"/version: \"$VERSION\"/" ha_addon/config.yaml
rm ha_addon/config.yaml.bak

# Update CHANGELOG.md
print_info "Updating CHANGELOG.md"
# Replace [Next] with [VERSION] - DATE
sed -i.bak "s/\[Next\]/[$VERSION] - $CURRENT_DATE/" CHANGELOG.md
rm CHANGELOG.md.bak

# Run npm install to update package-lock.json
print_info "Updating package-lock.json"
npm install

# Show the changes
print_info "Changes to be committed:"
git diff package.json ha_addon/config.yaml CHANGELOG.md package-lock.json

# Stage and commit changes
git add package.json ha_addon/config.yaml CHANGELOG.md package-lock.json
git commit -m "Release v${VERSION}

- Update version in package.json to ${VERSION}
- Update version in config.yaml to ${VERSION}
- Update CHANGELOG.md with release date
- Update package-lock.json"

print_success "Created release commit"

# Switch to main and merge the release branch. Because the release branch
# already contains main, this is a clean (conflict-free) merge.
print_info "Switching to main branch"
git checkout main
git pull origin main

print_info "Merging release branch into main"
git merge "$RELEASE_BRANCH" --no-ff -m "Merge release v${VERSION}"

# Create tag
print_info "Creating tag ${VERSION}"
git tag "${VERSION}"
TAG_CREATED=true

# Switch back to develop and sync with main to include release changes
print_info "Switching back to develop branch"
git checkout develop

print_info "Syncing develop with main to include release changes"
git merge main --no-ff -m "Sync develop with main after release v${VERSION}"

# Add new [Next] section to CHANGELOG if it doesn't exist
if ! grep -q "\[Next\]" CHANGELOG.md; then
    print_info "Adding new [Next] section to CHANGELOG.md"
    # Insert new [Next] section after the first line
    sed -i.bak '1a\
## [Next]\
\

' CHANGELOG.md
    rm CHANGELOG.md.bak

    git add CHANGELOG.md
    git commit -m "Add new [Next] section to CHANGELOG.md"
fi

# Point the add-on back at the development image. The Home Assistant Supervisor
# uses the `version` from ha_addon/config.yaml as the tag of the prebuilt
# `image`, so as long as develop carries the released version, installing the
# add-on from the `#develop` repository pulls the released image instead of the
# development build that CI publishes as `:next`.
if ! grep -q "^version: \"${DEV_ADDON_VERSION}\"" ha_addon/config.yaml; then
    print_info "Restoring add-on version '${DEV_ADDON_VERSION}' in ha_addon/config.yaml"
    sed -i.bak "s/^version: \"[^\"]*\"/version: \"${DEV_ADDON_VERSION}\"/" ha_addon/config.yaml
    rm ha_addon/config.yaml.bak

    git add ha_addon/config.yaml
    git commit -m "Point the add-on back at the ${DEV_ADDON_VERSION} image on develop"
fi

# ---------------------------------------------------------------------------
# All local work succeeded. Now publish to the remote. From here on, a failure
# means a push didn't go through (typically a transient network issue) rather
# than an inconsistent repository state, so we stop touching local refs.
# ---------------------------------------------------------------------------
print_info "Pushing release branch to origin"
git push origin "$RELEASE_BRANCH"

print_info "Pushing main branch and tag"
git push --atomic origin main "${VERSION}"

print_info "Pushing updated develop branch"
git push origin develop

# Everything is pushed; disarm the rollback trap.
trap - EXIT

print_success "Release v${VERSION} completed successfully!"
print_info ""
print_info "Summary:"
print_info "- Release branch: $RELEASE_BRANCH (kept for potential hotfixes)"
print_info "- Main branch: Updated to v${VERSION}"
print_info "- Tag: ${VERSION} created"
print_info "- Develop branch: Ready for next development cycle"
print_info ""
print_info "Next steps:"
print_info "1. Verify the release on the main branch"
print_info "2. Check that CI/CD pipelines are triggered correctly"
print_info "3. Monitor for any issues with the release"
print_info "4. Continue development on the develop branch"
