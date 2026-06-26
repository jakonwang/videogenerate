# Requires -Version 5.1
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host $Message
}

function Remove-RegistryEntries {
  $registryPatterns = @(
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )

  foreach ($pattern in $registryPatterns) {
    $items = Get-ItemProperty -Path $pattern -ErrorAction SilentlyContinue
    foreach ($item in $items) {
      $isMatch = $false
      if ($item.DisplayName -like "VideoGenerate*") {
        $isMatch = $true
      }
      elseif ($item.UninstallString -like "*VideoGenerate*") {
        $isMatch = $true
      }
      elseif ($item.InstallLocation -like "*VideoGenerate*") {
        $isMatch = $true
      }

      if (-not $isMatch) {
        continue
      }

      $itemPath = $item.PSPath -replace "^Microsoft\.PowerShell\.Core\\Registry::", ""
      Write-Info ("Removing uninstall registry key: " + $itemPath)
      Remove-Item -LiteralPath ("Registry::" + $itemPath) -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
}

function Remove-InstallDirectories {
  $paths = @(
    "D:\videroGenerate\VideoGenerate",
    "D:\VideoGenerate",
    (Join-Path $env:LOCALAPPDATA "Programs\VideoGenerate"),
    (Join-Path $env:LOCALAPPDATA "VideoGenerate"),
    (Join-Path $env:APPDATA "VideoGenerate")
  )

  foreach ($path in $paths) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      continue
    }
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }
    Write-Info ("Removing directory: " + $path)
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Remove-Shortcuts {
  $shortcutPaths = @(
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\VideoGenerate.lnk"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\VideoGenerate"),
    (Join-Path $env:PUBLIC "Desktop\VideoGenerate.lnk"),
    (Join-Path ([Environment]::GetFolderPath("Desktop")) "VideoGenerate.lnk")
  )

  foreach ($path in $shortcutPaths) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      continue
    }
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }
    Write-Info ("Removing shortcut or folder: " + $path)
    Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Info "Cleaning VideoGenerate installation leftovers..."
Remove-RegistryEntries
Remove-InstallDirectories
Remove-Shortcuts
Write-Info ""
Write-Info "Cleanup finished."
Write-Info "Recommended next steps:"
Write-Info "1. Reboot the computer"
Write-Info "2. Right click VideoGenerate-5.0.26-Setup.exe"
Write-Info "3. Choose Run as administrator"
