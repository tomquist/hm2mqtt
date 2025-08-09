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

# Create release branch
print_info "Creating release branch: $RELEASE_BRANCH"
git checkout -b "$RELEASE_BRANCH"

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
git diff --cached package.json ha_addon/config.yaml CHANGELOG.md package-lock.json || git diff package.json ha_addon/config.yaml CHANGELOG.md package-lock.json

# Stage and commit changes
git add package.json ha_addon/config.yaml CHANGELOG.md package-lock.json
git commit -m "Release v${VERSION}

- Update version in package.json to ${VERSION}
- Update version in config.yaml to ${VERSION}
- Update CHANGELOG.md with release date
- Update package-lock.json"

print_success "Created release commit"

# Push release branch
print_info "Pushing release branch to origin"
git push origin "$RELEASE_BRANCH"

# Switch to main and merge
print_info "Switching to main branch"
git checkout main
git pull origin main

print_info "Merging release branch into main"
git merge "$RELEASE_BRANCH" --no-ff -m "Merge release v${VERSION}"

# Create and push tag
print_info "Creating tag ${VERSION}"
git tag "${VERSION}"

print_info "Pushing main branch and tag"
git push origin main
git push origin "${VERSION}"

# Switch back to develop
print_info "Switching back to develop branch"
git checkout develop

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
    git push origin develop
fi

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
