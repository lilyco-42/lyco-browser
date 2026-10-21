param([ValidateSet('Install','Remove')][string]$Action='Install')
$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Host font controls run only in disposable Windows Actions runners'
}
$manifestPath=Join-Path $PSScriptRoot 'fixtures/host-font-control.json'
$manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$fixtureRoot=Join-Path $env:RUNNER_TEMP 'lyco-host-font-control'
$fontDirectory=Join-Path $env:LOCALAPPDATA 'Microsoft/Windows/Fonts'
$installedFile=Join-Path $fontDirectory 'LYCOAuditControl20261021-Regular.ttf'
$registryPath='HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
$registryName='LYCO Audit Control 20261021 Regular (TrueType)'
$marker=Join-Path $fixtureRoot 'installed.sha256'
if (-not ('LycoHostFontControl' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class LycoHostFontControl {
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern int AddFontResourceEx(string file, uint flags, IntPtr reserved);
  [DllImport("gdi32.dll", CharSet=CharSet.Unicode)] public static extern bool RemoveFontResourceEx(string file, uint flags, IntPtr reserved);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageTimeout(IntPtr window, uint message, IntPtr wparam, IntPtr lparam, uint flags, uint timeout, out IntPtr result);
}
'@
}
function Broadcast-FontChange {
  $result=[IntPtr]::Zero
  [void][LycoHostFontControl]::SendMessageTimeout([IntPtr]0xffff,0x001d,[IntPtr]::Zero,[IntPtr]::Zero,2,1000,[ref]$result)
}
if ($Action -eq 'Remove') {
  if (-not (Test-Path -LiteralPath $marker)) {return}
  $registration=Get-ItemPropertyValue -LiteralPath $registryPath -Name $registryName -ErrorAction SilentlyContinue
  if ($registration -and $registration -ne $installedFile) {throw 'Refuse to remove an unrecognized font registration'}
  # Only remove the exact fixture owned by this job; never enumerate fonts.
  if (Test-Path -LiteralPath $installedFile) {
    $expected=(Get-Content -LiteralPath $marker -Raw).Trim()
    if ((Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash -ne $expected) {
      throw 'Refuse to remove an unrecognized font file'
    }
    [void][LycoHostFontControl]::RemoveFontResourceEx($installedFile,0,[IntPtr]::Zero)
    Remove-ItemProperty -LiteralPath $registryPath -Name $registryName -ErrorAction SilentlyContinue
    Broadcast-FontChange
    try {Remove-Item -LiteralPath $installedFile} catch {Write-Warning 'Fixture file remains locked until this disposable runner exits'}
  }
  return
}
if (Test-Path -LiteralPath $installedFile) {throw 'Refuse to replace an existing font'}
if (Test-Path -LiteralPath $registryPath) {
  $registration=Get-ItemPropertyValue -LiteralPath $registryPath -Name $registryName -ErrorAction SilentlyContinue
  if ($registration) {throw 'Refuse to replace an existing font registration'}
}
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
foreach ($item in @(@{path=$manifest.fontPath;hash=$manifest.fontSha256;name='source.ttf'},
                   @{path=$manifest.licensePath;hash=$manifest.licenseSha256;name='OFL.txt'})) {
  $destination=Join-Path $fixtureRoot $item.name
  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/$($manifest.repository)/$($manifest.commit)/$($item.path)" -OutFile $destination -TimeoutSec 30
  if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $item.hash) {throw 'Font fixture source digest mismatch'}
}
python -m venv (Join-Path $fixtureRoot 'venv')
if ($LASTEXITCODE -ne 0) {throw 'Font fixture environment failed'}
$fixturePython=Join-Path $fixtureRoot 'venv/Scripts/python.exe'
& $fixturePython -m pip install fonttools==4.60.1
if ($LASTEXITCODE -ne 0) {throw 'Font fixture dependency failed'}
$derived=Join-Path $fixtureRoot 'LYCOAuditControl20261021-Regular.ttf'
& $fixturePython (Join-Path $PSScriptRoot 'rename-host-font-control.py') $manifestPath (Join-Path $fixtureRoot 'source.ttf') $derived
if ($LASTEXITCODE -ne 0) {throw 'Font fixture renaming failed'}
New-Item -ItemType Directory -Path $fontDirectory -Force | Out-Null
Copy-Item -LiteralPath $derived -Destination $installedFile
(Get-FileHash -LiteralPath $installedFile -Algorithm SHA256).Hash | Set-Content -LiteralPath $marker
if (-not (Test-Path -LiteralPath $registryPath)) {New-Item -Path $registryPath | Out-Null}
New-ItemProperty -LiteralPath $registryPath -Name $registryName -Value $installedFile -PropertyType String -Force | Out-Null
if ([LycoHostFontControl]::AddFontResourceEx($installedFile,0,[IntPtr]::Zero) -le 0) {throw 'Font fixture registration failed'}
Broadcast-FontChange
"LYCO_FONT_CONTROL_FAMILY=$($manifest.family)" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
