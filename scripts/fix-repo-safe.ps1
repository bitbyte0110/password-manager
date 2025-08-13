# Fix GitHub push rejections (>100MB files) and reduce CRLF/LF warnings (ASCII-safe version)
# Idempotent and safe to re-run. Run from the repository root in Windows PowerShell.

$ErrorActionPreference = 'Continue'

function Step {
	param([string]$Message)
	Write-Host "`n== $Message ==" -ForegroundColor Cyan
}

# Verify repo root
if (-not (Test-Path .git)) {
	Write-Error 'This script must be run from the repository root (.git folder not found).'
	exit 1
}

# Determine current branch early
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ([string]::IsNullOrWhiteSpace($branch)) {
	Write-Error 'Unable to determine current Git branch. Ensure this is a Git repository with at least one commit.'
	exit 1
}
Write-Host ('Current branch: ' + $branch)

# A. Create/Update housekeeping files
Step 'A - Create/Update .gitignore and .gitattributes'

# .gitignore content
$gitignoreContent = @(
	'# Dependencies',
	'node_modules/',
	'',
	'# Expo cache and build',
	'.expo/',
	'.expo-shared/',
	'web-build/',
	'',
	'# Android build artifacts',
	'android/.gradle/',
	'android/**/build/',
	'android/app/build/',
	'android/build/',
	'',
	'# iOS build artifacts',
	'ios/Pods/',
	'ios/build/',
	'',
	'# IDE and OS junk',
	'.vscode/',
	'.idea/',
	'*.log',
	'.DS_Store'
) -join [Environment]::NewLine

Set-Content -LiteralPath .gitignore -Encoding UTF8 -Value $gitignoreContent

# .gitattributes content
$gitattributesContent = @(
	'* text=auto',
	'*.js   text eol=lf',
	'*.jsx  text eol=lf',
	'*.ts   text eol=lf',
	'*.tsx  text eol=lf',
	'*.css  text eol=lf',
	'*.html text eol=lf',
	'*.md   text eol=lf',
	'*.json text eol=lf'
) -join [Environment]::NewLine

Set-Content -LiteralPath .gitattributes -Encoding UTF8 -Value $gitattributesContent

# Stage housekeeping files
git add .gitignore .gitattributes | Out-Null

# B. Stop tracking build outputs in the current index
Step 'B - Stop tracking build outputs in the Git index'

if (Test-Path node_modules)    { git rm -r --cached --ignore-unmatch node_modules    | Out-Null } else { Write-Host 'Skip: node_modules (not found)' }
if (Test-Path android/build)   { git rm -r --cached --ignore-unmatch android/build   | Out-Null } else { Write-Host 'Skip: android/build (not found)' }
if (Test-Path android/.gradle) { git rm -r --cached --ignore-unmatch android/.gradle | Out-Null } else { Write-Host 'Skip: android/.gradle (not found)' }
if (Test-Path .expo)           { git rm -r --cached --ignore-unmatch .expo           | Out-Null } else { Write-Host 'Skip: .expo (not found)' }
if (Test-Path web-build)       { git rm -r --cached --ignore-unmatch web-build       | Out-Null } else { Write-Host 'Skip: web-build (not found)' }
if (Test-Path ios/Pods)        { git rm -r --cached --ignore-unmatch ios/Pods        | Out-Null } else { Write-Host 'Skip: ios/Pods (not found)' }
if (Test-Path ios/build)       { git rm -r --cached --ignore-unmatch ios/build       | Out-Null } else { Write-Host 'Skip: ios/build (not found)' }

# Commit the index cleanup if there are staged changes
$pending = (git status --porcelain).Trim()
if (-not [string]::IsNullOrWhiteSpace($pending)) {
	git commit -m 'chore: ignore node_modules & build artifacts; normalize line endings' | Out-Null
	Write-Host 'Committed housekeeping and index cleanup changes.'
} else {
	Write-Host 'No changes to commit for housekeeping/index cleanup.'
}

# C. Install git-filter-repo (to purge large blobs from HISTORY)
Step 'C - Ensure git-filter-repo is installed'

function Get-FilterRepoInvoker {
	# Prefer native git filter-repo if available
	try {
		& git filter-repo --version 2>$null | Out-Null
		if ($LASTEXITCODE -eq 0) { return 'git filter-repo' }
	} catch { }

	# Try Python module path (no exe on PATH needed)
	python -V 2>$null | Out-Null
	if ($LASTEXITCODE -eq 0) {
		try {
			python -m ensurepip --upgrade 2>$null | Out-Null
			python -m pip install --user --upgrade git-filter-repo | Out-Null
			# Verify python module invocation works
			& python -m git_filter_repo --version 2>$null | Out-Null
			if ($LASTEXITCODE -eq 0) { return 'python -m git_filter_repo' }
		} catch {
			Write-Warning ('pip-based installation attempt failed or module not runnable: ' + $_.Exception.Message)
		}
		# As a best-effort, add user Scripts path to PATH for this session and check exe again
		try {
			$userBase = python -m site --user-base
			if ($userBase) {
				$scriptPath = Join-Path $userBase 'Scripts'
				$pathParts = $env:Path -split ';'
				if ($pathParts -notcontains $scriptPath) { $env:Path = ($env:Path.TrimEnd(';')) + ';' + $scriptPath }
				& git filter-repo --version 2>$null | Out-Null
				if ($LASTEXITCODE -eq 0) { return 'git filter-repo' }
			}
		} catch { }
	}

    # Chocolatey fallback if available
    if (-not (Get-Command git-filter-repo -ErrorAction SilentlyContinue)) {
        if (Get-Command choco -ErrorAction SilentlyContinue) {
            try {
                choco install git-filter-repo -y --no-progress | Out-Null
                & git filter-repo --version 2>$null | Out-Null
                if ($LASTEXITCODE -eq 0) { return 'git filter-repo' }
            } catch { Write-Warning ('Chocolatey installation failed: ' + $_.Exception.Message) }
        }
    }

	throw 'git-filter-repo is not available. Please ensure Python (pip) or Chocolatey is installed, then re-run this script.'
}

$FilterRepoInvoker = $null
try {
	$FilterRepoInvoker = Get-FilterRepoInvoker
	Write-Host ('Using invoker: ' + $FilterRepoInvoker)
} catch {
	Write-Error $_.Exception.Message
	exit 1
}

# D. PURGE large files from ALL previous commits
Step 'D - Rewrite history to purge heavy paths (this can take a while)'

try {
	# Build common arguments
	$filterArgs = @(
		'--force','--invert-paths',
		'--path-glob','node_modules/**',
		'--path-glob','.expo/**',
		'--path-glob','web-build/**',
		'--path-glob','android/.gradle/**',
		'--path-glob','android/**/build/**',
		'--path-glob','android/**/obj/**',
		'--path-glob','ios/Pods/**',
		'--path-glob','ios/build/**',
		'--path-glob','*.apk',
		'--path-glob','*.so'
	)

	if ($FilterRepoInvoker -eq 'git filter-repo') {
		& git filter-repo @filterArgs
	} else {
		# python -m git_filter_repo invocation
		$parts = $FilterRepoInvoker -split ' '
		& $parts[0] $parts[1] $parts[2] @filterArgs
    }
	Write-Host 'History rewrite completed.'
} catch {
	Write-Error ('History rewrite failed: ' + $_.Exception.Message)
	Write-Host "Actionable guidance: Ensure 'git-filter-repo' runs manually, then re-run this script."
	exit 1
}

# E. Clean repository and push
Step 'E - Garbage-collect and push cleaned branch'

try {
	git gc --prune=now --aggressive | Out-Null
	Write-Host 'Garbage collection completed.'
} catch {
	Write-Warning ('git gc encountered an issue: ' + $_.Exception.Message)
}

# Pull (rebasing) to minimize divergence; if it fails, continue to push with force-with-lease as instructed
try {
	git pull --rebase origin $branch | Out-Null
	Write-Host ('Rebased onto origin/' + $branch + ' successfully.')
} catch {
	Write-Warning ('git pull --rebase failed or not necessary: ' + $_.Exception.Message)
}

try {
	git push origin $branch --force-with-lease
	Write-Host 'Force-with-lease push completed.'
} catch {
	Write-Error ('Push failed: ' + $_.Exception.Message)
	Write-Host 'Actionable guidance: Resolve any remote protections or permissions, then re-run the push step.'
	exit 1
}

# F. Post-checks & output summary
Write-Host ''
Write-Host '========================================='
Write-Host 'Success! Repository is cleaned and normalized.'
Write-Host ('- Branch pushed: ' + $branch)
Write-Host '- Large files and build artifacts were purged from history.'
Write-Host '- Line endings standardized via .gitattributes to reduce CRLF/LF warnings.'
Write-Host '========================================='
Write-Host ''
Write-Host 'For collaborators who already pulled the old history:' -ForegroundColor Yellow
Write-Host '  git fetch' -ForegroundColor Yellow
$resetCmd = '  git reset --hard origin/' + $branch
Write-Host $resetCmd -ForegroundColor Yellow


