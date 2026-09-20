<#
.SYNOPSIS
  agentkit installer for Windows -- mirrors install.sh's contract.
.DESCRIPTION
  Symlinks (default) or copies (-Copy) dist/<tool>/ into each tool's global
  config location. Idempotent: re-running never clobbers a file this
  installer didn't create; conflicting existing files are backed up.
.PARAMETER Tools
  Comma-separated: claude,copilot,cursor,antigravity (default: all four)
.PARAMETER Copy
  Copy instead of symlink (use when Developer Mode / symlink privilege is
  unavailable).
.PARAMETER Uninstall
  Remove everything this installer created, restoring any backups.
.PARAMETER Upgrade
  git pull the clone, then re-link using your last-used -Tools, pruning any
  symlink whose source skill was removed upstream.
.PARAMETER Version
  Show the installed vs. latest released version.
.PARAMETER DryRun
  Print what would happen without touching the filesystem.
.PARAMETER WithExternal
  Also fetch every source pinned in external/skills.lock.json (requires a
  bash on PATH -- Git Bash/WSL; the sync script itself is POSIX sh).
.PARAMETER WithBoost
  Install jfrog/boost (CLI output compression) and wire it into every
  -Tools target boost supports (claude, cursor, copilot). THIS ACCEPTS
  JFROG'S ONLINE PREVIEW AGREEMENT (boost.jfrog.com/preview-agreement)
  NON-INTERACTIVELY and sends them command metadata (timing, exit codes,
  token savings -- never raw output or file contents). Pass it only once
  you already agree to those terms; never on by default.
.EXAMPLE
  .\install.ps1 -Tools claude,cursor
.EXAMPLE
  .\install.ps1 -Uninstall
.EXAMPLE
  .\install.ps1 -Upgrade
#>
[CmdletBinding()]
param(
    [string]$Tools = "",
    [switch]$Copy,
    [switch]$Uninstall,
    [switch]$Upgrade,
    [switch]$Version,
    [switch]$DryRun,
    [switch]$WithExternal,
    [switch]$WithBoost
)

$ErrorActionPreference = "Stop"
$AgentkitHome = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $AgentkitHome "dist"
$ManifestDir = Join-Path $env:LOCALAPPDATA "agentkit"
$Manifest = Join-Path $ManifestDir "manifest.tsv"
$ToolsFile = Join-Path $ManifestDir "tools"
$ToolsGiven = $PSBoundParameters.ContainsKey("Tools")

if (-not (Test-Path $ManifestDir)) { New-Item -ItemType Directory -Path $ManifestDir -Force | Out-Null }
if (-not (Test-Path $Manifest)) { New-Item -ItemType File -Path $Manifest -Force | Out-Null }

function Write-Log($msg) { Write-Host $msg }
function Write-Warn($msg) { Write-Warning $msg }

function Install-One([string]$SourcePath, [string]$DestPath) {
    if (-not (Test-Path $SourcePath)) { return }

    $manifestLines = Get-Content $Manifest -ErrorAction SilentlyContinue
    $isOurs = $manifestLines -contains $DestPath

    if (Test-Path $DestPath) {
        $item = Get-Item $DestPath -Force
        $alreadyLinked = ($item.LinkType -eq "SymbolicLink") -and
            ((Get-Item $item.Target -ErrorAction SilentlyContinue).FullName -eq (Resolve-Path $SourcePath).Path)
        if ($alreadyLinked) { return }

        if (-not $isOurs) {
            $ts = Get-Date -Format "yyyyMMddHHmmss"
            $bak = "$DestPath.bak.$ts"
            Write-Warn "$DestPath exists and is not managed by agentkit -- backing up to $bak"
            if (-not $DryRun) { Move-Item -Force $DestPath $bak }
        } else {
            if (-not $DryRun) { Remove-Item -Recurse -Force $DestPath }
        }
    }

    if ($DryRun) { Write-Log "  would install: $DestPath"; return }

    $destDir = Split-Path -Parent $DestPath
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

    if ($Copy) {
        Copy-Item -Recurse -Force $SourcePath $DestPath
    } else {
        try {
            New-Item -ItemType SymbolicLink -Path $DestPath -Target $SourcePath -Force | Out-Null
        } catch {
            Write-Warn "symlink failed (enable Developer Mode or run as admin) -- falling back to copy for $DestPath"
            Copy-Item -Recurse -Force $SourcePath $DestPath
        }
    }
    if (-not $isOurs) { Add-Content -Path $Manifest -Value $DestPath }
    Write-Log "  installed: $DestPath"
}

function Install-Claude {
    Write-Log "claude:"
    $base = Join-Path $env:USERPROFILE ".claude"
    Get-ChildItem -Directory (Join-Path $Dist "claude\skills") -ErrorAction SilentlyContinue | ForEach-Object {
        Install-One $_.FullName (Join-Path $base "skills\$($_.Name)")
    }
    Get-ChildItem -File (Join-Path $Dist "claude\agents") -Filter *.md -ErrorAction SilentlyContinue | ForEach-Object {
        Install-One $_.FullName (Join-Path $base "agents\$($_.Name)")
    }
    Install-One (Join-Path $AgentkitHome "AGENTS.md") (Join-Path $base "CLAUDE.md")
}

function Install-Copilot {
    Write-Log "copilot:"
    $base = Join-Path $env:APPDATA "Code\User"
    Install-One (Join-Path $AgentkitHome "AGENTS.md") (Join-Path $base "copilot-instructions.md")
    Get-ChildItem -File (Join-Path $Dist "copilot\instructions") -Filter *.instructions.md -ErrorAction SilentlyContinue | ForEach-Object {
        Install-One $_.FullName (Join-Path $base "instructions\$($_.Name)")
    }
}

function Install-Cursor {
    Write-Log "cursor:"
    $base = if ($env:CURSOR_HOME) { $env:CURSOR_HOME } else { Join-Path $env:USERPROFILE ".cursor" }
    Get-ChildItem -File (Join-Path $Dist "cursor\rules") -Filter *.mdc -ErrorAction SilentlyContinue | ForEach-Object {
        Install-One $_.FullName (Join-Path $base "rules\$($_.Name)")
    }
    Install-One (Join-Path $AgentkitHome "AGENTS.md") (Join-Path $env:USERPROFILE "AGENTS.md")
}

function Install-Antigravity {
    Write-Log "antigravity:"
    $base = if ($env:ANTIGRAVITY_HOME) { $env:ANTIGRAVITY_HOME } else { Join-Path $env:USERPROFILE ".antigravity" }
    Get-ChildItem -File (Join-Path $Dist "antigravity\rules") -Filter *.md -ErrorAction SilentlyContinue | ForEach-Object {
        Install-One $_.FullName (Join-Path $base "rules\$($_.Name)")
    }
    Get-ChildItem -File (Join-Path $Dist "antigravity\workflows") -Filter *.md -ErrorAction SilentlyContinue | ForEach-Object {
        Install-One $_.FullName (Join-Path $base "workflows\$($_.Name)")
    }
}

function Uninstall-All {
    if (-not (Test-Path $Manifest) -or (Get-Content $Manifest).Count -eq 0) {
        Write-Log "nothing to uninstall (no manifest at $Manifest)"
        return
    }
    Get-Content $Manifest | ForEach-Object {
        $path = $_
        if (-not (Test-Path $path)) { return }
        if ($DryRun) { Write-Log "  would remove: $path"; return }
        Remove-Item -Recurse -Force $path
        $bak = Get-ChildItem -Path (Split-Path $path -Parent) -Filter "$(Split-Path $path -Leaf).bak.*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending | Select-Object -First 1
        if ($bak) {
            Move-Item -Force $bak.FullName $path
            Write-Log "  removed: $path (restored backup $($bak.Name))"
        } else {
            Write-Log "  removed: $path"
        }
    }
    if (-not $DryRun) { Set-Content -Path $Manifest -Value @() }
    Write-Log "uninstall complete"
}

# drop any manifest entry whose symlink target no longer exists in dist/
# (the source skill/agent was removed upstream) so an upgrade leaves no
# dangling links behind.
function Remove-StaleEntries {
    if (-not (Test-Path $Manifest)) { return }
    $kept = @()
    foreach ($path in (Get-Content $Manifest)) {
        if (-not $path) { continue }
        $stale = $false
        if (Test-Path $path) {
            $item = Get-Item $path -Force -ErrorAction SilentlyContinue
            if ($item -and $item.LinkType -eq "SymbolicLink" -and $item.Target -like "$Dist*" -and -not (Test-Path $item.Target)) {
                $stale = $true
            }
        }
        if ($stale) {
            if (-not $DryRun) { Remove-Item -Force $path }
            Write-Log "  pruned (removed upstream): $path"
        } else {
            $kept += $path
        }
    }
    if (-not $DryRun) { Set-Content -Path $Manifest -Value $kept }
}

function Show-Version {
    Push-Location $AgentkitHome
    try {
        $installed = git describe --tags --always 2>$null
        if (-not $installed) { Write-Log "installed: unknown (not a git clone)"; return }
        Write-Log "installed: $installed"
        git fetch --tags --quiet origin 2>$null
        $latest = (git tag --list "v*" --sort=-v:refname | Select-Object -First 1)
        if ($latest) { Write-Log "latest:    $latest" }
        if ($latest -and $installed -ne $latest) { Write-Log "-> run '.\install.ps1 -Upgrade' to update" }
    } finally { Pop-Location }
}

function Invoke-Upgrade {
    Push-Location $AgentkitHome
    try {
        if (-not (Test-Path ".git")) {
            Write-Error "$AgentkitHome is not a git clone -- can't auto-upgrade; git pull it yourself, or re-clone"
            exit 1
        }
        $before = git rev-parse --short HEAD
        Write-Log "pulling latest agentkit into $AgentkitHome ..."
        if (-not $DryRun) { git pull --ff-only }
        $after = git rev-parse --short HEAD
        if ($before -eq $after) { Write-Log "already up to date ($before)" } else { Write-Log "updated $before -> $after" }
    } finally { Pop-Location }

    if (-not $ToolsGiven -and (Test-Path $ToolsFile)) {
        $script:Tools = Get-Content $ToolsFile -Raw
    }
    if (-not $script:Tools) { $script:Tools = "claude,copilot,cursor,antigravity" }

    Remove-StaleEntries
    Invoke-Install
}

function Invoke-Install {
    Write-Log "agentkit install ($(if ($Copy) {'copy'} else {'link'}) mode) -- tools: $Tools"
    foreach ($tool in $Tools -split ",") {
        switch ($tool.Trim()) {
            "claude"      { Install-Claude }
            "copilot"     { Install-Copilot }
            "cursor"      { Install-Cursor }
            "antigravity" { Install-Antigravity }
            default       { Write-Warn "unknown tool '$tool', skipping" }
        }
    }
    if (-not $DryRun) { Set-Content -Path $ToolsFile -Value $Tools -NoNewline }

    if ($WithExternal) {
        Write-Log "fetching pinned external skill sources..."
        $bash = Get-Command bash -ErrorAction SilentlyContinue
        if (-not $bash) {
            Write-Warn "no bash on PATH (install Git for Windows / WSL) -- skipping; run scripts/sync-external.sh manually once bash is available"
        } elseif ($DryRun) {
            Write-Log "  would run: bash scripts/sync-external.sh"
        } else {
            & $bash.Source (Join-Path $AgentkitHome "scripts/sync-external.sh")
            if ($LASTEXITCODE -ne 0) { Write-Warn "sync-external.sh failed -- native skills are still installed; re-run it yourself when ready" }
        }
    }

    if ($WithBoost) { Install-Boost }

    Write-Log "done. re-run any time -- already-linked files are skipped, edits outside agentkit are backed up, never overwritten."
}

# Install-Boost -- installs jfrog/boost if missing, wires it into every
# -Tools target boost supports (claude, cursor, copilot). Accepts JFrog's
# Online Preview Agreement non-interactively -- only reached via -WithBoost,
# which is the consent (see the .PARAMETER WithBoost doc above).
function Install-Boost {
    Write-Log "boost (CLI output compression):"
    if ($DryRun) {
        Write-Log "  would install/wire boost for: $Tools (accepts JFrog's Online Preview Agreement)"
        return
    }

    if (-not (Get-Command boost -ErrorAction SilentlyContinue)) {
        Write-Log "  installing boost (boost.jfrog.com, preview software)..."
        try {
            Invoke-RestMethod https://boost.jfrog.com/install.ps1 | Invoke-Expression
        } catch {
            Write-Warn "boost install failed -- skipping; re-run with -WithBoost once resolved"
            return
        }
    }
    if (-not (Get-Command boost -ErrorAction SilentlyContinue)) {
        Write-Warn "boost installed but not on PATH yet -- open a new shell, then run: boost init --accept-terms"
        return
    }

    foreach ($tool in $Tools -split ",") {
        $t = $tool.Trim()
        if ($t -in @("claude", "cursor", "copilot")) {
            & boost init "--$t" --accept-terms *> $null
            if ($LASTEXITCODE -eq 0) {
                Write-Log "  wired: $t (takes effect on its next session/reload)"
            } else {
                Write-Warn "  boost init --$t failed -- see 'boost init --$t -DryRun' for why"
            }
        }
    }
}

if (-not (Test-Path $Dist)) {
    Write-Error "dist/ not found under $AgentkitHome -- is this a full clone of the agentkit repo?"
    exit 1
}

if ($Uninstall) { Uninstall-All; exit 0 }
if ($Version) { Show-Version; exit 0 }
if ($Upgrade) { Invoke-Upgrade; exit 0 }

if (-not $Tools) { $Tools = "claude,copilot,cursor,antigravity" }
Invoke-Install
