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
.PARAMETER DryRun
  Print what would happen without touching the filesystem.
.EXAMPLE
  .\install.ps1 -Tools claude,cursor
.EXAMPLE
  .\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [string]$Tools = "claude,copilot,cursor,antigravity",
    [switch]$Copy,
    [switch]$Uninstall,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$AgentkitHome = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dist = Join-Path $AgentkitHome "dist"
$ManifestDir = Join-Path $env:LOCALAPPDATA "agentkit"
$Manifest = Join-Path $ManifestDir "manifest.tsv"

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

if (-not (Test-Path $Dist)) {
    Write-Error "dist/ not found under $AgentkitHome -- is this a full clone of the agentkit repo?"
    exit 1
}

if ($Uninstall) { Uninstall-All; exit 0 }

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
Write-Log "done. re-run any time -- already-linked files are skipped, edits outside agentkit are backed up, never overwritten."
