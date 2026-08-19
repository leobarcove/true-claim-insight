# GPU host API contract

Captured on the GPU desktop, 19 August 2026, by `scripts/gpu-api-probe.ps1`
plus two follow-up experiments described below. This is the recorded contract
the `/v3` rewrite was written against — that rewrite landed on 19 August 2026
(`docs/GPU_HOST_INTEGRATION.md` §3). Treat this file as the source of truth for
what the host does, rather than inferring anything about it.

Contains no address, hostname or real data. Test inputs are synthetic.

> **Two corrections to the probe are folded in below, and both change what the
> rewrite should do.** The probe did not capture Surya — the item
> `GPU_HOST_INTEGRATION.md` §2.1 calls "the genuine unknown" — and its
> calling-convention result contradicted the finding it was built to confirm.
> Details in §6.

---

## 1. Ollama

```json
{ "version": "0.32.14" }
```

Endpoints in use: `POST /api/chat`, `GET /api/tags`, `GET /api/version`.

## 2. Models present, with digests

A tag is a moving pointer; the digest is what pins a decision.

| Tag | Family | Quant | Bytes | Digest |
| --- | --- | --- | --- | --- |
| `gpt-oss:20b` | gptoss | MXFP4 | 13793441244 | `17052f91a42e97930aa6e28a6c6c06a983e6a58dbb00434885a0cf5313e376f7` |
| `qwen3-vl:8b` | qwen3vl | Q4_K_M | 6140415879 | `901cae73216286ea8c5aba8b46d307ff7188f737285ec500c795a12f05225d28` |
| `numind/nuextract3:q4_k_m` | qwen35 | Q4_K_M | 3384386487 | `d688f2bc1405353a3fbf8e48bbbff45a49c79f81a6111adc6d2a09739cebbf91` |

`qwen35` is why this host needed Ollama ≥ 0.32.14: NuExtract3 ships a vision
projector, which routes it to the vendored llama.cpp runner, and that runner had
no `qwen35` on 0.13.5 (`GPU_HOST_SETUP.md` §2.1).

## 3. The calling convention — corrected

Instruction + `format` JSON schema, `temperature: 0`, `num_ctx: 8192`. Same
schema throughout: `flight_number` (string) and `delay_hours` (number), both
required. Correct answer: `MH168` and `6`.

Two prompts, because the difference between them is the whole finding:

- **Prompt A** — *"Flight MH168 was scheduled 09:00 and departed 15:00 on 18
  August 2026. Return the delay."* Names only one of the two schema fields.
- **Prompt B** — *"...Return the flight number and the delay in hours."* Names
  both.

| Model | Prompt A (a field is not named) | Prompt B (both named) |
| --- | --- | --- |
| `numind/nuextract3:q4_k_m` | `{"flight_number": "string", "delay_hours": 6}` ✗ | `{"flight_number": "MH168", "delay_hours": 6}` ✓ |
| `qwen3-vl:8b` | `{"flight_number": "MH168", "delay_hours": 6}` ✓ | ✓ |
| `gpt-oss:20b` | `{"flight_number": "MH168", "delay_hours": 6}` ✓ | ✓ |

Two runs each at `temperature: 0`; results were identical across runs.

**The failure is narrower and worse than previously recorded.** It is not that
NuExtract3 cannot be asked with an instruction plus a schema — under Prompt B it
is correct. It is that **for a required field the instruction does not
explicitly ask for, NuExtract3 emits the schema's own type name** — the literal
string `"string"` — instead of extracting the value or omitting the field.

That matters because it does not stay in the lab:

1. A real extraction schema has many fields and no prompt enumerates each one,
   so this is the normal case, not an edge case.
2. It is **schema-valid**, so constrained decoding cannot catch it and neither
   can a naive check.
3. It is the exact opposite of the abstention rule in
   `CASE_VERIFICATION_ENGINE.md` §8 — *"below a confidence floor the field is
   absent, not guessed"*. This guesses, and guesses something that looks
   deliberate.

Template mode works (`GPU_HOST_SETUP.md` §3.1.1) for the same underlying reason:
the template names every field. It is a special case of Prompt B, not a
different mechanism.

**Consequence for the rewrite — applied 19 August 2026.** `GPU_MODEL_VISION`
stays `qwen3-vl:8b`. The conclusion was unchanged; the stated reason in
`ollama-gpu-llm.provider.ts` and `.env.example` was too broad and has been
narrowed to the sentence in bold above. Any future use of NuExtract3 must
either name every field in the prompt or send its native template, and should
treat a returned type name as an extraction failure rather than a value.

## 4. Vision

Same schema, synthetic 640x200 PNG reading `MH168 DELAY 6H`.

| Model | Result |
| --- | --- |
| `qwen3-vl:8b` | `{"flight_number": "MH168", "delay_hours": 6}` ✓ |
| `numind/nuextract3:q4_k_m` | `{"flight_number": "MH168", "delay_hours": 6}` ✓ |
| `gpt-oss:20b` | no answer — not a vision model, as expected |

The vision prompt named both fields, which is why NuExtract3 is correct here.

## 5. Surya OCR — the contract

`openapi: 3.1.0`, no `servers` block declared. Routes: `GET /health`,
`POST /ocr`, `POST /analyze`. There is **no** `/predict`.

**Request** — identical for both POST routes: `multipart/form-data`, one
required part named `file` (binary). No other parameters, no engine selector,
no options.

```bash
curl -s -X POST "$SURYA/ocr" -F "file=@page.png"
```

**Response from `/ocr`** — verbatim, for the synthetic image:

```json
{"status":"success","pages":[{"page":1,"text_lines":[{"text":"MH168 DELAY 6H","confidence":0.9550392180681229,"bbox":[22.0,80.0,371.0,108.0]}],"full_text":"MH168 DELAY 6H"}],"total_lines":1}
```

**This is the grounding source.** `bbox` is `[x0, y0, x1, y1]` in pixels and
`confidence` is per line, which is what satisfies the second non-negotiable in
`CASE_VERIFICATION_ENGINE.md` §8 — *every extracted field carries page and
bounding box*. No LLM needs to produce coordinates, and none should be trusted
to: Surya is discriminative and cannot invent text that is not on the page.

**Response from `/analyze`** — same request shape, but the parsed half is
bank-statement fields:

```json
{"status":"success","raw_text":"MH168 DELAY 6H\n","parsed":{"bank_name":null,"account_holder":null,"account_number":null,"statement_period":null,"transactions":[],"opening_balance":null,"closing_balance":null}}
```

That schema belongs to the `finura` loan-application domain, not to claims.
**The rewrite calls `/ocr` only** and ignores `/analyze`; a test asserts it.

## 6. Corrections to the probe itself

**The probe did not capture Surya.** All three round-trip calls returned in 0s
with `A parameter cannot be found that matches parameter name 'Form'`.
`Invoke-RestMethod -Form` is PowerShell 6+; this host runs Windows PowerShell
5.1, so the requests were never sent. The failure looked like a Surya result
and was not one. §5 above was captured with `curl` instead, which is present on
the host.

**Fixed 19 August 2026.** The script now uses `curl.exe -F`, treats a sub-0.05s
round trip as a script failure rather than a fast service, and no longer probes
`/predict`.

**The probe's calling-convention result contradicted the finding it was built to
confirm** — NuExtract3 answered correctly under instruction + schema, because
the probe's prompt happens to name both fields while the original finding's
prompt named one. Neither result was wrong; they differ by a variable nobody was
holding constant. §3 above holds it constant and reports both.

## 7. Timings

Wall clock, including model load on first touch of each model.

| Call | Time |
| --- | --- |
| `gpt-oss:20b` text | 16s |
| `qwen3-vl:8b` text | 19s |
| `numind/nuextract3:q4_k_m` text | 7s |
| `qwen3-vl:8b` vision | 9s |
| `numind/nuextract3:q4_k_m` vision | 7s |
| Surya `/ocr` | under 1s |
| Two concurrent chat calls | 14s total |

Not a benchmark — single samples on a shared desktop. The one structural fact:
only one or two models fit in 24 GB at once (`qwen3-vl` + `gpt-oss` together
leave ~2.4 GB), so alternating between them pays a reload each time. A pipeline
that reads several documents per claim should finish with one model before
moving to the next rather than interleaving.
