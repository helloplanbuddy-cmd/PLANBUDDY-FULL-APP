param()

$ErrorActionPreference = "Stop"

function Fail([string]$msg){
  Write-Error $msg
  exit 1
}

function Mask-Secret([string]$s){
  if([string]::IsNullOrWhiteSpace($s)){ return "" }
  if($s.Length -le 4){ return "****" }
  $head = $s.Substring(0,2)
  $tail = $s.Substring($s.Length-2,2)
  return "$head****$tail"
}

function Parse-PostgresUrl([string]$url){
  # Expected: postgresql://user:pass@host:port/dbname
  $pattern = '^postgres(ql)?://(?<user>[^:/@]+):(?<pass>[^@]+)@(?<host>[^:/]+)(:(?<port>\d+))?/(?<db>[^?]+).*$'
  $m = [regex]::Match($url, $pattern)
  if(-not $m.Success){
    Fail "Unable to parse DATABASE_URL format: $url"
  }
  return [pscustomobject]@{
    user = $m.Groups["user"].Value
    pass = $m.Groups["pass"].Value
    host = $m.Groups["host"].Value
    port = if($m.Groups["port"].Success){ [int]$m.Groups["port"].Value } else { 5432 }
    db   = $m.Groups["db"].Value
  }
}

function Load-EnvFile([string]$path){
  if(!(Test-Path $path)){ return $false }
  Get-Content -Path $path -Encoding UTF8 | ForEach-Object {
    $line = $_.ToString().Trim()
    if([string]::IsNullOrWhiteSpace($line)){ return }
    if($line.StartsWith("#")){ return }

    $eq = $line.IndexOf("=")
    if($eq -lt 1){ return }

    $key = $line.Substring(0,$eq).Trim()
    $val = $line.Substring($eq+1).Trim()

    # Trim outer quotes only
    if($val.Length -ge 2){
      $first = $val.Substring(0,1)
      $last  = $val.Substring($val.Length-1,1)
      if(($first -eq '"' -and $last -eq '"') -or ($first -eq '''' -and $last -eq '''')){
        $val = $val.Substring(1,$val.Length-2)
      }
    }

    # Never overwrite if already set in process env
    if(![string]::IsNullOrWhiteSpace($key) -and -not ${env:$key}){
      $envVarName = $key
      Set-Item -Path Env:$envVarName -Value $val -ErrorAction SilentlyContinue | Out-Null
    }
  }
  return $true
}

# -------------------- STEP 1: Load env from BACKEND\planbuddy_v9\.env only --------------------
$envPath = Join-Path -Path "BACKEND\planbuddy_v9" -ChildPath ".env"
Write-Output "Loading env file: $envPath"
$loaded = Load-EnvFile $envPath
if(-not $loaded){
  Fail "Env file not found: $envPath"
}

if([string]::IsNullOrWhiteSpace($env:DATABASE_URL)){
  Fail "DATABASE_URL is empty after loading $envPath"
}

# -------------------- STEP 2: Verify parsed fields (mask password) --------------------
$u = Parse-PostgresUrl $env:DATABASE_URL

$passwordMasked = Mask-Secret $u.pass

Write-Output "Loaded DATABASE_URL: YES"
Write-Output ("Database host: {0}" -f $u.host)
Write-Output ("Database port: {0}" -f $u.port)
Write-Output ("Database name: {0}" -f $u.db)
Write-Output ("Database password: {0}" -f $passwordMasked)

# -------------------- STEP 3: Verify DNS --------------------
Write-Output "Resolving DNS for host..."
try{
  $dns = Resolve-DnsName -Name $u.host -ErrorAction Stop
  $dns | Select-Object -First 3 | ForEach-Object { Write-Output ($_ | Out-String).Trim() }
}catch{
  Fail ("DNS resolution failed for host '{0}'. Error: {1}" -f $u.host, $_.Exception.Message)
}

# -------------------- STEP 4: Verify TCP connectivity --------------------
Write-Output "Checking TCP connectivity..."
$tcn = Test-NetConnection -ComputerName $u.host -Port $u.port -WarningAction SilentlyContinue
if(-not $tcn.TcpTestSucceeded){
  Fail ("TCP connectivity failed for {0}:{1}" -f $u.host, $u.port)
}
Write-Output ("TCP connectivity succeeded (RemoteAddress: {0})" -f $tcn.RemoteAddress)

# -------------------- STEP 5: Run SQL via psql --------------------
$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if(-not $psqlCmd){
  Fail "psql not found in PATH"
}

Write-Output "Running psql: SELECT version();"
$envVarUrl = $env:DATABASE_URL

# Capture stdout+stderr exactly
$procOut = & psql -A -t -v ON_ERROR_STOP=1 -d $envVarUrl -c "SELECT version();" 2>&1
$code = $LASTEXITCODE

Write-Output "psql exit code: $code"
Write-Output "psql stdout+stderr:"
Write-Output ($procOut | Out-String).Trim()

if($code -ne 0){
  Fail ("psql failed for SELECT version(); exit code {0}. Full output shown above." -f $code)
}

# -------------------- Done --------------------
exit 0
