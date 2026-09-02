# Web form — the manual test script

Walk this before every release, on **a desktop browser and a phone browser**.
It takes about ten minutes and it is the only end-to-end coverage there is: the
repo has no e2e harness, and standing one up is its own project rather than a
line in this plan.

Nothing here is automated on purpose. The failures this catches are the ones a
unit test cannot see — a field below the fold, a button that spins for ever, a
message that blames the wrong thing — and every one of them was found by
somebody driving the form rather than by a suite going green.

---

## Before you start

```bash
docker-compose up -d          # postgres, redis, mailhog
pnpm dev                      # the whole stack
```

Then check three things, because each fails silently and each wastes the walk:

| Check | How | If it is wrong |
|---|---|---|
| A notice is approved | Portal → **Consent notices** shows nothing pending | Approve `CLAIM_PROCESSING`; without it *no* claim can be opened on any channel |
| `HANDLING_FIRM_TENANT_ID` is set | It is in the root `.env` | Case creation fails the moment consent is given |
| You can read the OTP | Dev returns the code in the response; otherwise `SELECT code FROM otp_codes ORDER BY "createdAt" DESC LIMIT 1;` | You cannot get past the second screen |

Use a **fresh mobile number each run** (`+6019` and eight digits). Reusing one
resumes the previous conversation, which is a different test.

---

## The golden path — flight delay

Open `http://localhost:4301/form`.

| # | Do | Expect |
|---|---|---|
| 1 | Read the first screen | Two columns on a desktop: the headline and number field left, **Have these ready** right. On a phone the card is below. The copy says the code arrives **on WhatsApp** — never "we text you" |
| 2 | Enter the number, **Send code** | Six-box code screen. The number is echoed back |
| 3 | Enter the code | The privacy notice, shown **in full** and version-stamped |
| 4 | **I agree** | The five claim types |
| 5 | **Flight delay** | *You and your trip*. Section list on the left with **Claim type** ticked; the rail on the right already shows *Type of claim* |
| 6 | Fill in name, trip dates, destination (tap a chip), incident date. **Leave the policy number empty** | Moves to *What happened*. The rail fills in with **formatted** values — "12 August 2026", "Japan", not raw codes |
| 7 | Airline (type and tap the chip), flight number, both departures | Moves to *Evidence* |
| 8 | Attach a photo to each document field | Each shows its filename |
| 9 | **Continue** | *Where should we pay?* |
| 10 | Bank (chip), account number, account holder | *Check and submit* |
| 11 | Read the review | Every section as a card, one row per answer, **Change** on each. The bank account is **masked** (`····2201`). Claim type is shown with **no** Change link |
| 12 | **Submit claim request** with the box unticked | The button is disabled. Nothing happens |
| 13 | Tick the box, submit | *Your claim request is in*, with the reference. No "track this claim", no PDF |
| 14 | Open the portal as `adjuster@pacific.com` | The case is in **Submitted**, channel **Web form** |

**Step 6 is the one that matters most.** Leaving the policy number empty is not
tidiness — an optional field the claimant never touches has to be skipped
explicitly, and when that broke, the flow silently never reached Review and
Submit appeared to do nothing.

---

## The things that have actually broken

Each of these was a real defect. Walk them.

### A correction at review

On the review page, **Change** a date to something impossible — a trip that
ends before it starts.

- The bot's own words appear **under that field**, not as a banner.
- Nothing else on the page changes.
- Fix it, **Save**, and the row updates.

*Why:* the client must not invent its own validation messages. The server knows
why, and a second, vaguer description of the same rule is how the two drift.

### A whole section at speed

Fill a section using autofill or paste, and press Continue immediately.

- It saves. No error mentioning a field you did not touch.

*Why:* there are **two** rate limits — the edge throttle (3 requests a second)
and the conversation cap (60 a minute). A six-field section is nine requests,
because each field the server's cursor is not on costs a move and an answer.
When this broke, three answers saved and the fourth threw, leaving half a
section and an error naming nothing.

### Reload in the middle

Refresh the browser mid-section.

- Everything already saved is still there. Anything typed but not submitted is
  gone, which is correct — unsent values live only in the page.

### Two surfaces, one browser

Open `/chat` in another tab and start a conversation there. Then on `/form`,
press **Start again** and confirm.

- The form resets. **The chat is untouched.**

*Why:* they are separate channels with separate session keys. Sharing one would
put the separation in the database and not in the browser, and clearing either
would strand the other.

### On a phone

Repeat the golden path at 390px.

- The section list becomes **Step 3 of 6 · What happened** with a progress bar.
- Two-column field pairs stack.
- The rail is gone; Review does its job.
- Every tap target is comfortable, and the camera opens *and* the gallery is
  reachable — a claimant's evidence is usually a photo they already took.

---

## What is deliberately not here

- **No handover screen.** The form is submit-only: take-over is refused on a
  `WEB_FORM` conversation and a bare "human" in a field is treated as text. If
  you find a way to put the form into handover, that is a bug in those guards.
- **No claim-status page**, no PDF, no email. Staff follow up on WhatsApp, on
  the number the claimant verified.
- **No Malay questions.** The EN · BM switch works and carries the language to
  the server; the flow wording has not been translated, so the questions stay
  English. Buttons and headings follow `form-copy.ts` where a translation
  exists.
