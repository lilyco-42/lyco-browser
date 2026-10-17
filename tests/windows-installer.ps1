$ErrorActionPreference='Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'Installer acceptance runs only in GitHub Actions' }
$installRoot=Join-Path $env:RUNNER_TEMP ('LYCO Installed Browser '+$env:GITHUB_RUN_ID+'-'+$env:GITHUB_RUN_ATTEMPT)
$resolvedRoot=[IO.Path]::GetFullPath($installRoot)
$tempRoot=[IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')+'\'
if (-not $resolvedRoot.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $installRoot)) { throw 'Expected a new installation inside runner temp' }
$installer=(Resolve-Path 'upstream/Browserapp/dist/LYCO-Browser-Windows-x64-MVP.exe').Path
$registryPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\LYCO Browser'
$upstreamRegistryPath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OpenBrowser'
if(Test-Path $registryPath){throw 'Fresh runner must not have an existing LYCO installation'}
$upstreamBefore=if(Test-Path $upstreamRegistryPath){Get-ItemProperty $upstreamRegistryPath | ConvertTo-Json -Compress}else{'absent'}
$process=Start-Process -FilePath $installer -ArgumentList @('/S',"/D=$installRoot") -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) { throw "Installer exited $($process.ExitCode)" }
$appRoot=Join-Path $installRoot 'runtime/resources/app'
$binary=Join-Path $installRoot 'runtime/OpenBrowser.exe'
$uninstaller=Join-Path $installRoot 'Uninstall.exe'
foreach($required in @($binary,$uninstaller,(Join-Path $appRoot 'lyco/network.js'))) { if(-not(Test-Path -LiteralPath $required)){throw "Installed file missing: $required"} }
$entry=Get-ItemProperty $registryPath
if($entry.DisplayName -ne 'LYCO Browser' -or $entry.Publisher -ne 'LYCO Browser' -or $entry.InstallLocation -ne $installRoot){throw 'LYCO uninstall registration mismatch'}
$shell=New-Object -ComObject WScript.Shell
$shortcuts=@((Join-Path ([Environment]::GetFolderPath('Programs')) 'LYCO Browser/LYCO Browser.lnk'),(Join-Path ([Environment]::GetFolderPath('Desktop')) 'LYCO Browser.lnk'))
foreach($shortcut in $shortcuts) {
 if(-not(Test-Path -LiteralPath $shortcut)){throw "Shortcut missing: $shortcut"}
 if($shell.CreateShortcut($shortcut).TargetPath -ne $binary){throw 'Shortcut target mismatch'}
}
node lyco/tests/installer-icon.mjs upstream/Browserapp/assets/logo.ico $installer $binary $uninstaller
if($LASTEXITCODE -ne 0){throw 'Installed icon payload verification failed'}
node lyco/tests/native-workspaces.mjs $binary $appRoot lyco-native-installed
if($LASTEXITCODE -ne 0){throw 'Installed native application acceptance failed'}
$native=Get-Content -Raw -LiteralPath 'lyco-native-installed/native-workspaces.json' | ConvertFrom-Json
if(-not $native.userDataPath){throw 'Actual application userData path missing'}
$marker=Join-Path $native.userDataPath ('lyco-keep-user-data-'+$env:GITHUB_RUN_ID+'.txt')
[IO.File]::WriteAllText($marker,'CI user data must survive uninstall')
$process=Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
if($process.ExitCode -ne 0){throw "Uninstaller exited $($process.ExitCode)"}
$deadline=[DateTime]::UtcNow.AddSeconds(60)
while(((Test-Path -LiteralPath $installRoot) -or (Test-Path $registryPath)) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 250}
if((Test-Path -LiteralPath $installRoot) -or (Test-Path $registryPath)){throw 'Installation or registration remains after uninstall'}
foreach($shortcut in $shortcuts){if(Test-Path -LiteralPath $shortcut){throw 'Uninstall left a broken shortcut'}}
if([IO.File]::ReadAllText($marker) -ne 'CI user data must survive uninstall'){throw 'Uninstall removed user files'}
$upstreamAfter=if(Test-Path $upstreamRegistryPath){Get-ItemProperty $upstreamRegistryPath | ConvertTo-Json -Compress}else{'absent'}
if($upstreamBefore -ne $upstreamAfter){throw 'Original OpenBrowser registration changed'}
Remove-Item -LiteralPath $marker
@{commit=$env:GITHUB_SHA;installedRoot=$installRoot;checks=@('silent-install-in-spaced-path','lyco-shortcuts-and-uninstall-identity','original-icon-payloads','installed-native-workflows','uninstall-preserves-user-data','upstream-registration-untouched');realPayments=0} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath lyco-native-installed/installer-report.json
