#!/usr/bin/env python3
"""Build a single self-contained, print-ready HTML report from the markdown source."""
import subprocess, pathlib, re, sys

REPO = pathlib.Path("/Users/barcovepro/Code/true-claim-insight")
SRC = REPO / "docs/MARKET_RESEARCH_TPA_REVENUE.md"
OUT = REPO / "docs/TCI-Market-Assessment-Rev7.html"

body = subprocess.run(
    ["pandoc", str(SRC), "-f", "gfm", "-t", "html5"],
    capture_output=True, text=True, check=True).stdout

# Drop the markdown title block — the cover carries it.
body = re.sub(r"^<h1.*?</h1>", "", body, count=1, flags=re.S)
body = re.sub(r"^\s*<p><strong>Confidential.*?</p>", "", body, count=1, flags=re.S)
body = re.sub(r"^\s*<table>.*?</table>", "", body, count=1, flags=re.S)
body = re.sub(r"^\s*<hr />", "", body, count=1)

CSS = r"""
:root{
  --ink:#0A2540; --accent:#0E9F9F; --accent-d:#0E7C86;
  --body:#26333F; --muted:#5D7183; --line:#E2EAF0; --soft:#F7FAFC;
}
*{box-sizing:border-box}
html{background:#EDF1F5}
body{
  margin:0; color:var(--body);
  font-family:"Avenir Next","Helvetica Neue",Helvetica,Arial,sans-serif;
  font-size:9.5pt; line-height:1.55; -webkit-font-smoothing:antialiased;
}

/* ---------- screen shell ---------- */
.sheet{
  background:#fff; width:210mm; min-height:297mm; margin:8mm auto;
  padding:18mm 18mm 20mm; box-shadow:0 2px 18px rgba(10,37,64,.13);
}
.banner{
  max-width:210mm; margin:10mm auto 0; padding:12px 16px; border-radius:8px;
  background:#0A2540; color:#CFE3EC; font-size:9.5pt; line-height:1.55;
}
.banner b{color:#7FD4D4}
.banner code{background:rgba(255,255,255,.12); color:#fff; padding:1px 5px; border-radius:3px}

/* ---------- cover ---------- */
.cover{
  position:relative; overflow:hidden; background:var(--ink); color:#fff;
  width:210mm; height:297mm; margin:8mm auto; padding:26mm 22mm;
  box-shadow:0 2px 18px rgba(10,37,64,.13);
}
.cover .glow{
  position:absolute; top:-55mm; right:-75mm; width:185mm; height:185mm; border-radius:50%;
  background:radial-gradient(circle at 38% 38%,rgba(14,159,159,.50) 0%,rgba(14,159,159,.10) 46%,rgba(10,37,64,0) 70%);
}
.cover .wordmark{position:relative;font-size:8.5pt;letter-spacing:.34em;text-transform:uppercase;color:#7FD4D4;font-weight:600}
.cover .wordmark b{color:#fff}
.cover h1{position:relative;margin:44mm 0 0;font-size:34pt;line-height:1.1;font-weight:600;letter-spacing:-.015em;max-width:145mm}
.cover .sub{position:relative;margin-top:7mm;font-size:13.5pt;line-height:1.35;color:#A8C4D8;max-width:138mm}
.cover .bars{position:relative;margin:9mm 0 0 -22mm}
.cover .bars i{display:block;height:3mm;background:var(--accent);margin-bottom:2.2mm;border-radius:0 2mm 2mm 0}
.cover .bars i:nth-child(1){width:52mm}
.cover .bars i:nth-child(2){width:36mm;opacity:.62}
.cover .bars i:nth-child(3){width:24mm;opacity:.34}
.cover .lede{position:relative;margin-top:22mm;font-size:10pt;line-height:1.62;color:#C8DAE7;max-width:130mm}
.cover .lede b{color:#fff;font-weight:600}
.cover .foot{position:absolute;left:22mm;right:22mm;bottom:20mm}
.cover .meta{border-top:.4mm solid rgba(255,255,255,.20);padding-top:7mm}
.cover .meta table{width:100%;border-collapse:collapse}
.cover .meta td{vertical-align:top;padding:0 10mm 0 0;width:33.3%}
.cover .k{display:block;margin-bottom:2mm;font-size:6.8pt;letter-spacing:.18em;text-transform:uppercase;color:#6E93AE;font-weight:600}
.cover .v{font-size:9.5pt;color:#EAF3F8;line-height:1.5}
.cover .pill{display:inline-block;margin-top:12mm;padding:2.6mm 7mm;border:.35mm solid var(--accent);
  border-radius:8mm;font-size:7.2pt;letter-spacing:.2em;text-transform:uppercase;color:#7FD4D4;font-weight:600;white-space:nowrap}

/* ---------- typography ---------- */
h2{font-size:14.5pt;font-weight:600;letter-spacing:-.01em;color:var(--ink);
   margin:20pt 0 10pt;padding-bottom:7pt;border-bottom:1.6pt solid var(--accent);
   break-after:avoid;page-break-after:avoid}
h2:first-child{margin-top:0}
h3{font-size:10.5pt;font-weight:600;color:var(--accent-d);margin:14pt 0 6pt;break-after:avoid;page-break-after:avoid}
h4{font-size:10pt;font-weight:600;color:var(--ink);margin:12pt 0 5pt}
p{margin:0 0 7pt;orphans:3;widows:3}
strong{color:var(--ink);font-weight:600}
em{color:#47596B}
ul,ol{margin:0 0 10pt;padding-left:17pt}
li{margin-bottom:4pt}
hr{border:none;border-top:.5pt solid var(--line);margin:20pt 0}
a{color:var(--accent-d);text-decoration:none;word-break:break-word}
code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:8.6pt;background:#EEF4F7;color:#0A4D57;padding:1px 4px;border-radius:3px}

/* ---------- tables ---------- */
table{width:100%;border-collapse:collapse;margin:8pt 0 12pt;font-size:8.2pt;line-height:1.42}
thead th{background:var(--ink);color:#fff;font-weight:600;font-size:8.2pt;text-align:left;padding:6pt 7pt}
tbody td{padding:5.5pt 7pt;border-bottom:.4pt solid var(--line);vertical-align:top}
tbody tr:nth-child(odd){background:var(--soft)}
tbody tr:last-child td{border-bottom:.8pt solid #C9D8E3}
tr{break-inside:avoid;page-break-inside:avoid}

/* ---------- callouts ---------- */
blockquote{margin:12pt 0 15pt;padding:11pt 14pt;background:#F2F8F9;border-left:2.6pt solid var(--accent);
  border-radius:0 3px 3px 0;font-size:9.2pt;color:#34485A;break-inside:avoid;page-break-inside:avoid}
blockquote p:last-child{margin-bottom:0}

/* ---------- print ---------- */
@page{size:A4;margin:15mm 15mm 17mm}
@page :first{margin:0}
@media print{
  html{background:#fff}
  .banner{display:none}
  .cover{width:auto;height:100vh;margin:0;box-shadow:none;
         break-after:page;page-break-after:always;
         -webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}
  thead th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tbody tr:nth-child(odd),blockquote{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h2{break-after:avoid}
}
"""

COVER = """
<section class="cover">
  <div class="glow"></div>
  <div class="wordmark">True&nbsp;Claim&nbsp;<b>Insight</b></div>
  <h1>Market &amp; Financial Assessment</h1>
  <div class="sub">Malaysian non-motor and Group&nbsp;/&nbsp;Travel PA claims adjusting</div>
  <div class="bars"><i></i><i></i><i></i></div>
  <div class="lede">
    Market sizing, fee structures, full cost base and risk assessment for a
    claims-administration and <b>BNM-registered loss adjusting</b> business across
    fire and property, engineering, liability, marine and <b>travel insurance</b> claims.
  </div>
  <div class="foot">
    <div class="meta"><table><tr>
      <td><span class="k">Version</span><span class="v">Rev 7 &middot; 30 July 2026<br>Draft for partner discussion</span></td>
      <td><span class="k">Prepared by</span><span class="v">Leo<br>Technical lead, True Claim Insight</span></td>
      <td><span class="k">Data currency</span><span class="v">PIAM FY2025 full-year results<br>DOSM flood report 2025</span></td>
    </tr></table></div>
    <div class="pill">Confidential &mdash; not for circulation</div>
  </div>
</section>
"""

BANNER = """
<div class="banner">
  <b>To save as PDF:</b> press <code>&#8984;P</code> &rarr; Destination <b>Save as PDF</b> &rarr;
  Paper <b>A4</b> &rarr; open <b>More settings</b> and tick <b>Background graphics</b>
  (without it the navy cover and table headers print white).
  Tick <b>Headers and footers</b> if you want page numbers. This banner does not print.
</div>
"""

html = f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Market &amp; Financial Assessment — True Claim Insight (Rev 7)</title>
<style>{CSS}</style>
</head><body>
{BANNER}
{COVER}
<main class="sheet">
{body}
</main>
</body></html>
"""

OUT.write_text(html, encoding="utf-8")
print(f"Built: {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")
