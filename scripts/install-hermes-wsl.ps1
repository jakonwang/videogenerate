$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "[hermes-wsl] $Message"
}

function Test-FeatureEnabled {
  param([string]$FeatureName)
  $feature = Get-WindowsOptionalFeature -Online -FeatureName $FeatureName
  return $feature.State -eq 'Enabled'
}

function Ensure-Feature {
  param([string]$FeatureName)
  if (Test-FeatureEnabled -FeatureName $FeatureName) {
    Write-Step "$FeatureName 已启用"
    return $false
  }

  Write-Step "启用 $FeatureName"
  Enable-WindowsOptionalFeature -Online -FeatureName $FeatureName -All -NoRestart | Out-Null
  return $true
}

function Test-WslDistro {
  param([string]$Distro)
  $listOutput = wsl.exe -l -q 2>$null
  if (-not $listOutput) {
    return $false
  }
  $items = $listOutput -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  return $items -contains $Distro
}

function Ensure-Command {
  param([string]$Command, [string]$Message)
  if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
    throw $Message
  }
}

Ensure-Command -Command "wsl.exe" -Message "当前系统找不到 wsl.exe"

$restartNeeded = $false
$restartNeeded = (Ensure-Feature -FeatureName 'Microsoft-Windows-Subsystem-Linux') -or $restartNeeded
$restartNeeded = (Ensure-Feature -FeatureName 'VirtualMachinePlatform') -or $restartNeeded

if ($restartNeeded) {
  Write-Step 'WSL 组件已启用，但系统需要先重启。请重启 Windows 后再次运行此脚本。'
  exit 3010
}

Write-Step '设置默认 WSL 版本为 2'
wsl.exe --set-default-version 2 | Out-Host

$distro = 'Ubuntu'
if (-not (Test-WslDistro -Distro $distro)) {
  Write-Step "安装发行版 $distro"
  wsl.exe --install -d $distro | Out-Host
  Write-Step '如果这是第一次安装发行版，请先完成 Ubuntu 首次初始化，然后再次运行此脚本。'
  exit 0
}

$workspaceLinuxPath = '/mnt/d/phpstudy_pro/WWW/videogenerate'
$installScript = @'
set -e
if ! command -v python3 >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3 python3-pip python3-venv curl
fi
if ! command -v curl >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y curl
fi
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"
uv tool install hermes-agent || uv tool upgrade hermes-agent
hermes --help >/dev/null 2>&1
'@

Write-Step '在 WSL Ubuntu 内安装 uv 与 hermes-agent'
wsl.exe -d $distro -- bash -lc $installScript

Write-Step 'Hermes 安装完成'
Write-Step "下一步：复制 automation/hermes-agent/config.example.json 为 config.local.json，并确认 workspaceLinuxPath=$workspaceLinuxPath"
Write-Step '然后执行 npm run hermes:doctor'
