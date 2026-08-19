# GPU host integration — the information exchange

Two machines have to agree before any application code can use the local LLM,
and neither can see the other. This document is the handshake: what the **host**
must report, what the **repository** will build against it, and how the two
travel between them.

Companion documents: `docs/GPU_HOST_SETUP.md` (configuring the host — done),
`docs/CASE_VERIFICATION_ENGINE.md` §8 (why these models).

> **Status: the integration is blocked, and not on configuration.** `GPU_SERVICE_URL`
> can be perfectly set and every call still fails. See §1.

---

## 1. Why this is blocked

`OllamaGpuLlmProvider` calls three endpoints:

```
POST /v3/ocr
POST /v3/llm/generate
POST /v3/llm/vision
```

**That API is not Ollama's.** It belonged to the `finura` project's backend on
the same desktop, which is halted — and it is why this class ever addressed a
Cloudflare tunnel. What actually runs on the host is:

| Service | Port | API |
| --- | --- | --- |
| Ollama | 11434 | `/api/chat`, `/api/tags`, `/api/version` |
| Surya OCR | 8002 | **unrecorded** — see §2 |

So the provider must be rewritten against what runs. Nobody on the repository
side can write that, because nobody there can reach these services;
`GPU_HOST_SETUP.md` §3.3 asked for Surya's routes to be recorded and they never
were. That single gap is the blocker.

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

## 3. What the repository will build against it

So the host side knows what to expect, and can say *"that will not work"* before
the code is written rather than after.

`LlmProvider` (`apps/risk-engine/src/llm/llm-provider.interface.ts`) keeps its
four methods. Only the implementation changes:

| Interface method | Today (broken) | After the rewrite |
| --- | --- | --- |
| `ocr(buffer, filename)` | `POST /v3/ocr` | Surya on `:8002` — **route and body from §2** |
| `generateJson(prompt, model?)` | `POST /v3/llm/generate` | `POST /api/chat`, `format` = JSON schema, `temperature` 0 |
| `visionJson(prompt, buffer, ...)` | `POST /v3/llm/vision` | `POST /api/chat` with `images: [base64]` |
| `reasoningJson(prompt, model?)` | `POST /v3/llm/generate` | `POST /api/chat`; no separate reasoning model — see below |

Four things the rewrite will hold to, so the host side can check them:

1. **One base URL for Ollama, a second for Surya.** Today one `GPU_SERVICE_URL`
   is assumed to front both. It does not. Surya needs its own configured
   endpoint, and a missing one must fail loudly rather than default.
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
