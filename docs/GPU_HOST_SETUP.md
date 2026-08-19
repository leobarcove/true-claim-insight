# GPU host setup — execution plan

A runbook for configuring `DESKTOP-PQGPO49` as the local-LLM host for TCI, written
to be executed by an agent (Claude Code) or a person, on the machine itself.

**Read §0 before running anything.** This box already runs three unrelated
systems, and the main risk in this plan is not failure — it is collateral damage.

**Already configured?** To call the host from a laptop, go straight to §6.2;
to run the repository against it from a Mac, §6.3. Executed 19 August 2026:
the host runs Ollama 0.32.14 with all three models, reachable on the tailnet
as `tci-gpu-host.<your-tailnet>.ts.net:11434`.
**§3.1.1 is the one thing to read before writing a client** — NuExtract3 needs a
template, not an instruction, and calling it wrongly returns plausible nonsense
rather than an error.

Companion documents: `docs/CASE_VERIFICATION_ENGINE.md` §8 (why these models),
`scripts/gpu-survey.ps1` (the read-only survey this plan follows from).

---

## 0. Rules of engagement

### 0.1 The machine is shared

The survey found three unrelated workloads already running:

| Owner | Containers | Notes |
| --- | --- | --- |
| `finura-fi-*` | ollama, surya, postgres, redis | **Holds the GPU.** Up 8 days |
| `paybrix-*` | agent, alloy, watchtower | Up 8 days; watchtower auto-updates images |
| `appium-*` | six device runners | Up 4-7 days; bound to ports 4735-4756 |

**Do not stop, restart, remove, rename or reconfigure any container this plan
does not explicitly create.** `paybrix-watchtower` auto-updates images, so a
container left in an odd state may be "repaired" into a worse one later.

### 0.2 Stop gates

Four steps in this plan change something another system might depend on --
§1.2, §2.1, §4 and §5. Each is
marked **STOP** and must be confirmed by a human before proceeding. An agent
executing this file must halt and ask; it must not infer consent from the
absence of an objection.

### 0.3 Verification is part of every step

No step is complete until its verification command passes. A step whose
verification is skipped is a step that did not happen — record the actual output,
not the expectation.

### 0.4 Baseline first

Capture the state to return to before changing anything (§1.1). Every phase
below has a rollback; none of them work without the baseline.

---

## 1. Phase 0 — preflight

### 1.1 Capture the baseline

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$base  = "$env:USERPROFILE\tci-baseline-$stamp"
New-Item -ItemType Directory -Path $base | Out-Null

docker ps -a --format "{{.Names}}|{{.Image}}|{{.Ports}}|{{.Status}}" | Out-File "$base\containers.txt"
docker inspect finura-fi-ollama | Out-File "$base\ollama-inspect.json"
docker exec finura-fi-ollama ollama list | Out-File "$base\ollama-models-before.txt"
nvidia-smi | Out-File "$base\nvidia-before.txt"
Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort | Out-File "$base\ports-before.txt"
docker exec finura-fi-ollama ollama --version | Out-File "$base\ollama-version.txt"
$base | Out-File "$env:USERPROFILE\.tci-baseline-path" -Encoding ascii
"Baseline written to $base"
```

Later phases run in new shells, where `$base` no longer exists. Recover it with:

```powershell
$base = Get-Content "$env:USERPROFILE\.tci-baseline-path"
```

**Verify:** six files exist and are non-empty, and `.tci-baseline-path` resolves.
**Why:** `ollama-models-before.txt` is the only record of which models were
already pulled. Without it, a later cleanup cannot tell TCI's models from
another project's.

### 1.2 Confirm ownership — **STOP**

The inference containers carry a `finura-fi-` prefix and belong to a different
product.

> **Ask before continuing:** is `finura-fi` a system you own and are content for
> TCI to share a GPU and an Ollama instance with?

- **Yes** → continue; TCI reuses the running `finura-fi-ollama`.
- **No / unsure** → stop. TCI needs its own container (§7, deferred), and
  sharing another team's model store is not a decision to make by default.

Sharing is recommended when the answer is yes: **two Ollama servers on one GPU
compete for VRAM** and will thrash under concurrent load. One server, several
models, is the correct shape.

### 1.3 Confirm free disk

```powershell
"{0:N0} GB free on C:" -f ((Get-PSDrive C).Free/1GB)
```

**Verify:** at least 60 GB free. The three models below total roughly 30 GB, and
Ollama needs working room. The survey reported 876 GB, so this should pass
trivially — it is here because a pull that fills a shared disk would take out
`finura-fi` and `paybrix` with it.

---

## 2. Phase 1 — models

Rationale for each choice is in `docs/CASE_VERIFICATION_ENGINE.md` §8. In short:
a small specialist for extraction, a vision model as the escalation, and a
general model to write the case file. **No reasoning model** — the design has no
step where an LLM holds a verdict, so `deepseek-r1:14b` has no job here.

### 2.1 Precondition — Ollama version — **STOP** if too old

Qwen3-VL requires **Ollama 0.12.7 or newer**. Check before pulling anything, not
after a confusing failure:

```powershell
docker exec finura-fi-ollama ollama --version
```

If it is older, **STOP**. Upgrading `finura-fi`'s container is a change to
another team's service and needs their agreement (§1.2 covered sharing, not
upgrading). NuExtract3 and gpt-oss can still be pulled; Qwen3-VL cannot.

### 2.2 Pull the models

All three tags below were verified against the Ollama registry on 19 August 2026.
Roughly 23 GB in total, and over office WiFi that is not a fast step.

```powershell
docker exec finura-fi-ollama ollama pull numind/nuextract3:q4_k_m
docker exec finura-fi-ollama ollama pull qwen3-vl:8b
docker exec finura-fi-ollama ollama pull gpt-oss:20b
```

| Tag | Download | Context | Input | Role |
| --- | --- | --- | --- | --- |
| `numind/nuextract3:q4_k_m` | ~3 GB | 256K | Text, Image | **Extraction** — doc to JSON, and doc to Markdown |
| `qwen3-vl:8b` | 6.1 GB | 256K | Text, Image | Vision escalation when NuExtract3 struggles |
| `gpt-oss:20b` | 14 GB | 128K | **Text only** | Case-file summary. Not a vision model |

**The namespace matters.** NuExtract3 is published under `numind/`, not in the
root library. A bare `ollama pull nuextract3` risks resolving to `nuextract` —
an unrelated and much older phi-3-mini fine-tune — which would look like success
and behave nothing like the model this design assumes.

Higher-precision NuExtract3 tags exist if extraction quality disappoints:
`numind/nuextract3:q6_k` (4.1 GB) and `numind/nuextract3:bf16` (9.3 GB). Start at
Q4_K_M, which is NuMind's own recommended default.

**Verify:**

```powershell
docker exec finura-fi-ollama ollama list
"{0:N0} GB free on C:" -f ((Get-PSDrive C).Free/1GB)
```

All three must appear, and free space must still be comfortable — this disk is
shared with `finura-fi` and `paybrix`.

**Rollback:** `ollama rm <tag>`, but only for tags absent from
`$base\ollama-models-before.txt`.

### 2.2.1 Cap the context, or the KV cache eats the card

NuExtract3's default Modelfile sets a **131,072-token context**, and NuMind
warn that a context that large needs substantial memory for the KV cache. The
weights are only ~3 GB; the cache is what would put this over 24 GB.

Claim documents are a page or two, not a book. Cap it when serving:

```powershell
docker exec finura-fi-ollama sh -c "echo 'OLLAMA_KV_CACHE_TYPE=q8_0'"
```

and set `num_ctx` per request (8192 is generous for a boarding pass) rather than
inheriting the default. **Verify** during §3 that `nvidia-smi` shows headroom
left, not a card at 23 GB.

### 2.3 What is deliberately not pulled

`deepseek-r1:14b`, `qwen2.5:7b` and `qwen2.5vl:7b` are referenced by
`apps/risk-engine/src/llm/ollama-gpu-llm.provider.ts` today. The first has no
role in the new design; the other two are two generations old. **Do not pull
them.** If they are already present from another project, leave them — they are
not TCI's to remove.

---

## 3. Phase 2 — prove the models do the one thing that matters

Structured output is not optional for this pipeline. A model that cannot be held
to a JSON schema cannot be used, however well it reads a document.

### 3.1 Schema-constrained generation

```powershell
$body = @'
{
  "model": "numind/nuextract3:q4_k_m",
  "messages": [{"role":"user","content":"Flight MH168 was scheduled 09:00 and departed 15:00 on 18 August 2026. Return the delay."}],
  "stream": false,
  "options": {"temperature": 0},
  "format": {
    "type": "object",
    "properties": {
      "flight_number": {"type":"string"},
      "delay_hours": {"type":"number"}
    },
    "required": ["flight_number","delay_hours"]
  }
}
'@
Invoke-RestMethod -Uri http://127.0.0.1:11434/api/chat -Method Post -ContentType 'application/json' -Body $body |
  Select-Object -ExpandProperty message | Select-Object -ExpandProperty content
```

**Verify:** the response parses as JSON, contains exactly those two keys, and
`delay_hours` is `6`.

If this fails, capture the version before diagnosing anything else --
schema-constrained `format` is a relatively recent Ollama feature:

```powershell
docker exec finura-fi-ollama ollama --version
```

**If the shape is right but the number is wrong,** that is the expected failure
mode and the reason the design never lets a model hold a verdict — record it and
continue. **If the shape is wrong,** the Ollama version is too old for
schema-constrained `format`; note the version and stop, because everything
downstream assumes it.

#### 3.1.1 The test above is the WRONG call for NuExtract3 — verified 19 Aug 2026

Run exactly as written, NuExtract3 returns:

```json
{"flight_number": "string", "delay_hours": 6}
```

It echoes the schema's *type name* into a required field. That is schema-valid,
it satisfies the check above, and it is wrong — a live instance of the
"schema-valid is not semantically right" trap in
`docs/CASE_VERIFICATION_ENGINE.md` §8, produced by that document's own
recommended model under this document's own recommended test.

**NuExtract3 is a template-filling model, not an instruction-following one.**
Give it a template and a context, and drop `format` entirely:

```json
{
  "model": "numind/nuextract3:q4_k_m",
  "messages": [
    {
      "role": "user",
      "content": "# Template:\n{\"flight_number\": \"verbatim-string\", \"delay_hours\": \"number\"}\n# Context:\nFlight MH168 was scheduled 09:00 and departed 15:00."
    }
  ],
  "stream": false,
  "options": {
    "temperature": 0,
    "num_ctx": 8192
  }
}
```

→ `{"flight_number": "MH168", "delay_hours": 6}`, from text and from an image
(pass the page in `images` and leave `# Context:` empty).

`qwen3-vl:8b` has the opposite property: it is correct under instruction +
`format` and got **both** fields right where NuExtract3 got one. Use `format`
with `qwen3-vl` and `gpt-oss`; use templates with NuExtract3.

### 3.2 Vision

Generate the test image rather than hunting for one, so the expected answer is
known and the check is a real assertion instead of a judgement call:

```powershell
Add-Type -AssemblyName System.Drawing
$bmp  = New-Object System.Drawing.Bitmap 640,200
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::White)
$font = New-Object System.Drawing.Font('Consolas', 32)
$g.DrawString("MH168 DELAY 6H", $font, [System.Drawing.Brushes]::Black, 20, 70)
$g.Dispose()
$testImage = "$env:TEMP\tci-ocr-test.png"
$bmp.Save($testImage, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
"Test image at $testImage"
```

```powershell
$img = [Convert]::ToBase64String([IO.File]::ReadAllBytes($testImage))
$body = @{
  model = "numind/nuextract3:q4_k_m"   # repeat with qwen3-vl:8b to compare
  messages = @(@{ role = "user"; content = "Transcribe any text in this image."; images = @($img) })
  stream = $false
  options = @{ temperature = 0 }
} | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri http://127.0.0.1:11434/api/chat -Method Post -ContentType 'application/json' -Body $body |
  Select-Object -ExpandProperty message | Select-Object -ExpandProperty content
```

**Verify:** the response contains `MH168` and `6H`. Anything less is a fail, not
a near miss -- this is the easiest document the model will ever be given.
**Watch for:** a response that never terminates, or one that degenerates into
repeated characters. A hands-on report has Qwen3-VL doing exactly that on a
dense form. If it happens, note it — it decides whether this model can be the
escalation path or only a curiosity.

### 3.3 Surya

```powershell
docker ps --filter name=finura-fi-surya --format "{{.Names}} {{.Ports}} {{.Status}}"
Invoke-WebRequest http://127.0.0.1:8002/docs -UseBasicParsing | Select-Object StatusCode
```

**Verify:** 200, and the page names the routes. Record them — TCI's client will
call Surya directly, and nothing in this repo yet records its API shape.

Surya stays in the design because it is a discriminative OCR engine rather than a
generative model: **it cannot invent text that is not on the page.** On a
regulated claim that property outranks a few points of accuracy.

### 3.4 Confirm the GPU is actually doing the work

```powershell
nvidia-smi --query-gpu=memory.used,utilization.gpu --format=csv,noheader
```

Run it *during* §3.1. **Verify:** memory in use is well above the 1.6 GB idle
baseline. If it is not, the model is running on CPU and every latency number
after this is meaningless.

---

## 4. Phase 3 — close the open door — **STOP**

The survey found port **11434 bound to `0.0.0.0` with no authentication**.
Anything on the office network can use that GPU, and the Ollama API permits
*pulling and deleting models*, not only inference.

> **Ask before continuing:** does anything outside this machine currently reach
> Ollama on `11434`? `finura-fi` may depend on it from another host.

- **Nothing external depends on it** → rebind to loopback (§4.1).
- **Something does, or it is unknown** → **do not rebind.** Leave it and go to
  §5; Tailscale narrows the exposure without breaking a caller you cannot see.
  Record that the port remains open, so it is a known accepted risk rather than
  an oversight.

### 4.1 Rebind to loopback

Requires editing the compose file that owns `finura-fi-ollama` — which belongs to
another project, so this is a change to their configuration. Find it first;
Compose records its own provenance on the container:

```powershell
docker inspect finura-fi-ollama --format '{{ index .Config.Labels "com.docker.compose.project.config_files" }}'
docker inspect finura-fi-ollama --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

If those labels come back empty the container was started with `docker run`
rather than Compose, so there is no file to edit — rebinding would mean
recreating another team's container by hand, which is a larger change than this
plan should make. Record that and skip to §5.

```yaml
# was
ports: ["11434:11434"]
# becomes
ports: ["127.0.0.1:11434:11434"]
```

```powershell
docker compose -f <their-compose-file> up -d finura-fi-ollama
```

**Verify:**

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 11434 | Select-Object LocalAddress
```

Must show `127.0.0.1`, not `0.0.0.0`.

**Rollback:** restore the original `ports:` line and re-run `up -d`.

---

## 5. Phase 4 — reachable, privately — **STOP**

TCI's services must reach this box from a developer machine and, later, from
staging in `ap-southeast-5`. Three options, and only one is defensible for
claimant data:

| Option | Reachable from | Data path | Verdict |
| --- | --- | --- | --- |
| LAN IP | Office only | Local | Breaks — the IP is DHCP (`192.168.0.71`) |
| Cloudflare tunnel | Anywhere | **Transits Cloudflare** | Fails the sovereignty argument |
| **Tailscale** | Anywhere on the tailnet | E2E encrypted, peer-to-peer | **Recommended** |

Cloudflare is already installed here, but its `config.yml` belongs to the
paybrix project and points at a remote host. **Do not add TCI hostnames to that
file** — it is another system's configuration.

> **Ask before continuing:** may Tailscale be installed on this machine, and is
> there an existing tailnet to join?

### 5.1 Install and join

The survey did not check for `winget`, so confirm it before relying on it:

```powershell
winget --version
```

If that fails, install Tailscale from `https://tailscale.com/download/windows`
by hand rather than trying to repair App Installer on a shared machine.

```powershell
winget install --id Tailscale.Tailscale --accept-source-agreements --accept-package-agreements
tailscale up
tailscale status
```

**Verify:** `tailscale status` shows this host with a `100.x.y.z` address.
Record the MagicDNS name — that is what `GPU_SERVICE_URL` will point at, and it
does not change when DHCP renews.

### 5.2 If Tailscale is refused

Fall back to a **DHCP reservation** for `192.168.0.71` on the office router, and
accept that the host is reachable only from the office LAN. Record that staging
therefore cannot use it, so the local-LLM path stays development-only until the
question is revisited.

---

## 6. Phase 5 — prove it, then record it

### 6.0 Acceptance test — run this from the machine that runs TCI

Every check so far ran *on* the GPU box, which proves the models work and proves
nothing about the objective. The objective is that TCI can reach them. Run this
from the developer machine, not the desktop:

> **Run it from another machine, and mean it.** Curling the host's own
> Tailscale name *from the host* passes without the packet ever leaving the box:
> it proves DNS and the listener, not reachability. It is the same false pass as
> testing a tunnel from inside the tunnel. Setup for a client machine is §6.2.

```bash
GPU=http://tci-gpu-host.<your-tailnet>.ts.net:11434

# All three models present?
curl -s "$GPU/api/tags" | grep -o '"name":"[^"]*"'

# The extraction model, over the network, in TEMPLATE mode (see 3.1.1 - an
# instruction plus `format` returns "string" here). This is the call the whole
# pipeline rests on; if only one thing is proved, prove this.
curl -s "$GPU/api/chat" -H 'Content-Type: application/json' -d '{"model": "numind/nuextract3:q4_k_m", "messages": [{"role": "user", "content": "# Template:\n{\"flight_number\": \"verbatim-string\", \"delay_hours\": \"number\"}\n# Context:\nFlight MH168 was scheduled 09:00 and departed 15:00."}], "stream": false, "options": {"temperature": 0, "num_ctx": 8192}}'
```

**Verify:** all three tags appear, and the second call returns
`{"flight_number": "MH168", "delay_hours": 6}`.

Repeat with `gpt-oss:20b` if you want the summariser path covered as well — that
one takes `format`, not a template — but the extraction call is the one that
matters.

**If this fails while §3 passed,** the models are fine and the *link* is not —
which is a §5 problem, not a model problem. Do not proceed to §6.1 until this
passes, because recording an endpoint nobody can reach is how the dead
Cloudflare tunnel got into the codebase in the first place.

### 6.1 Record what was built

Nothing here is real to the repo until it is written down. The dead Cloudflare
quick tunnel in `ollama-gpu-llm.provider.ts` is what happens otherwise.

Capture and hand back:

```powershell
$out = "$env:USERPROFILE\Desktop\tci-gpu-config.txt"
"=== models ==="            | Out-File $out
docker exec finura-fi-ollama ollama list | Out-File $out -Append
"=== endpoint ==="          | Out-File $out -Append
(Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 11434,8002 |
  Select-Object LocalAddress,LocalPort | Out-String) | Out-File $out -Append
"=== reachable as ==="      | Out-File $out -Append
(tailscale status 2>&1 | Select-Object -First 3 | Out-String) | Out-File $out -Append
"=== gpu ==="               | Out-File $out -Append
nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader | Out-File $out -Append
"Written to $out"
```

Then, in the repo (not on this machine):

1. Set `GPU_SERVICE_URL` in `.env.example` with a comment saying what it points
   at and why it is unset by default.
2. **Remove the hardcoded Cloudflare fallback** from
   `apps/risk-engine/src/llm/ollama-gpu-llm.provider.ts` so a missing
   configuration fails loudly instead of silently addressing a dead tunnel.
3. Record the outcome in `docs/MASTER_PLAN.md` §8, including anything that was
   *not* done and why — a stop gate answered "no" is part of the record.

---


### 6.2 Calling the host from a client machine (macOS)

The host is configured; this is what a Mac needs. Nothing here runs on the
desktop.

**1 — Join the same tailnet.** The box is `tci-gpu-host` on `<your-tailnet>.ts.net`,
owned by `smitherytechnology@`. **A different account is a different tailnet and
will not see it** — this is the single most likely reason the steps below fail.

```bash
brew install --cask tailscale
```

Then open Tailscale and sign in as that account (or `sudo tailscale up`).

**2 — Confirm the peer is visible, from the Mac:**

```bash
tailscale status | grep tci-gpu-host
```

**Verify:** a line showing `100.x.y.z  tci-gpu-host`. Until this prints,
nothing below can work, and no amount of retrying curl will tell you why.

**3 — Set the endpoint.**

```bash
export GPU=http://tci-gpu-host.<your-tailnet>.ts.net:11434
```

If MagicDNS is disabled on the tailnet, use `export GPU=http://100.x.y.z:11434`
instead. That address is stable; the LAN one is DHCP and moves.

> **The real tailnet name and IP are deliberately not written down here — this
> repository is public.** They grant nothing without tailnet membership, but a
> public repo should not name internal infrastructure. Get them from
> `tci-gpu-config.txt` on the host's Desktop, or from `tailscale status` on any
> machine already on the tailnet. Put the value in your local `.env` as
> `GPU_SERVICE_URL`; `.env` is not committed.

```bash
curl -s "$GPU/api/tags" | grep -o '"name":"[^"]*"'
```

**Verify:** three names — `numind/nuextract3:q4_k_m`, `qwen3-vl:8b`,
`gpt-oss:20b`.

**4 — The calls, one per job.** Each model wants a different convention, and
mixing them up produces confident nonsense rather than an error (3.1.1).

*Extraction — NuExtract3, template mode, no `format`:*

```bash
curl -s "$GPU/api/chat" -H 'Content-Type: application/json' -d '{"model": "numind/nuextract3:q4_k_m", "messages": [{"role": "user", "content": "# Template:\n{\"flight_number\": \"verbatim-string\", \"delay_hours\": \"number\"}\n# Context:\nFlight MH168 was scheduled 09:00 and departed 15:00."}], "stream": false, "options": {"temperature": 0, "num_ctx": 8192}}'
```

→ `{"flight_number": "MH168", "delay_hours": 6}`

*Vision — same model and template, with the page image and an empty context.*
Needs `jq` (`brew install jq`) to embed the base64 safely:

```bash
TMPL=$'# Template:\n{"flight_number": "verbatim-string", "delay_hours": "number"}\n# Context:'
curl -s "$GPU/api/chat" -H 'Content-Type: application/json' -d "$(jq -n \
  --arg t "$TMPL" --arg img "$(base64 -i boarding-pass.png)" \
  '{model:"numind/nuextract3:q4_k_m",messages:[{role:"user",content:$t,images:[$img]}],stream:false,options:{temperature:0,num_ctx:8192}}')"
```


The request *shape* above is verified — it returns
`{"flight_number": "MH168", "delay_hours": 6}` from a rendered test page. The
`jq` invocation itself was not run on the host, which has no `jq`; if it
misbehaves, build the same body in any language. The shape is what matters.

*Vision escalation — qwen3-vl, which IS correct under instruction + `format`:*

```bash
curl -s "$GPU/api/chat" -H 'Content-Type: application/json' -d '{"model": "qwen3-vl:8b", "messages": [{"role": "user", "content": "Flight MH168 was scheduled 09:00 and departed 15:00. Return the delay."}], "stream": false, "options": {"temperature": 0, "num_ctx": 8192}, "format": {"type": "object", "properties": {"flight_number": {"type": "string"}, "delay_hours": {"type": "number"}}, "required": ["flight_number", "delay_hours"]}}'
```

*Case-file summary — gpt-oss, text only, also takes `format`:*

```bash
curl -s "$GPU/api/chat" -H 'Content-Type: application/json' -d '{"model": "gpt-oss:20b", "messages": [{"role": "user", "content": "Summarise: flight MH168 delayed 6 hours; claimant seeks meal reimbursement."}], "stream": false, "options": {"temperature": 0, "num_ctx": 8192}, "format": {"type": "object", "properties": {"summary": {"type": "string"}}, "required": ["summary"]}}'
```

**First call after an idle period is slow** — the model is being loaded onto the
card. Only one or two of these fit in 24 GB at once (qwen3-vl + gpt-oss together
leave ~2.4 GB), so alternating between them pays a reload each time.

#### Troubleshooting

| Symptom | What it means |
| --- | --- |
| `curl: (28)` timeout | The host was reached but nothing answered. Most likely Windows Firewall blocking inbound on the Tailscale interface — needs an elevated PowerShell **on the desktop**, not a client-side fix |
| `curl: (7)` connection refused | Port not listening — the `finura-fi-ollama` container is down |
| `Could not resolve host` | MagicDNS off, or the Mac is not on the tailnet. Use `http://100.x.y.z:11434` |
| `tailscale status` omits the host | Wrong account/tailnet, or the desktop is asleep. Step 1 |
| `{"flight_number": "string"}` | Instruction + `format` was used on NuExtract3. See 3.1.1 — this is not an error, it is the wrong calling convention |
| `unknown model architecture` | The host was downgraded below Ollama 0.32.14. See 2.1 |

#### Without Tailscale, over the office LAN

Port `11434` is bound to `0.0.0.0`, so `http://192.168.0.71:11434` answers from
the same WiFi today. **Prefer the tailnet.** That address is DHCP and moves, and
the port is unauthenticated — the Ollama API permits *pulling and deleting*
models, so anything on the office network can empty that model store (4). The
exposure is a recorded accepted risk, not a feature to build on.


### 6.3 Running TCI itself from the Mac

§6.2 proves the host answers `curl`. This is what the repository needs before
it can talk to that host — and what is still blocked afterwards.

**Nothing here has been run on a Mac.** It was written on the Windows host,
which has no `pnpm` and no `node_modules`, so every command below is derived
from `package.json` rather than executed. Treat a failure as a bug in this
section, not as your mistake.

#### 1. Toolchain

The repo pins `pnpm@9.15.0` via `packageManager` and needs Node >= 22.
Corepack ships with Node, so do not `npm i -g pnpm`:

```bash
corepack enable
```

```bash
corepack prepare pnpm@9.15.0 --activate
```

**Verify:** `node -v` >= 22, and `pnpm -v` prints `9.15.0`. A different pnpm
major will resolve the lockfile differently.

#### 2. The branch, and dependencies

```bash
git fetch origin && git checkout feat/gpu-host-local-llm && pnpm install
```

#### 3. Point it at the host

```bash
cp -n .env.example .env
```

Then set `GPU_SERVICE_URL` in `.env` to the value from §6.2 — the real tailnet
name is not in this repo, which is public. Leave `GPU_MODEL_TEXT`,
`GPU_MODEL_VISION` and `GPU_MODEL_REASONING` unset unless the host's models
have changed; their defaults are the tags actually pulled onto it, and
risk-engine logs whichever ids are in force at startup.

#### 4. Run the tests that cover this work

**No Docker and no GPU needed** — the suite constructs the provider against a
stub `ConfigService` and never opens a socket. It is also runnable before your
Mac joins the tailnet:

```bash
pnpm --filter @tci/risk-engine test
```

**Verify:** `ollama-gpu-llm.provider.spec.ts` passes — construction without
`GPU_SERVICE_URL` does not throw, a call without it does, and no model id names
anything removed from the host.

For the whole repo (`turbo run test`, and the shared packages must be built
first, which `setup:build` does):

```bash
pnpm run setup:build && pnpm test && pnpm typecheck
```

Only the **full application** needs Postgres, Redis and Mailhog — `pnpm setup`
does that and expects Docker Desktop running locally. It is not required for
any of the above.

#### 5. What is still blocked, and it is not configuration

`OllamaGpuLlmProvider` calls `/v3/ocr`, `/v3/llm/generate` and `/v3/llm/vision`.
**That API is not Ollama's.** It belonged to the `finura` project's backend on
the same desktop, which is halted — and it is why this class ever pointed at a
Cloudflare tunnel. Ollama serves `/api/chat`; Surya serves `/ocr` on `:8002`.

So a correctly configured `GPU_SERVICE_URL` still fails on every call, and
that is expected until §7 is done. Nothing in the application can use this host
before then; `curl` from §6.2 is the only working path today. When the rework
lands, revisit `GPU_MODEL_VISION`: it defaults to `qwen3-vl:8b` only because
this class asks with an instruction plus a JSON schema, which is the convention
NuExtract3 answers wrongly (§3.1.1).

## 7. Deferred, and honest about it

**A separate TCI Ollama container.** Correct if §1.2 was answered "no", or when
TCI's usage grows enough that sharing becomes contention. Two Ollama servers on
one 24 GB card will thrash, so this needs VRAM budgeting rather than just a
second compose file.

**The `/v3` gateway.** `OllamaGpuLlmProvider` calls `/v3/ocr`,
`/v3/llm/generate` and `/v3/llm/vision`. **That service does not exist on this
machine** and nothing in the repo says where it ever did. The recommendation is
to delete the abstraction and have the provider call Ollama's native
`/api/chat` and Surya directly — fewer moving parts, and one less bespoke
service to keep alive. That is repo work, not host work, and it is the change
that makes this box usable.

**Production.** This is a desktop in an office. It never sleeps on mains, which
makes it a credible *staging* dependency over a private network — but production
inference cannot rest on a machine somebody may reboot. `docs/MASTER_PLAN.md`
§3.4 stays true: the sovereignty claim is not earned until the endpoint is
controlled in-country infrastructure, and a tunnel to an office desktop is not
that.
