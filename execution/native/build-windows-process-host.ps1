param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
# Called only with trusted source and an output in the operator-owned cache.
Add-Type -Path $SourcePath -OutputAssembly $OutputPath -OutputType ConsoleApplication
