# -*- coding: utf-8 -*-
param(
    [Parameter(Mandatory = $true)][string]$ManifestPath
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Write-InstallStatus {
    param(
        [string]$State,
        [string]$Message,
        [string]$Version = "",
        [string]$Commit = ""
    )
    $statusRoot = Join-Path $env:LOCALAPPDATA "VideoGenerate"
    New-Item -ItemType Directory -Force -Path $statusRoot | Out-Null
    $payload = [ordered]@{
        state = $State
        message = $Message
        version = $Version
        commit = $Commit
        updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    $json = $payload | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $statusRoot "hermes-install-status.json"), $json, [Text.UTF8Encoding]::new($false))
}

function Assert-ManagedPath {
    param([string]$Path, [string]$Root)
    $resolvedPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    if (-not $resolvedPath.StartsWith("$resolvedRoot\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify a path outside the Hermes runtime root: $resolvedPath"
    }
}

$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$runtimeRoot = Join-Path $env:LOCALAPPDATA "hermes"
$currentDir = Join-Path $runtimeRoot "hermes-agent"
$stagingDir = Join-Path $runtimeRoot "hermes-agent.videogenerate-staging"
$previousDir = Join-Path $runtimeRoot "hermes-agent.videogenerate-previous"
$markerName = ".videogenerate-runtime.json"
$statusVersion = [string]$manifest.version
$statusCommit = [string]$manifest.commit
$statusRoot = Join-Path $env:LOCALAPPDATA "VideoGenerate"
$lockPath = Join-Path $statusRoot "hermes-install.lock"
$lockStream = $null
$failed = $false
$tempRoot = $null
$alreadyCompatible = $false

try {
    New-Item -ItemType Directory -Force -Path $statusRoot | Out-Null
    try {
        $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    } catch {
        if ((Test-Path -LiteralPath $lockPath) -and ((Get-Date) - (Get-Item -LiteralPath $lockPath).LastWriteTime).TotalHours -gt 4) {
            Remove-Item -LiteralPath $lockPath -Force
            $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        } else {
            throw "Another Hermes installation operation is already running."
        }
    }

    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    Assert-ManagedPath -Path $currentDir -Root $runtimeRoot
    Assert-ManagedPath -Path $stagingDir -Root $runtimeRoot
    Assert-ManagedPath -Path $previousDir -Root $runtimeRoot

    $currentMarker = Join-Path $currentDir $markerName
    if ((Test-Path -LiteralPath $currentMarker) -and (Test-Path -LiteralPath (Join-Path $currentDir "venv\Scripts\hermes.exe"))) {
        $installed = Get-Content -LiteralPath $currentMarker -Raw -Encoding UTF8 | ConvertFrom-Json
        if ([string]$installed.commit -eq $statusCommit) {
            Write-InstallStatus -State "ready" -Message "Hermes is already at the compatible version." -Version $statusVersion -Commit $statusCommit
            $alreadyCompatible = $true
        }
    }

    if (-not $alreadyCompatible) {
    Write-InstallStatus -State "installing" -Message "Downloading the verified Hermes installer." -Version $statusVersion -Commit $statusCommit
    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("videogenerate-hermes-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
    $installerPath = Join-Path $tempRoot "install.ps1"
    Invoke-WebRequest -Uri ([string]$manifest.installScriptUrl) -OutFile $installerPath -UseBasicParsing
    $actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
    if ($actualHash -ne ([string]$manifest.installScriptSha256).ToUpperInvariant()) {
        throw "Hermes installer checksum verification failed."
    }

    $powershellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $protocolOutput = (& $powershellPath `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $installerPath `
            -ProtocolVersion 2>&1 | Out-String).Trim()
        $protocolExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($protocolExitCode -ne 0) {
        throw "Hermes installer protocol check exited with code $protocolExitCode."
    }
    $protocolVersion = 0
    if (-not [int]::TryParse($protocolOutput, [ref]$protocolVersion) -or $protocolVersion -lt [int]$manifest.minimumInstallerProtocol) {
        throw "Hermes installer protocol is incompatible."
    }

    try {
        $ErrorActionPreference = "Continue"
        $installerManifestOutput = (& $powershellPath `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $installerPath `
            -Manifest 2>&1 | Out-String).Trim()
        $installerManifestExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($installerManifestExitCode -ne 0) {
        throw "Hermes installer manifest exited with code $installerManifestExitCode."
    }
    $installerManifest = $installerManifestOutput | ConvertFrom-Json
    $installerStages = @($installerManifest.stages)
    foreach ($requiredStage in @("uv", "python", "git", "repository", "venv", "dependencies")) {
        if ($requiredStage -notin @($installerStages | ForEach-Object { [string]$_.name })) {
            throw "Hermes installer manifest is missing the required stage: $requiredStage."
        }
    }

    $currentHermes = Join-Path $currentDir "venv\Scripts\hermes.exe"
    $profileDir = Join-Path $env:USERPROFILE ".hermes\profiles\videogenerate"
    if ((Test-Path -LiteralPath $currentHermes) -and (Test-Path -LiteralPath $profileDir)) {
        $backupDir = Join-Path $statusRoot "hermes-backups"
        New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
        $backupPath = Join-Path $backupDir ("pre-install-" + [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss") + ".zip")
        $previousHermesHome = $env:HERMES_HOME
        try {
            $env:HERMES_HOME = $profileDir
            & $currentHermes backup --output $backupPath
            if ($LASTEXITCODE -ne 0) {
                throw "Hermes profile backup exited with code $LASTEXITCODE."
            }
        } finally {
            $env:HERMES_HOME = $previousHermesHome
        }
    }

    if (Test-Path -LiteralPath $stagingDir) {
        Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }

    Write-InstallStatus -State "installing" -Message "Installing the compatible Hermes runtime." -Version $statusVersion -Commit $statusCommit
    foreach ($installerStage in $installerStages) {
        $stageName = [string]$installerStage.name
        if ([bool]$installerStage.needs_user_input -or $stageName -eq "path") {
            continue
        }
        Write-InstallStatus -State "installing" -Message "Installing Hermes stage: $stageName." -Version $statusVersion -Commit $statusCommit
        $stageGitConfigActive = $false
        $previousGitConfigGlobal = $null
        if ($stageName -eq "repository") {
            $previousGitConfigGlobal = $env:GIT_CONFIG_GLOBAL
            $userGitConfig = if ($previousGitConfigGlobal) {
                $previousGitConfigGlobal
            } else {
                Join-Path $env:USERPROFILE ".gitconfig"
            }
            $installerGitConfig = Join-Path $tempRoot "installer.gitconfig"
            $gitConfigSource = ""
            if ((Test-Path -LiteralPath $userGitConfig) -and ([IO.Path]::GetFullPath($userGitConfig) -ne [IO.Path]::GetFullPath($installerGitConfig))) {
                $normalizedGitConfig = [IO.Path]::GetFullPath($userGitConfig).Replace('\', '/')
                $gitConfigSource = "[include]`n`tpath = `"$normalizedGitConfig`"`n"
            }
            $gitConfigSource += "[core]`n`tautocrlf = false`n"
            [IO.File]::WriteAllText($installerGitConfig, $gitConfigSource, [Text.UTF8Encoding]::new($false))
            $env:GIT_CONFIG_GLOBAL = $installerGitConfig
            $stageGitConfigActive = $true
        }
        try {
            $ErrorActionPreference = "Continue"
            & $powershellPath `
                -NoProfile `
                -ExecutionPolicy Bypass `
                -File $installerPath `
                -Branch ([string]$manifest.branch) `
                -Commit $statusCommit `
                -HermesHome $runtimeRoot `
                -InstallDir $stagingDir `
                -SkipSetup `
                -NonInteractive `
                -Json `
                -Stage $stageName 2>&1 | ForEach-Object { Write-Output ([string]$_) }
            $installerStageExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousErrorActionPreference
            if ($stageGitConfigActive) {
                $env:GIT_CONFIG_GLOBAL = $previousGitConfigGlobal
            }
        }
        if ($installerStageExitCode -ne 0) {
            throw "Hermes installer stage '$stageName' exited with code $installerStageExitCode."
        }
    }

    foreach ($relativePath in $manifest.requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $stagingDir ([string]$relativePath)))) {
            throw "Hermes runtime validation failed: $relativePath is missing."
        }
    }

    $hermesExe = Join-Path $stagingDir "venv\Scripts\hermes.exe"
    $reportedVersion = (& $hermesExe --version 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0 -or $reportedVersion -notmatch [Regex]::Escape($statusVersion)) {
        throw "Hermes runtime version validation failed."
    }

    $markerJson = [ordered]@{
        schemaVersion = 1
        version = $statusVersion
        commit = $statusCommit
        installedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText((Join-Path $stagingDir $markerName), $markerJson, [Text.UTF8Encoding]::new($false))

    if (Test-Path -LiteralPath $previousDir) {
        Remove-Item -LiteralPath $previousDir -Recurse -Force
    }
    if (Test-Path -LiteralPath $currentDir) {
        Move-Item -LiteralPath $currentDir -Destination $previousDir
    }
    try {
        Move-Item -LiteralPath $stagingDir -Destination $currentDir
    } catch {
        if ((-not (Test-Path -LiteralPath $currentDir)) -and (Test-Path -LiteralPath $previousDir)) {
            Move-Item -LiteralPath $previousDir -Destination $currentDir
        }
        throw
    }

    Write-InstallStatus -State "ready" -Message "Hermes runtime installation completed." -Version $statusVersion -Commit $statusCommit
    }
} catch {
    Write-InstallStatus -State "error" -Message $_.Exception.Message -Version $statusVersion -Commit $statusCommit
    Write-Error $_.Exception.Message
    $failed = $true
} finally {
    if ($null -ne $tempRoot -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($null -ne $lockStream) {
        $lockStream.Dispose()
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
}

if ($failed) { exit 1 }
exit 0
