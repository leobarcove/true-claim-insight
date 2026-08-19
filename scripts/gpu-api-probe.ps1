<#
.SYNOPSIS
    Captures the exact API contract of the GPU host's two inference services.

.DESCRIPTION
    READ-ONLY. Sends requests and reads responses. Installs nothing, changes no
    configuration, and pulls no models.

    ASCII ONLY. Windows PowerShell 5.1 reads a .ps1 as ANSI unless the file
    carries a UTF-8 BOM, and PowerShell accepts smart quotes as real string
    delimiters -- so one em dash in a comment can close a string early and break
    the parse forty lines later. Keep every character below U+0080.

    WHY THIS EXISTS
    OllamaGpuLlmProvider calls /v3/ocr, /v3/llm/generate and /v3/llm/vision.
    That API is not Ollama's -- it belonged to the finura project's backend on
    the same desktop, which is halted. Ollama serves /api/chat; Surya serves its
    own routes on :8002. Until the provider is rewritten against what actually
    runs, no application code can use this host.

    Nobody on the repository side can write that rewrite, because nobody there
    can see these services. GPU_HOST_SETUP.md section 3.3 asked for Surya's
    routes to be recorded and they never were. This script records them, plus
    the two things that turn out to matter more than the routes: what each model
    actually returns under a JSON schema, and how long a call takes.

    NO Invoke-RestMethod -Form ANYWHERE. It is PowerShell 6+ and this host runs
    5.1, so it fails instantly with a parameter-binding error that lands in the
    report looking like a service response. Use curl.exe -F for multipart.

    OUTPUT
    Writes a redacted report to the Desktop. Read it before sharing -- this
    repository is public and the report must name no tailnet address, no
    hostname and no claimant data. Test inputs below are synthetic.

.EXAMPLE
    powershell -NoExit -ExecutionPolicy Bypass -File .\gpu-api-probe.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference    = 'SilentlyContinue'

$OLLAMA = 'http://127.0.0.1:11434'
$SURYA  = 'http://127.0.0.1:8002'
$report = "$env:USERPROFILE\Desktop\gpu-api-contract.md"

# 127.0.0.1, never localhost: on Windows `localhost` resolves to ::1 first while
# Docker publishes on IPv4 only, so a running service answers nothing and reads
# as absent. That mistake cost a whole survey run once already.

function Say($text)  { $text | Out-File $report -Append -Encoding ascii }
function Head($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan; Say "`n## $text" }
function Fence($text, $lang = 'json') {
    Say ('```' + $lang); Say $text; Say '```'
}

"# GPU host API contract" | Out-File $report -Encoding ascii
Say "Captured by scripts/gpu-api-probe.ps1. Read before sharing: this file goes"
Say "into a public repository and must name no address, hostname or real data."

# ---------------------------------------------------------------------------
# 1. Ollama: version and models, with digests.
#
# Digests matter more than tags. A tag is a moving pointer -- `latest` today is
# not `latest` next month -- and BNM model-risk expects a past decision to be
# explainable later. The digest is what pins it.
# ---------------------------------------------------------------------------
Head "Ollama version"
$ver = try { Invoke-RestMethod "$OLLAMA/api/version" -TimeoutSec 5 } catch { $null }
if ($ver) { Write-Host ($ver | ConvertTo-Json); Fence ($ver | ConvertTo-Json) }
else { Write-Host "no answer on $OLLAMA" -ForegroundColor Yellow; Say "NO ANSWER" }

Head "Models present, with digests"
$tags = try { Invoke-RestMethod "$OLLAMA/api/tags" -TimeoutSec 10 } catch { $null }
if ($tags) {
    $rows = $tags.models | Select-Object name, size, @{n='digest';e={ $_.digest }},
        @{n='family';e={ $_.details.family }}, @{n='quant';e={ $_.details.quantization_level }}
    $rows | Format-Table -AutoSize | Out-Host
    Fence ($rows | ConvertTo-Json -Depth 4)
}

# ---------------------------------------------------------------------------
# 2. The calling-convention probe.
#
# This is the important one. A model asked with an instruction plus a JSON
# schema can return something schema-valid and wrong -- NuExtract3 was found
# echoing the schema's own type name into a required field. A naive check
# passes. The provider cannot be written until it is known, per model, which
# convention gives a correct answer.
#
# Same question, same schema, every model. The right answer is 6.
# ---------------------------------------------------------------------------
Head "Instruction + format schema, per model"
Say "Same prompt and schema sent to every model. Correct answer: delay_hours 6,"
Say "flight_number MH168. Watch for a model returning the *type name* instead."

$schema = @{
    type       = 'object'
    properties = @{
        flight_number = @{ type = 'string' }
        delay_hours   = @{ type = 'number' }
    }
    required   = @('flight_number', 'delay_hours')
}

$names = if ($tags) { $tags.models.name } else { @() }
foreach ($model in $names) {
    $body = @{
        model    = $model
        messages = @(@{ role = 'user'; content =
            'Flight MH168 was scheduled 09:00 and departed 15:00. Return the flight number and the delay in hours.' })
        stream   = $false
        options  = @{ temperature = 0 }
        format   = $schema
    } | ConvertTo-Json -Depth 8

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r  = try { Invoke-RestMethod "$OLLAMA/api/chat" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 180 } catch { $null }
    $sw.Stop()

    $answer = if ($r) { "$($r.message.content)".Trim() } else { 'NO ANSWER / ERROR' }
    Write-Host ("{0,-32} {1,6}s  {2}" -f $model, [int]$sw.Elapsed.TotalSeconds, $answer)
    Say ("- **{0}** -- {1}s -- ``{2}``" -f $model, [int]$sw.Elapsed.TotalSeconds, $answer)
}

# ---------------------------------------------------------------------------
# 3. Vision, with a generated image so the expected answer is known.
# ---------------------------------------------------------------------------
Head "Vision: same schema, image input"
Add-Type -AssemblyName System.Drawing
$bmp  = New-Object System.Drawing.Bitmap 640,200
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas', 32)
$g.DrawString("MH168 DELAY 6H", $font, [System.Drawing.Brushes]::Black, 20, 70)
$g.Dispose()
$testImage = "$env:TEMP\tci-api-probe.png"
$bmp.Save($testImage, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$img64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($testImage))
Say "Synthetic image reading: MH168 DELAY 6H"

foreach ($model in $names) {
    $body = @{
        model    = $model
        messages = @(@{ role = 'user'
                        content = 'Read the flight number and delay from this image.'
                        images  = @($img64) })
        stream   = $false
        options  = @{ temperature = 0 }
        format   = $schema
    } | ConvertTo-Json -Depth 8

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $r  = try { Invoke-RestMethod "$OLLAMA/api/chat" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 240 } catch { $null }
    $sw.Stop()

    $answer = if ($r) { "$($r.message.content)".Trim() } else { 'NO ANSWER / not a vision model' }
    Write-Host ("{0,-32} {1,6}s  {2}" -f $model, [int]$sw.Elapsed.TotalSeconds, $answer)
    Say ("- **{0}** -- {1}s -- ``{2}``" -f $model, [int]$sw.Elapsed.TotalSeconds, $answer)
}

# ---------------------------------------------------------------------------
# 4. Surya. The genuine unknown -- section 3.3 asked for these routes and they
#    were never recorded, which is why nobody can write the client.
# ---------------------------------------------------------------------------
Head "Surya: the OpenAPI contract"
$spec = try { Invoke-RestMethod "$SURYA/openapi.json" -TimeoutSec 10 } catch { $null }
if ($spec) {
    $paths = $spec.paths.PSObject.Properties | ForEach-Object {
        $methods = $_.Value.PSObject.Properties.Name -join ','
        "{0}  [{1}]" -f $_.Name, $methods.ToUpper()
    }
    $paths | Out-Host
    Fence ($paths -join "`n") 'text'

    Say "`n### Request schema per route"
    Say "Full spec below. This is what the client must send; do not guess it."
    Fence ($spec | ConvertTo-Json -Depth 12)
} else {
    Write-Host "No /openapi.json. Try /docs in a browser and paste the routes." -ForegroundColor Yellow
    Say "NO /openapi.json -- open $SURYA/docs and record the routes by hand."
}

Head "Surya: a real round trip"
Say "Whatever the spec says, this is what it actually accepts and returns."

# curl.exe, not Invoke-RestMethod -Form.
#
# The first version of this script used -Form, which is PowerShell 6+ only.
# This host runs Windows PowerShell 5.1, so every call failed instantly with
# "A parameter cannot be found that matches parameter name 'Form'" -- and the
# error was captured into the report where a Surya response should have been.
# It read like a service result. Surya, the one genuine unknown this script
# exists to capture, was not captured at all.
#
# Hence also the 0s guard below: a multipart OCR round trip cannot complete in
# no time, so a 0s result is the script failing, not the service being quick.
# curl.exe ships with Windows 10 1803 and later.
#
# /predict is not probed -- it does not exist (docs/gpu-api-contract.md 5).
# /analyze does, and is recorded to show why the client must NOT call it: it
# takes the identical request and answers with finura's bank-statement fields.
foreach ($route in '/ocr', '/analyze') {
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $out = (& curl.exe -s -S -X POST "$SURYA$route" -F "file=@$testImage" 2>&1) -join "`n"
    $sw.Stop()
    $secs = $sw.Elapsed.TotalSeconds

    if ($secs -lt 0.05 -or [string]::IsNullOrWhiteSpace($out)) {
        $out = "SCRIPT FAILURE, not a service result -- returned in ${secs}s with: $out"
        Write-Host ("{0,-12} FAILED (see report)" -f $route) -ForegroundColor Red
    } else {
        Write-Host ("{0,-12} {1,4}s" -f $route, [int]$secs)
    }

    if ($out.Length -gt 1500) { $out = $out.Substring(0, 1500) + "`n... truncated" }
    Say "`n**POST $route** -- $([int]$secs)s"
    Fence $out
}

# ---------------------------------------------------------------------------
# 5. Concurrency, because the pipeline reads several documents per claim.
# ---------------------------------------------------------------------------
Head "Two calls at once"
Say "A claim carries three or four documents. If the card serialises them, the"
Say "per-claim latency is the sum, which is what the COGS ceiling cares about."
$sw = [Diagnostics.Stopwatch]::StartNew()
$jobs = 1..2 | ForEach-Object {
    Start-Job -ScriptBlock {
        param($u, $m)
        $b = @{ model = $m; messages = @(@{role='user';content='Say OK'}); stream = $false } | ConvertTo-Json -Depth 5
        try { Invoke-RestMethod "$u/api/chat" -Method Post -ContentType 'application/json' -Body $b -TimeoutSec 180 } catch { $null }
    } -ArgumentList $OLLAMA, ($names | Select-Object -First 1)
}
$jobs | Wait-Job -Timeout 200 | Out-Null
$jobs | Remove-Job -Force
$sw.Stop()
Write-Host ("two concurrent calls: {0}s total" -f [int]$sw.Elapsed.TotalSeconds)
Say ("Two concurrent calls completed in {0}s total." -f [int]$sw.Elapsed.TotalSeconds)

Head "Done"
Write-Host "Report: $report" -ForegroundColor Green
Write-Host "Read it before sharing. Nothing was installed or changed." -ForegroundColor Green
Say "`n---`nNothing was installed or changed by this script."
