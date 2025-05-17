import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

function readJSON(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file: string, data: any) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function bumpVersion(version: string): string {
  const parts = version.split('.').map(Number);
  parts[2] += 1;
  return parts.join('.');
}

function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function updatePackageJson(newVersion: string) {
  const pkgPath = path.join(__dirname, 'package.json');
  const pkg = readJSON(pkgPath);
  pkg.version = newVersion;
  writeJSON(pkgPath, pkg);
  console.log(`Updated package.json to version ${newVersion}`);
}

function updateConfigYaml(newVersion: string) {
  const configPath = path.join(__dirname, 'ha_addon', 'config.yaml');
  let config = fs.readFileSync(configPath, 'utf8');
  config = config.replace(/version: *["']?[\d.]+["']?/, `version: "${newVersion}"`);
  fs.writeFileSync(configPath, config);
  console.log(`Updated ha_addon/config.yaml to version ${newVersion}`);
}

function updateChangelog(newVersion: string) {
  const changelogPath = path.join(__dirname, 'CHANGELOG.md');
  let changelog = fs.readFileSync(changelogPath, 'utf8');
  const today = new Date().toISOString().slice(0, 10);
  changelog = changelog.replace(
    /^## \[(Next|Unreleased)\]/m,
    `## [${newVersion}] - ${today}`
  );
  fs.writeFileSync(changelogPath, changelog);
  console.log(`Updated CHANGELOG.md to version ${newVersion}`);
}

function runNpmInstall() {
  console.log('Running npm install to update package-lock.json...');
  execSync('npm install', { stdio: 'inherit' });
}

function main() {
  const pkg = readJSON(path.join(__dirname, 'package.json'));
  const currentVersion = pkg.version;
  const argVersion = process.argv[2];
  let newVersion: string;

  if (argVersion) {
    if (!isValidVersion(argVersion)) {
      console.error(`Invalid version string: ${argVersion}`);
      process.exit(1);
    }
    newVersion = argVersion;
    console.log(`Using provided version: ${newVersion}`);
  } else {
    newVersion = bumpVersion(currentVersion);
    console.log(`No version provided. Bumping patch: ${currentVersion} -> ${newVersion}`);
  }

  updatePackageJson(newVersion);
  updateConfigYaml(newVersion);
  updateChangelog(newVersion);
  runNpmInstall();

  console.log(`\nVersion bump complete: ${currentVersion} -> ${newVersion}`);
}

main(); 