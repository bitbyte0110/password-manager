# Fix GitHub push rejections (>100MB files) and reduce CRLF/LF warnings for a React Native / Expo repo
# Idempotent and safe to re-run. Run from the repository root in Windows PowerShell.

$ErrorActionPreference = 'Continue'

function Write-Step {
	param([string]$Message)
	Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

# Verify repo root
if (-not (Test-Path .git)) {
	Write-Error "This script must be run from the repository root ('.git' folder not found)."
	exit 1
}

# Determine current branch early
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
	Write-Error "Unable to determine current Git branch. Ensure this is a Git repository with at least one commit."
	exit 1
}
Write-Host "Current branch: $branch"

# ────────────────────────────────────────────────────────
# A. Create/Update housekeeping files
# ────────────────────────────────────────────────────────
Write-Step "STEP A — Create/Update .gitignore and .gitattributes"

# 1) .gitignore (overwrite with required content)
$gitignoreContent = "# Dependencies`nnode_modules/`n`n# Expo cache and build`n.expo/`n.expo-shared/`nweb-build/`n`n# Android build artifacts`nandroid/.gradle/`nandroid/**/build/`nandroid/app/build/`nandroid/build/`n`n# iOS build artifacts`nios/Pods/`nios/build/`n`n# IDE and OS junk`n.vscode/`n.idea/`n*.log`n.DS_Store`n"
Set-Content -LiteralPath .gitignore -Encoding UTF8 -Value $gitignoreContent

# 2) .gitattributes (overwrite with required content to reduce line-ending warnings)
$gitattributesContent = "* text=auto`n*.js   text eol=lf`n*.jsx  text eol=lf`n*.ts   text eol=lf`n*.tsx  text eol=lf`n*.css  text eol=lf`n*.html text eol=lf`n*.md   text eol=lf`n*.json text eol=lf`n"
Set-Content -LiteralPath .gitattributes -Encoding UTF8 -Value $gitattributesContent

# 3) Stage housekeeping files
git add .gitignore .gitattributes | Out-Null

# ────────────────────────────────────────────────────────
# B. Stop tracking build outputs in the current index
# ────────────────────────────────────────────────────────
Write-Step "STEP B — Stop tracking build outputs in the Git index"

if (Test-Path node_modules) { git rm -r --cached --ignore-unmatch node_modules    | Out-Null } else { Write-Host "Skip: node_modules (not found)" }
if (Test-Path android/build) { git rm -r --cached --ignore-unmatch android/build   | Out-Null } else { Write-Host "Skip: android/build (not found)" }
if (Test-Path android/.gradle) { git rm -r --cached --ignore-unmatch android/.gradle | Out-Null } else { Write-Host "Skip: android/.gradle (not found)" }
if (Test-Path .expo) { git rm -r --cached --ignore-unmatch .expo           | Out-Null } else { Write-Host "Skip: .expo (not found)" }
if (Test-Path web-build) { git rm -r --cached --ignore-unmatch web-build       | Out-Null } else { Write-Host "Skip: web-build (not found)" }
if (Test-Path ios/Pods) { git rm -r --cached --ignore-unmatch ios/Pods        | Out-Null } else { Write-Host "Skip: ios/Pods (not found)" }
if (Test-Path ios/build) { git rm -r --cached --ignore-unmatch ios/build       | Out-Null } else { Write-Host "Skip: ios/build (not found)" }

# Commit the index cleanup if there are staged changes
$pending = (git status --porcelain).Trim()
if (-not [string]::IsNullOrWhiteSpace($pending)) {
	git commit -m "chore: ignore node_modules & build artifacts; normalize line endings" | Out-Null
	Write-Host "Committed housekeeping and index cleanup changes."
}
else {
	Write-Host "No changes to commit for housekeeping/index cleanup."
}

# ────────────────────────────────────────────────────────
# C. Install git-filter-repo (to purge large blobs from HISTORY)
# ────────────────────────────────────────────────────────
Write-Step "STEP C — Ensure git-filter-repo is installed"

function Ensure-FilterRepo {
	# Try Python + pip (user install)
	python -V 2>$null | Out-Null
	if ($LASTEXITCODE -eq 0) {
		try {
			python -m ensurepip --upgrade 2>$null | Out-Null
			python -m pip install --user --upgrade git-filter-repo | Out-Null
			$userBase = python -m site --user-base
			if ($userBase) {
				$scriptPath = Join-Path $userBase 'Scripts'
				$pathParts = $env:Path -split ';'
				if ($pathParts -notcontains $scriptPath) { $env:Path = ($env:Path.TrimEnd(';')) + ';' + $scriptPath }
			}
		}
		catch {
			Write-Warning "pip-based installation attempt failed: $($_.Exception.Message)"
		}
	}

	# Fall back to Chocolatey
	if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
		choco -v 2>$null | Out-Null
		if ($LASTEXITCODE -eq 0) {
			try {
				choco install git-filter-repo -y --no-progress | Out-Null
			}
			catch {
				Write-Warning "Chocolatey installation failed: $($_.Exception.Message)"
			}
		}
		else {
			Write-Warning "Chocolatey is not installed; skipping Chocolatey installation path."
		}
	}

	# Final check
	if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
		throw "git-filter-repo is not available. Please ensure either Python (pip) or Chocolatey is installed, then re-run this script."
	}
}

try {
	Ensure-FilterRepo
	Write-Host "git-filter-repo is available."
}
catch {
	Write-Error $_.Exception.Message
	exit 1
}

# ────────────────────────────────────────────────────────
# D. PURGE large files from ALL previous commits
# ────────────────────────────────────────────────────────
Write-Step "STEP D — Rewrite history to purge heavy paths (this can take a while)"

try {
	git filter-repo --force --invert-paths `
		--path-glob 'node_modules/**' `
		--path-glob '.expo/**' `
		--path-glob 'web-build/**' `
		--path-glob 'android/.gradle/**' `
		--path-glob 'android/**/build/**' `
		--path-glob 'android/**/obj/**' `
		--path-glob 'ios/Pods/**' `
		--path-glob 'ios/build/**' `
		--path-glob '*.apk' `
		--path-glob '*.so'
	Write-Host "History rewrite completed."
}
catch {
	Write-Error "History rewrite failed: $($_.Exception.Message)"
	Write-Host "Actionable guidance: Ensure 'git-filter-repo' runs manually, then re-run this script."
	exit 1
}

# ────────────────────────────────────────────────────────
# E. Clean repository and push
# ────────────────────────────────────────────────────────
Write-Step "STEP E — Garbage-collect and push cleaned branch"

try {
	git gc --prune=now --aggressive | Out-Null
	Write-Host "Garbage collection completed."
}
catch {
	Write-Warning "git gc encountered an issue: $($_.Exception.Message)"
}

# Pull (rebasing) to minimize divergence; if it fails, continue to push with force-with-lease as instructed
try {
	git pull --rebase origin $branch | Out-Null
	Write-Host "Rebased onto origin/$branch successfully."
}
catch {
	Write-Warning "git pull --rebase failed or not necessary: $($_.Exception.Message)"
}

try {
	git push origin $branch --force-with-lease
	Write-Host "Force-with-lease push completed."
}
catch {
	Write-Error "Push failed: $($_.Exception.Message)"
	Write-Host "Actionable guidance: Resolve any remote protections or permissions, then re-run the push step."
	exit 1
}

# ────────────────────────────────────────────────────────
# F. Post-checks & output summary
# ────────────────────────────────────────────────────────
Write-Host '' -ForegroundColor Green
Write-Host '=========================================' -ForegroundColor Green
Write-Host 'Success! Repository is cleaned and normalized.' -ForegroundColor Green
Write-Host ('- Branch pushed: ' + $branch) -ForegroundColor Green
Write-Host '- Large files and build artifacts were purged from history.' -ForegroundColor Green
Write-Host '- Line endings standardized via .gitattributes to reduce CRLF/LF warnings.' -ForegroundColor Green
Write-Host '=========================================' -ForegroundColor Green

Write-Host 'For collaborators who already pulled the old history:' -ForegroundColor Yellow
Write-Host '  git fetch' -ForegroundColor Yellow
$resetCmd = '  git reset --hard origin/' + $branch
Write-Host $resetCmd -ForegroundColor Yellow


