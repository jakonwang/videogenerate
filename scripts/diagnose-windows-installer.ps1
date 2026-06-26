# Requires -Version 5.1
[CmdletBinding()]
param(
  [string]$InstallerPath = "",
  [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Title)
  Add-Content -LiteralPath $script:ReportPath -Value ""
  Add-Content -LiteralPath $script:ReportPath -Value ("==== " + $Title + " ====")
}

function Write-Line {
  param([string]$Text = "")
  Add-Content -LiteralPath $script:ReportPath -Value $Text
}

function Try-WriteBlock {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Section $Title
  try {
    $result = & $Action
    if ($null -eq $result) {
      Write-Line "(no output)"
      return
    }
    if ($result -is [System.Array]) {
      foreach ($item in $result) {
        Write-Line ([string]$item)
      }
      return
    }
    Write-Line ([string]$result)
  }
  catch {
    Write-Line ("ERROR: " + $_.Exception.Message)
  }
}

function Format-ObjectList {
  param($InputObject)
  if ($null -eq $InputObject) {
    return "(no data)"
  }
  return ($InputObject | Format-List | Out-String).TrimEnd()
}

function Resolve-InstallerPath {
  param([string]$RawPath)

  if (-not [string]::IsNullOrWhiteSpace($RawPath)) {
    return (Resolve-Path -LiteralPath $RawPath).Path
  }

  $scriptDir = $PSScriptRoot
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = (Get-Location).Path
  }
  $candidates = @(
    (Join-Path $scriptDir "..\release\VideoGenerate-5.0.26-Setup.exe"),
    (Join-Path $scriptDir "..\release\VideoGenerate-Setup.exe"),
    (Join-Path $scriptDir "VideoGenerate-5.0.26-Setup.exe"),
    (Join-Path $scriptDir "VideoGenerate-Setup.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return ""
}

function Resolve-OutputDirectory {
  param([string]$RawPath)

  if (-not [string]::IsNullOrWhiteSpace($RawPath)) {
    return $RawPath
  }

  $baseCandidates = @(
    $PSScriptRoot,
    [Environment]::GetFolderPath("Desktop"),
    $env:USERPROFILE,
    $env:TEMP,
    (Get-Location).Path
  )

  foreach ($candidate in $baseCandidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }
    if (Test-Path -LiteralPath $candidate) {
      return (Join-Path $candidate ("videogenerate-installer-diagnose-" + $script:Timestamp))
    }
  }

  throw "Unable to resolve a writable output directory."
}

$script:Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$OutputDir = Resolve-OutputDirectory -RawPath $OutputDir

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$ReportPath = Join-Path $OutputDir "diagnostic-report.txt"
$JsonPath = Join-Path $OutputDir "diagnostic-summary.json"
$EventLogPath = Join-Path $OutputDir "application-events.txt"
$InstallerPath = Resolve-InstallerPath -RawPath $InstallerPath

Set-Content -LiteralPath $ReportPath -Value "VideoGenerate installer diagnostic report" -Encoding UTF8
Write-Line ("GeneratedAt: " + (Get-Date).ToString("s"))
Write-Line ("ComputerName: " + $env:COMPUTERNAME)
Write-Line ("UserName: " + $env:USERNAME)
Write-Line ("OutputDir: " + $OutputDir)
Write-Line ("InstallerPath: " + $(if ($InstallerPath) { $InstallerPath } else { "(not provided or not found)" }))

$osInfo = Get-CimInstance Win32_OperatingSystem
$computerInfo = Get-CimInstance Win32_ComputerSystem
$processorInfo = Get-CimInstance Win32_Processor | Select-Object -First 1
$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$systemDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$pendingRebootKeys = @(
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending",
  "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired"
)
$pendingReboot = $false
foreach ($key in $pendingRebootKeys) {
  if (Test-Path -LiteralPath $key) {
    $pendingReboot = $true
  }
}

Try-WriteBlock "System Summary" {
  Format-ObjectList ([pscustomobject]@{
    Caption = $osInfo.Caption
    Version = $osInfo.Version
    BuildNumber = $osInfo.BuildNumber
    OSArchitecture = $osInfo.OSArchitecture
    InstallDate = $osInfo.InstallDate
    LastBootUpTime = $osInfo.LastBootUpTime
    Manufacturer = $computerInfo.Manufacturer
    Model = $computerInfo.Model
    TotalPhysicalMemoryGB = [math]::Round($computerInfo.TotalPhysicalMemory / 1GB, 2)
    CpuName = $processorInfo.Name
  })
}

Try-WriteBlock "Compatibility Checks" {
  $compatNotes = New-Object System.Collections.Generic.List[string]
  if ($osInfo.OSArchitecture -notmatch "64") {
    $compatNotes.Add("FAIL: This installer only supports Windows x64. Current OS architecture is " + $osInfo.OSArchitecture)
  }
  else {
    $compatNotes.Add("PASS: Windows architecture is x64.")
  }
  if ([int]$osInfo.BuildNumber -lt 19041) {
    $compatNotes.Add("WARN: Windows build is older than 19041. Packaging target was validated on newer Windows 10/11 builds.")
  }
  else {
    $compatNotes.Add("PASS: Windows build is modern enough for Electron 34 runtime.")
  }
  if ($pendingReboot) {
    $compatNotes.Add("WARN: System reports pending reboot flags.")
  }
  else {
    $compatNotes.Add("PASS: No pending reboot flags detected.")
  }
  if ($systemDrive.FreeSpace -lt 5GB) {
    $compatNotes.Add("WARN: Free space on C: is below 5 GB.")
  }
  else {
    $compatNotes.Add("PASS: Free space on C: is above 5 GB.")
  }
  $compatNotes
}

Try-WriteBlock "User Context" {
  Format-ObjectList ([pscustomobject]@{
    IsAdministrator = $isAdmin
    UserSid = $currentIdentity.User.Value
    UserProfile = $env:USERPROFILE
    Temp = $env:TEMP
    LocalAppData = $env:LOCALAPPDATA
  })
}

Try-WriteBlock "Disk Summary" {
  Get-CimInstance Win32_LogicalDisk |
    Select-Object DeviceID, VolumeName, FileSystem,
      @{ Name = "SizeGB"; Expression = { [math]::Round($_.Size / 1GB, 2) } },
      @{ Name = "FreeGB"; Expression = { [math]::Round($_.FreeSpace / 1GB, 2) } } |
    Format-Table -AutoSize | Out-String
}

Try-WriteBlock "PowerShell Policy" {
  Get-ExecutionPolicy -List | Format-Table -AutoSize | Out-String
}

Try-WriteBlock "Defender Summary" {
  $status = Get-MpComputerStatus
  Format-ObjectList ([pscustomobject]@{
    AntivirusEnabled = $status.AntivirusEnabled
    RealTimeProtectionEnabled = $status.RealTimeProtectionEnabled
    IoavProtectionEnabled = $status.IoavProtectionEnabled
    BehaviorMonitorEnabled = $status.BehaviorMonitorEnabled
    SmartAppControlState = $status.SmartAppControlState
    AntispywareSignatureVersion = $status.AntispywareSignatureVersion
  })
}

Try-WriteBlock "Installer File" {
  if (-not $InstallerPath) {
    return "Installer not found. Re-run with -InstallerPath <full path to VideoGenerate-Setup.exe>."
  }
  $file = Get-Item -LiteralPath $InstallerPath
  $hash = Get-FileHash -LiteralPath $InstallerPath -Algorithm SHA256
  $signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
  Format-ObjectList ([pscustomobject]@{
    FullName = $file.FullName
    Length = $file.Length
    LastWriteTime = $file.LastWriteTime
    SHA256 = $hash.Hash
    SignatureStatus = $signature.Status
    SignerCertificate = $(if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { "" })
    TimeStamperCertificate = $(if ($signature.TimeStamperCertificate) { $signature.TimeStamperCertificate.Subject } else { "" })
  })
}

Try-WriteBlock "Installer Zone Identifier" {
  if (-not $InstallerPath) {
    return "Installer not found."
  }
  $zoneData = Get-Content -LiteralPath ($InstallerPath + ":Zone.Identifier") -ErrorAction SilentlyContinue
  if ($zoneData) {
    return ($zoneData -join [Environment]::NewLine)
  }
  return "No Zone.Identifier stream found."
}

Try-WriteBlock "Recent MSI Or Installer Events" {
  $events = Get-WinEvent -FilterHashtable @{
    LogName = "Application"
    StartTime = (Get-Date).AddDays(-7)
  } -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProviderName -in @("MsiInstaller", "Application Error", "Windows Error Reporting") -or
      $_.Message -match "VideoGenerate|NSIS|installer|setup"
    } |
    Select-Object -First 80 TimeCreated, ProviderName, Id, LevelDisplayName, Message

  if (-not $events) {
    "No matching application events in the last 7 days."
  }
  else {
    $events | ForEach-Object {
      "[{0}] {1} Id={2} Level={3}`r`n{4}`r`n" -f $_.TimeCreated, $_.ProviderName, $_.Id, $_.LevelDisplayName, $_.Message
    } | Set-Content -LiteralPath $EventLogPath -Encoding UTF8
    "Saved to " + $EventLogPath
  }
}

Try-WriteBlock "Installed VideoGenerate Versions" {
  $uninstallKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
  )
  $apps = foreach ($key in $uninstallKeys) {
    Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
  }
  $apps |
    Where-Object { $_.DisplayName -like "VideoGenerate*" } |
    Select-Object DisplayName, DisplayVersion, Publisher, InstallDate, InstallLocation, UninstallString |
    Format-List | Out-String
}

$summary = [pscustomobject]@{
  generatedAt = (Get-Date).ToString("s")
  computerName = $env:COMPUTERNAME
  userName = $env:USERNAME
  osCaption = $osInfo.Caption
  osVersion = $osInfo.Version
  buildNumber = $osInfo.BuildNumber
  osArchitecture = $osInfo.OSArchitecture
  isAdministrator = $isAdmin
  pendingReboot = $pendingReboot
  systemDriveFreeGB = [math]::Round($systemDrive.FreeSpace / 1GB, 2)
  installerPath = $InstallerPath
  installerFound = [bool]$InstallerPath
}

$summary | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $JsonPath -Encoding UTF8
Write-Section "Output Files"
Write-Line ("Report: " + $ReportPath)
Write-Line ("SummaryJson: " + $JsonPath)
Write-Line ("EventLog: " + $EventLogPath)

Write-Host ""
Write-Host "Diagnostic completed."
Write-Host ("Report folder: " + $OutputDir)
Write-Host ("Main report: " + $ReportPath)
