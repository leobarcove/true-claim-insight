# GPU host integration — the information exchange

Two machines have to agree before any application code can use the local LLM,
and neither can see the other. This document is the handshake: what the **host**
must report, what the **repository** will build against it, and how the two
travel between them.

Companion documents: `docs/GPU_HOST_SETUP.md` (configuring the host — done),
`docs/CASE_VERIFICATION_ENGINE.md` §8 (why these models).

> **Status: done, both ends.** The host was probed on 19 August 2026 and the
> contract is recorded in `docs/gpu-api-contract.md`. `OllamaGpuLlmProvider` was
> rewritten against it on 19 August 2026 and no longer calls `/v3` at all.
> **Nothing further is needed from the GPU host**, and nothing here is
> outstanding — this document is kept as the record of how the two sides agreed,
> not as a task list. §1 explains what was wrong; §3 records what was built.

---

## If you are on the GPU desktop, this is the job — **done, 19 August 2026**

**Already run; the result is `docs/gpu-api-contract.md`. Do not re-run it**
unless the host changes, and if you do, fix the `-Form` bug first (§4 of the
contract) — it silently failed to capture Surya at all.

One command, read-only, roughly ten minutes depending on model load times:

```powershell
git pull
powershell -NoExit -ExecutionPolicy Bypass -File .\scripts\gpu-api-probe.ps1
```

If the repository is not cloned on that machine, fetch the one file instead —
it needs nothing else from the tree:

```powershell
iwr -UseBasicParsing -OutFile "$env:USERPROFILE\Desktop\gpu-api-probe.ps1" `
  "https://raw.githubusercontent.com/leobarcove/true-claim-insight/feat/gpu-host-local-llm/scripts/gpu-api-probe.ps1"
powershell -NoExit -ExecutionPolicy Bypass -File "$env:USERPROFILE\Desktop\gpu-api-probe.ps1"
```

Then read `gpu-api-contract.md` on the Desktop, redact any address or hostname
(§4), and send it back — commit it to `docs/gpu-api-contract.md` on this branch,
or paste it into the pull request.

That is the whole ask. Everything below explains why each captured item is
needed, and what the repository will build once it arrives. Nothing else on the
host needs changing; `GPU_HOST_SETUP.md` is done.

---

## 1. Why this was blocked

**Resolved 19 August 2026.** Kept because the failure is the reason several
rules in this repository exist, and a fixed bug with no record invites its own
return.

`OllamaGpuLlmProvider` used to call three endpoints:

```
POST /v3/ocr
POST /v3/llm/generate
POST /v3/llm/vision
```

**That API is not Ollama's.** It belonged to a halted backend from an unrelated
project that shares the same desktop — and it is why this class ever addressed a
Cloudflare tunnel. What actually runs on the host is:

| Service | Port | API |
| --- | --- | --- |
| Ollama | 11434 | `/api/chat`, `/api/tags`, `/api/version` |
| Surya OCR | 8002 | **unrecorded** — see §2 |

So the provider had to be rewritten against what runs. Nobody on the repository
side could write that, because nobody there could reach these services;
`GPU_HOST_SETUP.md` §3.3 asked for Surya's routes to be recorded and they never
were. That single gap was the blocker, and closing it was the whole point of
this exchange.

**This is deliberately not being guessed at.** Every previous guess about this
host has been wrong — a Cloudflare tunnel that had expired, a `/v3` API that
does not exist, three model ids no longer present, and a model tag that would
have resolved to an unrelated fine-tune. An unverifiable network rewrite would
be the fifth.

---

## 2. What the host must report

Run this on the desktop. Read-only: it sends requests and reads responses,
installs nothing, and pulls no models.

```powershell
git pull
powershell -NoExit -ExecutionPolicy Bypass -File .\scripts\gpu-api-probe.ps1
```

It writes `gpu-api-contract.md` to the Desktop. **Read it before sharing** — see
§4 on redaction.

### 2.1 What it captures, and why each item is needed

| Captured | Why the rewrite needs it |
| --- | --- |
| Ollama version | Decides whether schema-constrained `format` is available at all |
| Model list **with digests** | A tag is a moving pointer; the digest is what pins a decision. BNM model risk expects a past decision to be explainable later |
| **Same schema, every model** | The one that matters — see §2.2 |
| Vision, same schema, generated image | Which models can read a document, and whether the answer is right |
| **Surya's OpenAPI spec** | The genuine unknown. `/ocr` and `/analyze` were mentioned once in `.env.example`; the request and response shapes were never recorded |
| Surya round trip | What it *actually* accepts and returns, whatever the spec claims |
| Two concurrent calls | A claim carries three or four documents. If the card serialises them, per-claim latency is the sum — which is what the §2.5 COGS ceiling cares about |

### 2.2 The calling convention is the finding, not the routes

Asked with an instruction plus a JSON schema, NuExtract3 was found returning:

```json
{"flight_number": "string", "delay_hours": 6}
```

It echoes the schema's own **type name** into a required field. Schema-valid,
wrong, and it passes a naive check — including the one this project's runbook
originally proposed as its verification step.

So the probe sends **the same prompt and schema to every model** and records
each answer verbatim. The correct answer is `MH168` and `6`. Any model returning
`"string"` is telling you it needs a different convention, and that is a property
of the *model*, not of the transport — which is exactly what the current
provider assumes away.

---

## 3. What the repository built against it

**Done, 19 August 2026.** `LlmProvider`
(`apps/risk-engine/src/llm/llm-provider.interface.ts`) kept its four methods;
only the implementation changed:

| Interface method | Was (broken) | Now |
| --- | --- | --- |
| `ocr(buffer, filename)` | `POST /v3/ocr` | Surya `POST /ocr` on its own base URL — multipart, one part named `file` |
| `generateJson(prompt, model?)` | `POST /v3/llm/generate` | `POST /api/chat`, `format: 'json'`, `temperature` 0 |
| `visionJson(prompt, buffer, ...)` | `POST /v3/llm/vision` | `POST /api/chat` with `images: [base64]` |
| `reasoningJson(prompt, model?)` | `POST /v3/llm/generate` | `POST /api/chat` on the text model — no third model |

`ocr()` now returns per-line `text`, `confidence` and `bbox` alongside the
flattened text, because discarding Surya's geometry in the provider would make
the grounding required by `CASE_VERIFICATION_ENGINE.md` §8 unrecoverable
downstream. The Gemini path returns no geometry and says why.

Four things the rewrite holds to, each covered by a test that fails when the
behaviour is reverted:

1. **One base URL for Ollama, a second for Surya.** `GPU_SERVICE_URL` was
   assumed to front both. It does not. `SURYA_SERVICE_URL` now exists, has no
   default, and fails loudly when unset — it does not quietly fall back to the
   Ollama endpoint.
2. **Model ids stay configuration.** `GPU_MODEL_TEXT`, `GPU_MODEL_VISION`,
   `GPU_MODEL_REASONING` already exist and are logged at startup. Adding a
   fourth hardcoded literal would repeat the bug this branch just removed.
3. **`temperature: 0`, and the model version recorded on the result.** Required
   for the audit position in `CASE_VERIFICATION_ENGINE.md` §9: re-running a case
   six months later must not silently produce a different answer.
4. **No reasoning model.** The verification design has no step where a model
   holds a verdict, so `reasoningJson` routes to the text model rather than
   pulling a third one.

---

## 4. Sending it back

**This repository is public.** The report must name no tailnet address, no
hostname, no LAN IP and no real claimant data. The probe uses a generated
synthetic image for exactly that reason, and `GPU_HOST_SETUP.md` §6.2 already
establishes the convention: identifiers live in `tci-gpu-config.txt` on the
host's Desktop and in `.env`, never in a committed file.

Read the report, then either:

- **commit it** to `docs/gpu-api-contract.md` on `feat/gpu-host-local-llm`, with
  addresses replaced by `<redacted>`; or
- **paste it into the pull request**, if that is faster.

Either way the repository side can then write the rewrite against a recorded
contract rather than an assumption — which is the whole point of this exchange.

---

## 5. What is still true regardless

**Sovereignty is unchanged.** An office desktop on a tailnet is not controlled
in-country infrastructure. `MASTER_PLAN.md` §3.4 stands, and nothing in this
integration earns the claim — it makes the local path *work*, not *compliant*.

**Port 11434 remains open to the LAN**, with no authentication, as a recorded
accepted risk (`GPU_HOST_SETUP.md` §4). Tailscale added a private path; it did
not remove the exposure.

**The host is a development resource.** It never sleeps on mains, which makes it
a credible staging dependency over a private network. Production inference
cannot rest on a machine somebody may reboot.
