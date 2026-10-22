$ErrorActionPreference='Stop'
if($env:GITHUB_ACTIONS -ne 'true'){throw 'Native desktop acceptance runs only in GitHub Actions'}
$binary=(Resolve-Path 'upstream/Browserapp/lyco/desktop/lyco-desktop-probe.exe').Path
$themePath='HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$accentPath='HKCU:\Software\Microsoft\Windows\DWM'
$ownedValues=@(@{path=$themePath;name='AppsUseLightTheme'},@{path=$accentPath;name='AccentColor'})
$before=@()
foreach($item in $ownedValues){
 $keyExists=Test-Path -LiteralPath $item.path
 $value=if($keyExists){Get-ItemProperty -LiteralPath $item.path -Name $item.name -ErrorAction SilentlyContinue}
 $present=$null -ne $value
 $before+=@{path=$item.path;name=$item.name;keyExists=$keyExists;present=$present;value=if($present){$value.($item.name)}else{$null}}
}
$observations=@()
$rejectsArguments=$false
$failure=$null
$folder='lyco-native-preflight'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
try {
 foreach($item in $ownedValues){if(-not(Test-Path -LiteralPath $item.path)){New-Item -Path $item.path | Out-Null}}
 foreach($mode in @(0,1)){
  New-ItemProperty -LiteralPath $themePath -Name AppsUseLightTheme -Value $mode -PropertyType DWord -Force | Out-Null
  New-ItemProperty -LiteralPath $accentPath -Name AccentColor -Value 0x7F332211 -PropertyType DWord -Force | Out-Null
  $registryBefore=Get-ItemPropertyValue -LiteralPath $accentPath -Name AccentColor
  $result=& $binary
  if($LASTEXITCODE -ne 0){throw 'UDA appearance probe failed'}
  $value=$result | ConvertFrom-Json
  $expected=if($mode -eq 0){'dark'}else{'light'}
  $registryAfter=Get-ItemPropertyValue -LiteralPath $accentPath -Name AccentColor
  $observation=@{expected=$expected;actual=$value;accentRegistryBefore=$registryBefore;accentRegistryAfter=$registryAfter}
  $observations+=$observation
  # Retain actual observations before any assertion, including a failed probe.
  $observation | ConvertTo-Json -Depth 6 | Write-Host
  if($registryBefore -ne 0x7F332211 -or $registryAfter -ne $registryBefore){throw 'Windows changed the accent control during observation'}
  if($value.theme -ne $expected -or $value.revision -ne 'a74bd2cf372efad2407d6be4b57739e682cf1d9a'){throw 'Actual UDA theme differs from OS preference'}
  if(($value.accent -join ',') -ne '17,34,51,127'){throw 'Actual UDA accent channels differ from OS preference'}
  if(-not($value.capabilities.detectTheme -and $value.capabilities.readAccent)){throw 'Required desktop capabilities absent'}
 }
 & $binary forbidden-command | Out-Null
 if($LASTEXITCODE -ne 2){throw 'Desktop helper must reject all command arguments'}
 $rejectsArguments=$true
} catch {
 $failure=$_.Exception.Message
 throw
} finally {
 foreach($item in $before){
  if($item.present){New-ItemProperty -LiteralPath $item.path -Name $item.name -Value $item.value -PropertyType DWord -Force | Out-Null}
  else{Remove-ItemProperty -LiteralPath $item.path -Name $item.name -ErrorAction SilentlyContinue}
  # Remove a newly created key only if still empty: never delete other settings.
  if(-not $item.keyExists){
   $key=Get-Item -LiteralPath $item.path -ErrorAction SilentlyContinue
   if($key -and $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0){Remove-Item -LiteralPath $item.path}
  }
 }
 @{commit=$env:GITHUB_SHA;observations=$observations;rejectsArguments=$rejectsArguments;restoredOSSettings=$true;failure=$failure;binarySha256=$env:LYCO_UDA_BINARY_SHA256} |
  ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$folder/uda-probe-contract.json"
}
exit 0
