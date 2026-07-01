param()

$ErrorActionPreference = 'Stop'

function Fail([string]$msg){
  Write-Error $msg
  exit 1
}

function Load-EnvFile([string]$path){
  if(!(Test-Path $path)){ return $false }

  Get-Content -Path $path -Encoding UTF8 | ForEach-Object {
    $line = $_.ToString().Trim()
    if([string]::IsNullOrWhiteSpace($line)){ return }
    if($line.StartsWith('#')){ return }

    $eq = $line.IndexOf('=')
    if($eq -lt 1){ return }

    $key = $line.Substring(0,$eq).Trim()
    $val = $line.Substring($eq+1).Trim()

    if($val.Length -ge 2){
      $first = $val.Substring(0,1)
      $last  = $val.Substring($val.Length-1,1)
      if(($first -eq '"' -and $last -eq '"') -or ($first -eq '''' -and $last -eq '''')){
        $val = $val.Substring(1,$val.Length-2)
      }
    }

    if(![string]::IsNullOrWhiteSpace($key)){
      Set-Item -Path Env:$key -Value $val -ErrorAction SilentlyContinue | Out-Null
    }
  }

  return $true
}

function Parse-PostgresUrl([string]$url){
  $pattern = '^postgres(ql)?://(?<user>[^:/@]+):(?<pass>[^@]+)@(?<host>[^:/]+)(:(?<port>\d+))?/(?<db>[^?]+).*$'
  $m = [regex]::Match($url, $pattern)
  if(-not $m.Success){
    return $null
  }

  return [pscustomobject]@{
    user = $m.Groups["user"].Value
    pass = $m.Groups["pass"].Value
    host = $m.Groups["host"].Value
    port = if($m.Groups["port"].Success){ [int]$m.Groups["port"].Value } else { 5432 }
    db   = $m.Groups["db"].Value
  }
}

function Mask-Secret([string]$s){
  if([string]::IsNullOrWhiteSpace($s)){ return "" }
  if($s.Length -le 4){ return "****" }
  $head = $s.Substring(0,2)
  $tail = $s.Substring($s.Length-2,2)
  return "$head****$tail"
}

$repoRoot = 'c:/Users/KAKARLA RAJESH/Downloads/PLANBUDDY_FULL_APP'
$envPath = Join-Path $repoRoot 'BACKEND/planbuddy_v9/.env'

Write-Output "Loading DATABASE_URL from: $envPath"
$loaded = Load-EnvFile $envPath
if(-not $loaded){
  Fail "Env file not found: $envPath"
}

if([string]::IsNullOrWhiteSpace($env:DATABASE_URL)){
  Fail "DATABASE_URL is empty or missing after loading $envPath"
}

$u = Parse-PostgresUrl $env:DATABASE_URL
if($null -eq $u){
  Fail "Unable to parse DATABASE_URL format (expected postgresql://user:pass@host:port/dbname)."
}

Write-Output ("Database host: {0}" -f $u.host)
Write-Output ("Database port: {0}" -f $u.port)
Write-Output ("Database name: {0}" -f $u.db)
Write-Output ("Database password: {0}" -f (Mask-Secret $u.pass))

$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if(!$psqlCmd){
  Fail 'psql not found in PATH'
}

function Run-PSQL([string]$sql, [string]$label){
  try{
    # psql should never throw when we capture output; but on Windows it may still surface as a non-terminating/native error.
    $procOut = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $sql 2>&1
    $code = $LASTEXITCODE
    Write-Output $procOut
    Write-Output ("[{0}] psql exit code: {1}" -f $label, $code)
    return [pscustomobject]@{ output = $procOut; code = $code }
  }catch{
    # When DNS fails, native error can be raised; still keep going by returning code 1 with captured message.
    $msg = $_.Exception.Message
    $code = 1
    Write-Output $msg
    Write-Output ("[{0}] psql exit code: {1}" -f $label, $code)
    return [pscustomobject]@{ output = $msg; code = $code }
  }
}


# STEP 3: Run SELECT version();
Write-Output 'Running: SELECT version();'
$res = Run-PSQL 'SELECT version();' 'version'

if($res.code -ne 0){
  $full = ($res.output | Out-String).Trim()

  # STEP 4: If DNS fails, show hostname extracted from DATABASE_URL.
  if($full -match '(could not translate host name|Name or service not known|nodename nor servname provided|Temporary failure in name resolution|Unknown host)'){
    Write-Output ("DNS failed for host: {0}" -f $u.host)
  }

  # STEP 5: If authentication fails, show exact PostgreSQL error.
  if($full -match '(password authentication failed|no pg_hba\\.conf entry|authentication failed|role .* does not exist)'){
    Fail ("AUTH/PG failed. Full PostgreSQL output:\n" + $full)
  }

  # Otherwise: stop immediately and print complete PostgreSQL stderr/output.
  Fail ("FAIL: psql SELECT version(); exit code {0}. Full PostgreSQL output:\n{1}" -f $res.code, $full)
}

# STEP 6: If connection succeeds, run all certification SQL, generate evidence files, and report PASS/FAIL.
Write-Output 'Running certification evidence via scripts/security/02-db-constraints.ps1'

$certScript = Join-Path $repoRoot 'scripts/security/02-db-constraints.ps1'
if(!(Test-Path $certScript)){
  Fail "Certification script not found: $certScript"
}

$certOut = & powershell -ExecutionPolicy Bypass -File $certScript 2>&1
$certCode = $LASTEXITCODE

Write-Output $certOut
Write-Output ("[certification] exit code: {0}" -f $certCode)

if($certCode -ne 0){
  Fail ("FAIL: certification run failed with exit code {0}. Full output:\n{1}" -f $certCode, ($certOut | Out-String).Trim())
}

Write-Output 'PASS'
exit 0

