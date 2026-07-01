param(
)

$ErrorActionPreference = 'Stop'

# -------------------- Paths --------------------
$repoRoot = 'c:/Users/KAKARLA RAJESH/Downloads/PLANBUDDY_FULL_APP'
$evidenceDir = Join-Path $repoRoot 'evidence/payment'
if (!(Test-Path $evidenceDir)) { New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null }

$logPath = Join-Path $evidenceDir 'payment-step2-db-constraints.log.txt'

$outConstraints = Join-Path $evidenceDir 'payment-db-constraints.md'
$outIndexes     = Join-Path $evidenceDir 'payment-db-indexes.md'
$outTriggers    = Join-Path $evidenceDir 'payment-db-triggers.md'

$start = Get-Date

# -------------------- Helpers --------------------
function Log([string]$msg){
  $line = "[STEP2] $msg"
  $line | Tee-Object -FilePath $logPath -Append
}

function Ensure-EmptyFile([string]$p){
  if(Test-Path $p){ Remove-Item $p -Force }
  '' | Out-File -FilePath $p -Encoding UTF8
}

function Write-Md([string]$path,[string]$value){
  Add-Content -Path $path -Value $value
}

function Trim-OuterQuotes([string]$s){
  if($null -eq $s){ return '' }
  $t = $s.Trim()
  if($t.Length -ge 2){
    $first = $t.Substring(0,1)
    $last  = $t.Substring($t.Length-1,1)
    if( ($first -eq '"' -and $last -eq '"') -or ($first -eq '''' -and $last -eq '''') ){
      return $t.Substring(1,$t.Length-2)
    }
  }
  return $t
}

# -------------------- Native .env loader (no Node/JS) --------------------
function Load-EnvFile([string]$path){
  if(!(Test-Path $path)){ return $false }

  Log "Loading env file: $path"
  # Parse line-by-line
  Get-Content -Path $path -Encoding UTF8 | ForEach-Object {
    $line = $_.ToString().Trim()
    if([string]::IsNullOrWhiteSpace($line)) { return }
    if($line.StartsWith('#')) { return }

    $eq = $line.IndexOf('=')
    if($eq -lt 1) { return }

    $key = $line.Substring(0,$eq).Trim()
    $val = $line.Substring($eq+1).Trim()

    $val = Trim-OuterQuotes $val

    if(![string]::IsNullOrEmpty($key)){
      [Environment]::SetEnvironmentVariable($key,$val,'Process') | Out-Null
    }
  }

  return $true
}

function Load-DatabaseUrl(){
  # Search order strictly required by prompt:
  #   PROJECT_ROOT/.env
  #   BACKEND/.env
  #   BACKEND/planbuddy_v9/.env
  $candidates = @(
    (Join-Path $repoRoot '.env'),
    (Join-Path $repoRoot 'BACKEND/.env'),
    (Join-Path $repoRoot 'BACKEND/planbuddy_v9/.env')
  )

  foreach($c in $candidates){
    $loaded = Load-EnvFile $c
    if($loaded){
      # mapping POSTGRES_URL -> DATABASE_URL if only POSTGRES_URL exists
      if([string]::IsNullOrWhiteSpace($env:DATABASE_URL) -and ![string]::IsNullOrWhiteSpace($env:POSTGRES_URL)){
        Log 'Mapping POSTGRES_URL -> DATABASE_URL'
        $env:DATABASE_URL = $env:POSTGRES_URL
      }

      if(![string]::IsNullOrWhiteSpace($env:DATABASE_URL)){
        return $true
      }
    }
  }

  return $false
}

# -------------------- START: init evidence files --------------------
Ensure-EmptyFile $outConstraints
Ensure-EmptyFile $outIndexes
Ensure-EmptyFile $outTriggers

Write-Md $outConstraints '# payment-db-constraints.md'
Write-Md $outConstraints "Generated: $(Get-Date -Format o)"
Write-Md $outConstraints ''
Write-Md $outIndexes '# payment-db-indexes.md'
Write-Md $outIndexes "Generated: $(Get-Date -Format o)"
Write-Md $outIndexes ''
Write-Md $outTriggers '# payment-db-triggers.md'
Write-Md $outTriggers "Generated: $(Get-Date -Format o)"
Write-Md $outTriggers ''

# -------------------- Validate env --------------------
$okEnv = Load-DatabaseUrl
if(-not $okEnv -or [string]::IsNullOrWhiteSpace($env:DATABASE_URL)){
  Write-Md $outConstraints ''
  Write-Md $outConstraints 'FAIL: DATABASE_URL is missing from supported env files.'
  Log 'FAIL: DATABASE_URL is missing.'
  Write-Host 'FAIL: DATABASE_URL is missing'
  exit 1
}

# Verify psql exists
$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if(!$psqlCmd){
  Write-Md $outConstraints ''
  Write-Md $outConstraints 'FAIL: psql not found in PATH.'
  Log 'FAIL: psql not found.'
  Write-Host 'FAIL: psql not found'
  exit 2
}

# -------------------- psql execution with evidence --------------------
function Exec-PSQL([string]$sql,[string]$section,[string]$outFile){
  Log "Executing ($section): $sql"

  # Capture raw output and exit code
  $out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $sql 2>&1
  $code = $LASTEXITCODE

  Write-Md $outFile "### $section"
  Write-Md $outFile 'SQL:'
  Write-Md $outFile '```sql'
  Write-Md $outFile $sql
  Write-Md $outFile '```'
  Write-Md $outFile 'Raw output:'
  Write-Md $outFile '```'
  Write-Md $outFile (($out | Out-String).Trim())
  Write-Md $outFile '```'
  Write-Md $outFile "Timestamp: $(Get-Date -Format o)"
  Write-Md $outFile ''

  if($code -ne 0){
    throw "psql failed for section '$section' (exit code $code). Output: $($out | Out-String)"
  }

  return $out
}

# -------------------- Connectivity checks (required) --------------------
try{
  Exec-PSQL 'SELECT version();' 'SELECT version();' $outConstraints | Out-Null
  Exec-PSQL 'SELECT current_database();' 'SELECT current_database();' $outConstraints | Out-Null
  Exec-PSQL 'SELECT current_user();' 'SELECT current_user();' $outConstraints | Out-Null
}catch{
  Write-Md $outConstraints ''
  Write-Md $outConstraints ("FAIL: DB connectivity failed. " + $_.Exception.Message)
  Log 'FAIL: DB connectivity failed.'
  Write-Host 'FAIL: DB connectivity failed'
  exit 3
}

# -------------------- Evidence extraction (executed SQL + raw output) --------------------
$tablesForEvidence = @('payments','bookings','webhook_events','razorpay_order_mappings','refunds')

function Extract-ArtifactsForTable([string]$table){
  $ts = Get-Date -Format o
  Exec-PSQL (
    "SELECT conname, contype, pg_get_constraintdef(c.oid) AS definition
     FROM pg_constraint c
     JOIN pg_class r ON r.oid=c.conrelid
     WHERE r.relname='${table}'
     ORDER BY contype, conname;"
  ) "$table - constraints" $outConstraints | Out-Null

  Exec-PSQL (
    "SELECT indexname, pg_get_indexdef(i.oid) AS indexdef
     FROM pg_index i
     JOIN pg_class c ON c.oid=i.indrelid
     JOIN pg_class idx ON idx.oid=i.indexrelid
     WHERE c.relname='${table}'
     ORDER BY indexname;"
  ) "$table - indexes" $outIndexes | Out-Null

  Exec-PSQL (
    "SELECT tgname, pg_get_triggerdef(t.oid) AS triggerdef
     FROM pg_trigger t
     JOIN pg_class c ON c.oid=t.tgrelid
     WHERE c.relname='${table}' AND NOT tgisinternal
     ORDER BY tgname;"
  ) "$table - triggers" $outTriggers | Out-Null
}

try{
  foreach($t in $tablesForEvidence){
    Log "Extracting artifacts for $t"
    Extract-ArtifactsForTable $t
  }
}catch{
  Write-Host ("FAIL: evidence extraction failed: " + $_.Exception.Message)
  exit 4
}

# -------------------- Strict required checks --------------------
# If any required constraint/trigger is missing => FAIL with exact missing item.

$missing = New-Object System.Collections.Generic.List[string]

# Helper to detect existence of a substring in pg output
function Out-HasAny([object]$out,[string[]]$needles){
  $s = ($out | Out-String)
  foreach($n in $needles){
    if($s -and $s.Contains($n)){ return $true }
  }
  return $false
}

# A) payments.razorpay_order_id UNIQUE (or PK)
$qPaymentsOrderUnique = "
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class r ON r.oid=c.conrelid
WHERE r.relname='payments'
  AND c.contype IN ('p','u')
  AND pg_get_constraintdef(c.oid) ILIKE '%razorpay_order_id%'
ORDER BY conname;
"
$out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $qPaymentsOrderUnique 2>&1
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($out | Out-String).Trim())){
  $missing.Add('Missing: payments.razorpay_order_id UNIQUE constraint (or PRIMARY KEY)')
}

# B) webhook_events(provider, provider_event_id) UNIQUE (or PK)
$qWebhookUni = "
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class r ON r.oid=c.conrelid
WHERE r.relname='webhook_events'
  AND c.contype IN ('p','u')
  AND pg_get_constraintdef(c.oid) ILIKE '%provider%'
  AND pg_get_constraintdef(c.oid) ILIKE '%provider_event_id%'
ORDER BY conname;
"
$out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $qWebhookUni 2>&1
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($out | Out-String).Trim())){
  $missing.Add('Missing: UNIQUE(provider, provider_event_id) on webhook_events')
}

# C) FK payments.booking_id
$qFkPaymentsBooking = "
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class r ON r.oid=c.conrelid
WHERE r.relname='payments'
  AND c.contype='f'
  AND pg_get_constraintdef(c.oid) ILIKE '%booking_id%'
ORDER BY conname;
"
$out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $qFkPaymentsBooking 2>&1
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($out | Out-String).Trim())){
  $missing.Add('Missing: FK payments.booking_id')
}

# D) FK bookings.trip_id
$qFkBookingsTrip = "
SELECT conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class r ON r.oid=c.conrelid
WHERE r.relname='bookings'
  AND c.contype='f'
  AND pg_get_constraintdef(c.oid) ILIKE '%trip_id%'
ORDER BY conname;
"
$out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $qFkBookingsTrip 2>&1
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($out | Out-String).Trim())){
  $missing.Add('Missing: FK bookings.trip_id')
}

# E) Payment safety triggers (must exist on payments table)
# We interpret as: at least one NON-internal trigger on payments table.
$qPaymentTriggersExists = "
SELECT tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='payments'
  AND NOT tgisinternal;
"
$out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $qPaymentTriggersExists 2>&1
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($out | Out-String).Trim())){
  $missing.Add('Missing: Payment safety triggers on payments (no non-internal triggers found)')
}

# F) Refund triggers (must exist on refunds table)
$qRefundTriggersExists = "
SELECT tgname
FROM pg_trigger t
JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='refunds'
  AND NOT tgisinternal;
"
$out = & psql -A -t -v ON_ERROR_STOP=1 -d $env:DATABASE_URL -c $qRefundTriggersExists 2>&1
if($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($out | Out-String).Trim())){
  $missing.Add('Missing: Refund triggers on refunds (no non-internal triggers found)')
}

if($missing.Count -gt 0){
  # Fail with exact missing items
  $msg = 'FAIL: ' + ($missing -join '; ')
  Write-Host $msg
  Log $msg
  Write-Md $outConstraints ''
  Write-Md $outConstraints $msg
  exit 10
}

# -------------------- Final PASS --------------------
$elapsed = (Get-Date) - $start
Log "PASS. Execution time: $elapsed"
Write-Host 'PASS'
exit 0
