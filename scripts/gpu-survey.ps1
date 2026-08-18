<#
.SYNOPSIS
    Surveys a Windows GPU workstation being considered as the local-LLM host.

.DESCRIPTION
    READ-ONLY. Installs nothing, starts nothing, stops nothing, and changes no
    setting. Every command below either reads state or times out.

    Written because the inference host is a machine nobody working on the repo
    can see. `OllamaGpuLlmProvider` talks to a service at GPU_SERVICE_URL over
    /v3/ocr, /v3/llm/generate and /v3/llm/vision -- but nothing records what that
    service runs on, how much VRAM it has, or whether the box stays awake. The
    hardcoded fallback in that provider is a dead Cloudflare quick tunnel, which
    is what happens when the answer lives in one person's memory.

    Run it, paste the SUMMARY block back into the repo discussion.

.NOTES
    ASCII ONLY. Windows PowerShell 5.1 reads a .ps1 as ANSI unless the file
    carries a UTF-8 BOM, and PowerShell accepts smart quotes as real string
    delimiters -- so a single em dash in a comment can close a string early and
    break the parse forty lines later. Keep every character in this file
    below U+0080.
    VRAM is the number that decides the model stack:
      <12 GB : one model resident; the pipeline swaps between layers
       12 GB : a 7B vision model at 4-bit, comfortably
       16 GB : extraction + OCR resident together
       24 GB+: a 14B reasoning model alongside a vision model, no swapping

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\gpu-survey.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference    = 'SilentlyContinue'

# Collected as we go, printed as one pasteable block at the end.
$summary = [ordered]@{}

function Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Try-Version($exe) {
    if (Get-Command $exe -ErrorAction SilentlyContinue) {
        $v = (& $exe --version 2>&1 | Select-Object -First 1)
        return "$v"
    }
    return $null
}

Write-Host "TCI GPU desktop survey -- read-only, changes nothing" -ForegroundColor Green

# ---------------------------------------------------------------------------
# GPU. The one that decides everything else.
# ---------------------------------------------------------------------------
Section "GPU"
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    $q = 'name,memory.total,memory.used,driver_version'
    $line = (nvidia-smi --query-gpu=$q --format=csv,noheader 2>&1 | Select-Object -First 1)
    Write-Host $line
    $summary['gpu'] = "$line".Trim()

    # CUDA version sits in the header table, not in --query-gpu.
    $cuda = (nvidia-smi 2>&1 | Select-String 'CUDA Version')
    if ($cuda) {
        $cudaVer = ([regex]::Match("$cuda", 'CUDA Version:\s*([\d.]+)')).Groups[1].Value
        Write-Host "CUDA driver supports: $cudaVer"
        $summary['cuda'] = $cudaVer
    }
} else {
    Write-Host "nvidia-smi not found -- no NVIDIA driver on PATH." -ForegroundColor Yellow
    Write-Host "If this box has an AMD or Intel GPU, say so: it changes the whole stack."
    $summary['gpu'] = 'NONE / not NVIDIA'
}

# ---------------------------------------------------------------------------
# Machine
# ---------------------------------------------------------------------------
Section "Machine"
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
$ramGb = [math]::Round($cs.TotalPhysicalMemory / 1GB)
$freeGb = [math]::Round((Get-PSDrive C).Free / 1GB)

Write-Host "Host    : $($cs.Name)"
Write-Host "PSVer   : $($PSVersionTable.PSVersion)"
Write-Host "CPU     : $cpu"
Write-Host "RAM     : $ramGb GB"
Write-Host "OS      : $($os.Caption) $($os.Version)"
Write-Host "Free C: : $freeGb GB"

$summary['host']  = $cs.Name
$summary['psver'] = "$($PSVersionTable.PSVersion)"
$summary['ram']   = "$ramGb GB"
$summary['diskC'] = "$freeGb GB free"

# ---------------------------------------------------------------------------
# Runtimes. Ollama is listed because the provider class is named after it --
# its absence on a box that serves /v3 is itself a finding.
# ---------------------------------------------------------------------------
Section "Runtimes"
$runtimes = @{}
foreach ($exe in 'nvidia-smi','ollama','python','docker','git','tailscale','cloudflared','wsl') {
    $v = Try-Version $exe
    if ($v) {
        Write-Host ("{0,-12} {1}" -f $exe, $v)
        $runtimes[$exe] = $v
    } else {
        Write-Host ("{0,-12} not installed" -f $exe) -ForegroundColor DarkGray
    }
}
$summary['runtimes'] = ($runtimes.Keys | Sort-Object) -join ', '

if ($runtimes.ContainsKey('ollama')) {
    Section "Ollama models"
    ollama list 2>&1 | Out-Host
}

# ---------------------------------------------------------------------------
# Docker. If Ollama is absent but /v3 answers, the stack is almost certainly
# containerised -- which is good news for moving it to staging later.
# ---------------------------------------------------------------------------
if ($runtimes.ContainsKey('docker')) {
    Section "Docker containers"
    $ps = (docker ps -a --format "{{.Names}} | {{.Image}} | {{.Ports}} | {{.Status}}" 2>&1)
    if ($ps) { $ps | Out-Host } else { Write-Host "none" -ForegroundColor DarkGray }

    # Does any running container actually hold the GPU? A container without it
    # is running inference on CPU, which would explain slow extraction.
    Section "GPU passthrough into containers"
    $named = (docker ps --format "{{.Names}}" 2>&1)
    if ($named) {
        foreach ($n in $named) {
            $gpus = (docker inspect -f '{{ .HostConfig.DeviceRequests }}' $n 2>&1)
            $has = if ("$gpus" -match 'gpu') { 'GPU' } else { 'CPU only' }
            Write-Host ("{0,-28} {1}" -f $n, $has)
        }
    } else {
        Write-Host "no running containers" -ForegroundColor DarkGray
    }
}

# ---------------------------------------------------------------------------
# What is listening, and on which interface. 0.0.0.0 means the whole office
# LAN can reach it -- and the provider sends no API key of any kind.
# ---------------------------------------------------------------------------
Section "Listening ports"
$listen = Get-NetTCPConnection -State Listen |
    Where-Object { $_.LocalPort -lt 30000 } |
    Select-Object LocalAddress, LocalPort,
        @{ n = 'Process'; e = { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName } } |
    Sort-Object LocalPort -Unique
$listen | Format-Table -AutoSize | Out-Host

$watched = @(8000, 8080, 8888, 5000, 7860, 11434)
$exposed = $listen | Where-Object { ($_.LocalAddress -eq '0.0.0.0') -and ($watched -contains $_.LocalPort) }
if ($exposed) {
    Write-Host "NOTE: the ports above bound to 0.0.0.0 are reachable from the whole LAN." -ForegroundColor Yellow
    Write-Host "      The repo's client sends no API key, so anything on the network can use them."
    $summary['lanExposed'] = ($exposed | ForEach-Object { $_.LocalPort }) -join ','
}

# ---------------------------------------------------------------------------
# Find the inference service. Probes the shape the repo already expects.
# ---------------------------------------------------------------------------
Section "Probing for the inference service"
$found = @()
# 8002 was missing and is where a Surya OCR container actually landed. And the
# probe must use 127.0.0.1, not localhost: on Windows `localhost` resolves to
# ::1 first, while Docker publishes on IPv4 only -- so a running service answers
# nothing and reads as absent.
foreach ($port in 8000,8001,8002,8080,8888,5000,7860,3000,11434) {
    # Plain try/catch blocks rather than assigning from a try expression:
    # that form is accepted inconsistently across PowerShell versions, and
    # this script has to run on whatever the workstation happens to have.
    $root = $null
    try { $root = Invoke-WebRequest "http://127.0.0.1:$port/" -TimeoutSec 2 -UseBasicParsing } catch { }
    if (-not $root) { continue }

    Write-Host ("port {0,-6} HTTP {1}" -f $port, $root.StatusCode)

    # /v3/* is what OllamaGpuLlmProvider calls. A 405 or 422 here is a *good*
    # sign: the route exists and is refusing a GET, which is what a POST-only
    # endpoint should do.
    foreach ($path in '/v3/ocr', '/v3/llm/generate', '/docs', '/api/tags', '/health') {
        $r = $null
        try   { $r = Invoke-WebRequest "http://127.0.0.1:$port$path" -TimeoutSec 2 -UseBasicParsing }
        catch { $r = $_.Exception.Response }
        if ($r -and $r.StatusCode) {
            Write-Host ("     {0,-20} {1}" -f $path, [int]$r.StatusCode)
            if ($path -like '/v3/*') { $found += "$port$path" }
        }
    }
}
if ($found.Count -gt 0) {
    $summary['v3Service'] = ($found -join ' ')
} else {
    Write-Host "No /v3 service answered. It may be stopped, or on another machine." -ForegroundColor Yellow
    $summary['v3Service'] = 'not answering'
}

# ---------------------------------------------------------------------------
# Network identity and reachability
# ---------------------------------------------------------------------------
Section "Network"
$ips = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object IPAddress, InterfaceAlias, PrefixOrigin
$ips | Format-Table -AutoSize | Out-Host
$summary['ipv4'] = ($ips | ForEach-Object { "$($_.IPAddress) ($($_.PrefixOrigin))" }) -join ', '

if ($runtimes.ContainsKey('tailscale')) {
    Section "Tailscale"
    tailscale status 2>&1 | Select-Object -First 6 | Out-Host
}

# Existing tunnel config. cloudflared being installed means a tunnel existed
# once; a named one would be reusable, a quick tunnel would not.
if ($runtimes.ContainsKey('cloudflared')) {
    Section "cloudflared configuration"
    $dir = Join-Path $env:USERPROFILE '.cloudflared'
    if (Test-Path $dir) {
        Get-ChildItem $dir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize | Out-Host
        $ymls = Get-ChildItem $dir -Filter *.yml
        foreach ($y in $ymls) {
            Write-Host "--- $($y.Name) ---" -ForegroundColor DarkGray
            # Hostnames and service targets only; credentials files are named
            # but never opened.
            Get-Content $y.FullName | Select-String 'hostname:|service:|tunnel:' | Out-Host
        }
        $summary['cloudflared'] = ($ymls | ForEach-Object { $_.Name }) -join ', '
    } else {
        Write-Host "no ~/.cloudflared directory -- any tunnel was a quick tunnel" -ForegroundColor DarkGray
        $summary['cloudflared'] = 'installed, no config'
    }
}

# ---------------------------------------------------------------------------
# Sleep. Decides whether this box can be a dependency or only a dev tool.
# ---------------------------------------------------------------------------
Section "Sleep behaviour"
$standby = (powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE 2>&1 |
            Select-String 'Current AC Power Setting' | Select-Object -First 1)
Write-Host "$standby"
$hex = ([regex]::Match("$standby", '0x([0-9a-fA-F]+)')).Groups[1].Value
if ($hex -eq '00000000') {
    Write-Host "Never sleeps on mains -- can serve as a dependency." -ForegroundColor Green
    $summary['sleep'] = 'never (on mains)'
} elseif ($hex) {
    $mins = [Convert]::ToInt32($hex, 16) / 60
    Write-Host "Sleeps after $mins minutes idle -- fine for development, not as a dependency." -ForegroundColor Yellow
    $summary['sleep'] = "after $mins min idle"
}

# ---------------------------------------------------------------------------
# One block to paste back.
# ---------------------------------------------------------------------------
Section "SUMMARY -- paste this back"
Write-Host "----------8<----------"
foreach ($k in $summary.Keys) { Write-Host ("{0,-12}: {1}" -f $k, $summary[$k]) }
Write-Host "----------8<----------"
Write-Host ""
Write-Host "Nothing was installed or changed." -ForegroundColor Green
