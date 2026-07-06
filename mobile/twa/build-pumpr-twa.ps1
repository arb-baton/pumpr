$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$twaDir = Join-Path $PSScriptRoot "pumpr-twa"
$sdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"

$env:JAVA_HOME = "C:\PROGRA~1\ECLIPS~1\JDK-17~1.10-"
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$env:Path = "$env:JAVA_HOME\bin;$sdkRoot\cmdline-tools\latest\bin;$sdkRoot\platform-tools;$env:Path"

if (-not $env:BUBBLEWRAP_KEYSTORE_PASSWORD -or -not $env:BUBBLEWRAP_KEY_PASSWORD) {
  throw "Set BUBBLEWRAP_KEYSTORE_PASSWORD and BUBBLEWRAP_KEY_PASSWORD before building."
}

Push-Location $twaDir
try {
  bubblewrap doctor
  bubblewrap build --skipPwaValidation
} finally {
  Pop-Location
}
