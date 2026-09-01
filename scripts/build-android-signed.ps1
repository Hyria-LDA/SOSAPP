[CmdletBinding()]
param(
    [string]$Keystore = "C:\Users\junio\Documents\sos-marceneiros-release.jks",
    [string]$Alias = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $projectRoot "android"
$gradle = Join-Path $androidDir "gradlew.bat"
$output = Join-Path $androidDir "app\build\outputs\bundle\release\app-release.aab"
$mappingOutput = Join-Path $androidDir "app\build\outputs\mapping\release\mapping.txt"
$destinationDir = Join-Path $projectRoot "dist"

if (-not (Test-Path -LiteralPath $Keystore)) {
    throw "Chave de assinatura nao encontrada: $Keystore"
}

if (-not $env:JAVA_HOME) {
    $androidStudioJava = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path -LiteralPath $androidStudioJava) {
        $env:JAVA_HOME = $androidStudioJava
    }
}

function Convert-SecureStringToText([Security.SecureString]$Value) {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

$storePasswordSecure = Read-Host "Senha da chave de assinatura" -AsSecureString
$storePassword = Convert-SecureStringToText $storePasswordSecure
if (-not $storePassword) {
    throw "A senha da chave e obrigatoria."
}

if (-not $Alias) {
    $keytool = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME "bin\keytool.exe" } else { "keytool" }
    $keytoolOutput = & $keytool -list -v -keystore $Keystore -storepass $storePassword 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel abrir a chave. Confira a senha informada."
    }

    $aliasMatch = [regex]::Match($keytoolOutput, "(?im)^(?:Alias name|Nome do alias):\s*(.+)$")
    if ($aliasMatch.Success) {
        $Alias = $aliasMatch.Groups[1].Value.Trim()
    }
    else {
        $Alias = Read-Host "Alias da chave"
    }
}

if (-not $Alias) {
    throw "O alias da chave e obrigatorio."
}

$keyPasswordSecure = Read-Host "Senha do alias (Enter se for igual a senha da chave)" -AsSecureString
$keyPassword = Convert-SecureStringToText $keyPasswordSecure
if (-not $keyPassword) {
    $keyPassword = $storePassword
}

try {
    $env:SOS_ANDROID_KEYSTORE = $Keystore
    $env:SOS_ANDROID_STORE_PASSWORD = $storePassword
    $env:SOS_ANDROID_KEY_ALIAS = $Alias
    $env:SOS_ANDROID_KEY_PASSWORD = $keyPassword

    Push-Location $projectRoot
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw "A compilacao do site falhou." }

        & npx.cmd cap sync android
        if ($LASTEXITCODE -ne 0) { throw "A sincronizacao do Android falhou." }
    }
    finally {
        Pop-Location
    }

    Push-Location $androidDir
    try {
        & $gradle bundleRelease --no-daemon
        if ($LASTEXITCODE -ne 0) { throw "A geracao do Android App Bundle falhou." }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $output)) {
        throw "O AAB nao foi encontrado depois da compilacao."
    }

    $buildGradle = Get-Content -LiteralPath (Join-Path $androidDir "app\build.gradle") -Raw
    $versionCode = [regex]::Match($buildGradle, 'versionCode\s+(\d+)').Groups[1].Value
    $versionName = [regex]::Match($buildGradle, 'versionName\s+"([^"]+)"').Groups[1].Value
    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
    $destination = Join-Path $destinationDir "sos-marceneiros-android-$versionName-$versionCode.aab"
    Copy-Item -LiteralPath $output -Destination $destination -Force

    $mappingDestination = $null
    if (Test-Path -LiteralPath $mappingOutput) {
        $mappingDestination = Join-Path $destinationDir "mapping-android-$versionName-$versionCode.txt"
        Copy-Item -LiteralPath $mappingOutput -Destination $mappingDestination -Force
    }

    Write-Host ""
    Write-Host "AAB assinado criado com sucesso:" -ForegroundColor Green
    Write-Host $destination -ForegroundColor Cyan
    if ($mappingDestination) {
        Write-Host "Mapeamento R8 para relatorios de falha:" -ForegroundColor Green
        Write-Host $mappingDestination -ForegroundColor Cyan
    }
}
finally {
    Remove-Item Env:SOS_ANDROID_KEYSTORE -ErrorAction SilentlyContinue
    Remove-Item Env:SOS_ANDROID_STORE_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:SOS_ANDROID_KEY_ALIAS -ErrorAction SilentlyContinue
    Remove-Item Env:SOS_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
    $storePassword = $null
    $keyPassword = $null
}
