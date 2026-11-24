# StreakBooks Budgets — local release verification.
# No GitHub Actions, migrations, deployment, remote pushes, database writes,
# package installation or dependency changes are performed.
# Run from PowerShell: .\scripts\verify-budgets-local.ps1
# Optional: .\scripts\verify-budgets-local.ps1 -FullUnitTests

[CmdletBinding()]
param(
  [switch]$FullUnitTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$results = [System.Collections.Generic.List[object]]::new()

function Invoke-LocalCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  Write-Host ""
  Write-Host "=== $Label ===" -ForegroundColor Cyan
  & npm.cmd @Arguments
  $code = $LASTEXITCODE
  if ($null -eq $code) { $code = 1 }
  $results.Add([pscustomobject]@{
    Check = $Label
    Status = if ($code -eq 0) { "PASS" } else { "FAIL" }
    ExitCode = $code
  })
  if ($code -ne 0) {
    Write-Warning "$Label returned exit code $code. Continuing to collect other results."
  }
}

Push-Location $root
try {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm.cmd is unavailable. Install Node.js and use PowerShell."
  }

  Write-Host "Budgets local verification; no GitHub CI, pushes or deployments."
  Write-Host ("Repository: " + $root)
  & git status --short
  $head = (& git rev-parse HEAD)
  if ($LASTEXITCODE -ne 0) { throw "Could not determine repository commit." }
  Write-Host ("Commit: " + $head)
  Write-Host "Working tree changes are not modified or discarded."

  Invoke-LocalCheck -Label "TypeScript" -Arguments @("run","typecheck")
  Invoke-LocalCheck -Label "Budgets unit + migration contracts" -Arguments @(
    "test", "--", "src/lib/budgets"
  )
  if ($FullUnitTests) {
    Invoke-LocalCheck -Label "Full unit suite" -Arguments @("test")
  }
  Invoke-LocalCheck -Label "ESLint" -Arguments @("run","lint")
  Invoke-LocalCheck -Label "Production build" -Arguments @("run","build")

  Write-Host ""
  Write-Host "=== Verified local results ===" -ForegroundColor Cyan
  $results | Format-Table Check,Status,ExitCode -AutoSize
  $passed = @($results | Where-Object { $_.Status -eq "PASS" }).Count
  Write-Host ("Passed: {0}/{1}" -f $passed,$results.Count)
  Write-Host "Not covered: staging migrations, RLS two-tenant, browser QA, rollback and deployment."
  if ($passed -ne $results.Count) {
    Write-Error "Budgets local checks failed. Release is NOT ready."
  }
}
finally {
  Pop-Location
}
