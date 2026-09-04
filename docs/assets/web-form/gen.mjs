import { writeFileSync } from 'node:fs';

const P = '#0b7450', BG = '#f8fafc', FG = '#020817', MU = '#f1f5f9', MF = '#64748b', BD = '#e2e8f0', ERR = '#ef4444', TINT = '#e6f4ee';
const ck = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`;
const cam = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>`;
const up = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>`;
const cal = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`;
const search = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const shield = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`;
const clock = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
const phone = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>`;
const menu = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
const agent = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
const bigCheck = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`;

const SECTIONS = ['Claim type', 'You &amp; your trip', 'What happened', 'Evidence', 'Payout', 'Review'];

const head = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; color: ${FG}; }
    a { color: ${P}; } a:hover { color: #085a3f; }
  </style>
</helmet>`;
const tail = `</x-dc>
</body>
</html>
`;

// ---------- shared pieces
const logo = `<div style="display: flex; align-items: center; gap: 10px;">
  <div style="width: 34px; height: 34px; border-radius: 10px; background: ${P}; display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 12px; font-weight: 700;">TCI</div>
  <div style="display: flex; flex-direction: column;"><span style="font-size: 14px; font-weight: 600; line-height: 1.2;">Travel Claims</span><span style="font-size: 11px; color: ${MF};">assessed by True Claim Insight</span></div>
</div>`;

const siteNav = (wide, ref) => wide ? `
<header style="display: flex; align-items: center; gap: 24px; height: 64px; padding: 0 64px; border-bottom: 1px solid ${BD}; background: #ffffff;">
  ${logo}
  <span style="flex-grow: 1;"></span>
  ${ref ? `<span style="font-size: 13px; color: ${MF};">Ref <strong style="color: ${FG}; font-weight: 600;">${ref}</strong></span>` : ''}
  <button style="height: 34px; padding: 0 12px; border-radius: 999px; border: 1px solid ${BD}; background: #ffffff; font-size: 13px; color: ${MF};">EN · BM</button>
</header>` : `
<header style="display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 16px; border-bottom: 1px solid ${BD}; background: #ffffff;">
  ${logo}
  <span style="flex-grow: 1;"></span>
  <button style="height: 32px; padding: 0 10px; border-radius: 999px; border: 1px solid ${BD}; background: #ffffff; font-size: 12px; color: ${MF};">EN · BM</button>
  <span style="display: flex; color: ${FG};">${menu}</span>
</header>`;

const footer = (wide) => `
<footer style="display: flex; ${wide ? 'align-items: center; justify-content: space-between; padding: 20px 64px;' : 'flex-direction: column; gap: 8px; padding: 20px 16px;'} border-top: 1px solid ${BD}; background: #ffffff; font-size: 12px; color: ${MF};">
  <span>Personal data is handled under the <a href="#">PDPA notice</a>. Parts of the assessment use AI; a person makes the decision.</span>
  <span>© 2026 True Claim Insight Sdn Bhd</span>
</footer>`;

const field = (label, control, hint, err) => `
<div style="display: flex; flex-direction: column; gap: 6px;">
  <label style="font-size: 13px; font-weight: 600;">${label}</label>
  ${control}
  ${err ? `<p style="margin: 0; font-size: 12px; color: ${ERR};">${err}</p>` : hint ? `<p style="margin: 0; font-size: 12px; color: ${MF}; line-height: 1.4;">${hint}</p>` : ''}
</div>`;

const input = (v, ph, extra = '', prefix = '') => `
<div style="display: flex; align-items: center; height: 46px; border: 1px solid ${extra.includes('error') ? ERR : BD}; border-radius: 10px; background: #ffffff; padding: 0 14px; gap: 8px; font-size: 15px;">
  ${prefix ? `<span style="color: ${MF}; font-weight: 500;">${prefix}</span>` : ''}
  <span style="flex-grow: 1; color: ${v ? FG : '#94a3b8'};">${v || ph}</span>
  ${extra.includes('cal') ? `<span style="color: ${MF}; display: flex;">${cal}</span>` : ''}
  ${extra.includes('search') ? `<span style="color: ${MF}; display: flex;">${search}</span>` : ''}
</div>`;

const chip = (label, on) => `<button style="height: 38px; padding: 0 14px; border-radius: 999px; border: 1px solid ${on ? P : BD}; background: ${on ? TINT : '#ffffff'}; color: ${on ? P : FG}; font-size: 14px; font-weight: ${on ? 600 : 400};">${label}</button>`;
const radio = (l, on) => `
  <div style="display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 0 14px; border-radius: 10px; border: 1px solid ${on ? P : BD}; background: ${on ? TINT : '#ffffff'};">
    <span style="width: 18px; height: 18px; border-radius: 999px; border: 2px solid ${on ? P : '#cbd5e1'}; background: ${on ? P : '#ffffff'}; display: flex; align-items: center; justify-content: center; color: #ffffff; flex-shrink: 0;">${on ? ck : ''}</span>
    <span style="font-size: 15px; font-weight: ${on ? 600 : 400};">${l}</span>
  </div>`;
const btnPrimary = (l, grow = false) => `<button style="height: 46px; padding: 0 28px; ${grow ? 'flex-grow: 1;' : ''} border-radius: 999px; border: none; background: ${P}; color: #ffffff; font-size: 14px; font-weight: 600;">${l}</button>`;
const btnGhost = (l) => `<button style="height: 46px; padding: 0 20px; border-radius: 999px; border: 1px solid ${BD}; background: #ffffff; font-size: 14px; color: ${MF};">${l}</button>`;

const sectionList = (active) => `
<aside style="display: flex; flex-direction: column; gap: 2px;">
  ${SECTIONS.map((s, i) => `<div style="display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border-radius: 10px; background: ${i === active ? TINT : 'transparent'};">
    <span style="width: 22px; height: 22px; border-radius: 999px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; background: ${i < active ? P : i === active ? '#ffffff' : MU}; color: ${i < active ? '#ffffff' : i === active ? P : MF}; border: ${i === active ? '2px solid ' + P : 'none'};">${i < active ? ck : i + 1}</span>
    <span style="font-size: 14px; font-weight: ${i === active ? 600 : 400}; color: ${i <= active ? FG : MF};">${s}</span>
  </div>`).join('')}
  <div style="display: flex; align-items: center; gap: 8px; margin-top: 16px; padding: 12px; border-radius: 10px; border: 1px dashed ${BD}; color: ${MF}; font-size: 12px; line-height: 1.4;"><span style="display: flex; color: ${P}; flex-shrink: 0;">${phone}</span>Prefer to chat? The same questions are asked on <a href="#" style="margin-left: 4px;">WhatsApp</a></div>
</aside>`;

const railRow = (k, v) => `<div style="display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-bottom: 1px solid ${BD};"><span style="font-size: 11px; color: ${MF};">${k}</span><span style="font-size: 13px; font-weight: 500;">${v}</span></div>`;
const rail = (rows) => `
<aside style="display: flex; flex-direction: column; gap: 2px; align-self: start; padding: 16px 18px; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff;">
  <h3 style="margin: 0 0 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: ${MF};">Your claim so far</h3>
  ${rows.map(([k, v]) => railRow(k, v)).join('')}
  <p style="margin: 10px 0 0; font-size: 12px; color: ${MF}; line-height: 1.45;">Saved after each step. Come back any time with the same mobile number.</p>
</aside>`;

const stepBar = (active) => `
<div style="display: flex; flex-direction: column; gap: 8px; padding: 14px 16px 0;">
  <div style="display: flex; justify-content: space-between; font-size: 12px; color: ${MF};"><span style="font-weight: 600; color: ${P};">Step ${active + 1} of 6 · ${SECTIONS[active]}</span><span>${active < 5 ? 'Next: ' + SECTIONS[active + 1] : 'Last step'}</span></div>
  <div style="display: flex; gap: 4px;">${SECTIONS.map((_, i) => `<div style="height: 4px; flex-grow: 1; border-radius: 999px; background: ${i <= active ? P : BD};"></div>`).join('')}</div>
</div>`;

// Desktop form page: nav + [sections | form | rail] + footer
const page = (active, h2, sub, body, actions, railRows, minH = 900) => `${head}
<div style="width: 1440px; min-height: ${minH}px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true, 'TC-2026-004812')}
<div style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 40px; padding: 40px 64px 56px; flex-grow: 1;">
  <div style="grid-column: span 3;">${sectionList(active)}</div>
  <main style="grid-column: span 6; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <h2 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em;">${h2}</h2>
      ${sub ? `<p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.45;">${sub}</p>` : ''}
    </div>
    ${body}
    <div style="display: flex; gap: 10px; justify-content: flex-end; padding-top: 8px; border-top: 1px solid ${BD}; margin-top: 8px; padding-top: 20px;">${actions}</div>
  </main>
  <div style="grid-column: span 3;">${rail(railRows)}</div>
</div>
${footer(true)}
</div>
${tail}`;

// Phone-browser form page: nav + step bar + form + sticky actions + footer
const phonePage = (active, h2, sub, body, actions, minH = 844) => `${head}
<div style="width: 390px; min-height: ${minH}px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(false)}
${stepBar(active)}
<main style="display: flex; flex-direction: column; gap: 18px; padding: 20px 16px 24px; flex-grow: 1;">
  <div style="display: flex; flex-direction: column; gap: 4px;">
    <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2;">${h2}</h2>
    ${sub ? `<p style="margin: 0; font-size: 14px; color: ${MF}; line-height: 1.45;">${sub}</p>` : ''}
  </div>
  ${body}
</main>
<div style="display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid ${BD}; background: #ffffff;">${actions}</div>
${footer(false)}
</div>
${tail}`;


const claimTypeBody = (wide) => `
<div style="display: grid; grid-template-columns: repeat(${wide ? 2 : 1}, minmax(0, 1fr)); gap: 10px;">
${[['Flight delay', 'Delayed, cancelled or missed connection', true], ['Luggage damaged', 'Bag or contents damaged in transit'], ['Luggage lost', 'Bag not returned by the airline'], ['Trip cancelled', 'Illness, bereavement, disaster or other reason'], ['Medical treatment overseas', 'Hospital or clinic bills abroad']].map(([l, d, on]) => `
  <div style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 12px; border: 1px solid ${on ? P : BD}; background: ${on ? TINT : '#ffffff'};">
    <span style="width: 18px; height: 18px; margin-top: 2px; border-radius: 999px; border: 2px solid ${on ? P : '#cbd5e1'}; background: ${on ? P : '#ffffff'}; display: flex; align-items: center; justify-content: center; color: #ffffff; flex-shrink: 0;">${on ? ck : ''}</span>
    <div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 15px; font-weight: ${on ? 600 : 500};">${l}</span><span style="font-size: 13px; color: ${MF};">${d}</span></div>
  </div>`).join('')}
</div>
<p style="margin: 0; font-size: 13px; color: ${MF}; line-height: 1.45;">Something else happened on your trip? Message us on WhatsApp and a member of the team will help.</p>`;

const youTripBody = (wide) => `
${field('Full name', input('Nur Aisyah binti Rahman', 'Your name as on your IC or passport'), 'It must match the name on your documents and your bank account.')}
${field('Policy number', input('TC-8827-3341-09', 'e.g. TC-1234-5678-90'), 'On your policy schedule or the confirmation email from your insurer.')}
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${wide ? 16 : 12}px;">
  ${field('Trip start', input('12/08/2026', 'dd/mm/yyyy', 'cal'))}
  ${field('Trip end', input('19/08/2026', 'dd/mm/yyyy', 'cal'))}
</div>
${field('Destination', input('Japan', 'Search a country', 'search'), 'Tap a common destination, or type the country name if it is not listed.')}
<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: -8px;">
  ${chip('Singapore')}${chip('Thailand')}${chip('Indonesia')}${chip('Japan', true)}${chip('Vietnam')}${chip('Australia')}${chip('South Korea')}${chip('China')}
</div>
${field('When did the incident happen?', input('14/08/2026, 12:30', 'dd/mm/yyyy, hh:mm', 'cal'), 'The date and approximate time.')}`;

const mobileBody = (wide) => `
<div style="display: grid; grid-template-columns: repeat(${wide ? 2 : 1}, minmax(0, 1fr)); gap: 16px;">
  ${field('Mobile number', input('12 345 6789', '12 345 6789', '', '+60'), 'We send a 6-digit code to this number on WhatsApp.')}
</div>
<div style="display: flex; gap: 10px; padding: 12px 14px; border-radius: 10px; background: #ffffff; border: 1px solid ${BD};">
  <span style="color: ${P}; display: flex; margin-top: 1px;">${clock}</span>
  <p style="margin: 0; font-size: 13px; line-height: 1.45;">Your number is how you come back to this form. Started already? Enter the same number and we pick up where you left off.</p>
</div>`;

const codeBody = (wide) => `
${field('Enter the 6-digit code', `<div style="display: flex; gap: 8px;">${['4','8','2','','',''].map((d, i) => `<div style="width: ${wide ? 52 : 46}px; height: 56px; border-radius: 10px; border: 1px solid ${i === 3 ? P : BD}; background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;">${d}</div>`).join('')}</div>`, 'Sent on WhatsApp to +60 12 345 6789. <a href="#">Wrong number?</a>')}
<p style="margin: 0; font-size: 13px; color: ${MF};">Did not get it? <a href="#">Send again</a> in 0:42.</p>`;

const consentBody = (wide) => `
<div style="display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff;">
  <h3 style="margin: 0; font-size: 15px; font-weight: 600;">Personal Data Protection Notice — Claims Processing</h3>
  <p style="margin: 0; font-size: 14px; line-height: 1.55;">[APPROVED PDPA NOTICE TEXT, VERSION-STAMPED — shown exactly as approved by the compliance officer. Agreement is recorded against this wording.]</p>
  <p style="margin: 0; font-size: 14px; line-height: 1.55; color: ${MF};">It covers: what is collected and why, who it is shared with (your insurer and the adjusting firm), that some processing uses AI and happens outside Malaysia, how long it is kept, and how to withdraw consent.</p>
</div>
<div style="display: flex; flex-direction: column; gap: 8px;">
  <div style="display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 0 14px; border-radius: 10px; border: 1px solid ${P}; background: ${TINT};"><span style="width: 18px; height: 18px; border-radius: 999px; background: ${P}; display: flex; align-items: center; justify-content: center; color: #ffffff;">${ck}</span><span style="font-size: 15px; font-weight: 600;">I agree</span></div>
  <div style="display: flex; align-items: center; gap: 12px; min-height: 50px; padding: 0 14px; border-radius: 10px; border: 1px solid ${BD}; background: #ffffff;"><span style="width: 18px; height: 18px; border-radius: 999px; border: 2px solid #cbd5e1; background: #ffffff;"></span><span style="font-size: 15px;">I do not agree</span></div>
</div>
<p style="margin: 0; font-size: 12px; color: ${MF}; line-height: 1.45;">If you do not agree, no claim is opened and nothing you entered is kept.</p>`;

// ---------- content blocks (shared by both widths; `wide` picks grid columns)
const youBody = (wide) => `
${field('Full name', input('Nur Aisyah binti Rahman', 'Your name as on your IC or passport'))}
<div style="display: grid; grid-template-columns: repeat(${wide ? 2 : 1}, minmax(0, 1fr)); gap: 16px;">
  ${field('Mobile number', input('12 345 6789', '12 345 6789', '', '+60'), 'We send a 6-digit code to this number on WhatsApp. It also lets you come back to this form later.')}
</div>
<div style="display: flex; gap: 10px; padding: 12px 14px; border-radius: 10px; background: #ffffff; border: 1px solid ${BD};">
  <span style="color: ${P}; display: flex; margin-top: 1px;">${shield}</span>
  <p style="margin: 0; font-size: 13px; line-height: 1.45;">By continuing you agree to your details being used to assess this claim under the <a href="#">PDPA notice</a>.</p>
</div>`;

const tripBody = (wide) => `
${field('Policy number', input('TC-8827-3341-09', 'e.g. TC-1234-5678-90'), 'On your policy schedule or the confirmation email from your insurer.')}
<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${wide ? 16 : 12}px;">
  ${field('Trip start', input('12/08/2026', 'dd/mm/yyyy', 'cal'))}
  ${field('Trip end', input('19/08/2026', 'dd/mm/yyyy', 'cal'))}
</div>
${field('Destination', input('Japan', 'Search a country', 'search'), 'Tap a common destination, or type the country name if it is not listed.')}
<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: -8px;">
  ${chip('Singapore')}${chip('Thailand')}${chip('Indonesia')}${chip('Japan', true)}${chip('Vietnam')}${chip('Australia')}${chip('South Korea')}${chip('China')}
</div>`;

const happenedBody = (wide) => `
<div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: ${MF};"><span style="padding: 4px 10px; border-radius: 999px; background: ${TINT}; color: ${P}; font-weight: 600;">Flight delay</span>Questions for this type of claim only.</div>
<div style="display: grid; grid-template-columns: repeat(${wide ? 2 : 1}, minmax(0, 1fr)); gap: 16px;">
  ${field('Airline', input('Malaysia Airlines', 'Search airline', 'search'))}
  ${field('Flight number', input('MH88', 'e.g. MH168 or AK6042'), 'The letters and numbers on your boarding pass.')}
  ${field('Scheduled departure', input('14/08/2026, 09:40', 'dd/mm/yyyy, hh:mm', 'cal'))}
  ${field('Actual departure', input('', 'dd/mm/yyyy, hh:mm', 'cal error'), '', 'Please enter when the flight actually left, or when it was cancelled.')}
</div>`;

const docRow = (name, status, req) => `
<div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; border: 1px solid ${BD}; background: #ffffff;">
  <div style="width: 44px; height: 44px; border-radius: 8px; background: ${status === 'done' ? TINT : MU}; display: flex; align-items: center; justify-content: center; color: ${status === 'done' ? P : MF}; flex-shrink: 0;">${status === 'done' ? ck : up}</div>
  <div style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;">
    <span style="font-size: 14px; font-weight: 600;">${name}</span>
    <span style="font-size: 12px; color: ${status === 'done' ? P : MF};">${status === 'done' ? 'Uploaded · boarding-pass.jpg' : req ? 'Required' : 'Optional'}</span>
  </div>
  <button style="height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid ${status === 'done' ? BD : P}; background: #ffffff; color: ${status === 'done' ? MF : P}; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; flex-shrink: 0;">${status === 'done' ? 'Replace' : cam + ' Add'}</button>
</div>`;
const evidenceBody = (wide) => `
<div style="display: flex; flex-direction: column; gap: 10px;">
  ${docRow('Boarding pass', 'done', true)}
  ${docRow('Airline delay confirmation', 'todo', true)}
  ${docRow('Flight itinerary', 'todo', false)}
</div>
${wide ? `<div style="display: flex; align-items: center; justify-content: center; gap: 10px; height: 88px; border-radius: 10px; border: 1px dashed #cbd5e1; color: ${MF}; font-size: 13px;"><span style="display: flex;">${up}</span>Or drag files here — JPG, PNG, PDF up to 10 MB</div>` : `<p style="margin: 0; font-size: 12px; color: ${MF};">On a phone, “Add” opens your camera or photo library.</p>`}
<p style="margin: 0; font-size: 12px; color: ${MF}; line-height: 1.45;">Documents are read by an automated extractor to pre-fill your claim. An adjuster checks the result.</p>`;

const payoutBody = (wide) => `
${field('Bank', input('Maybank', 'Search bank', 'search'), 'Tap your bank below, or type its name if it is not listed.')}
<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: -8px;">
  ${chip('Maybank', true)}${chip('CIMB')}${chip('Public Bank')}${chip('RHB')}${chip('Hong Leong')}${chip('AmBank')}${chip('Bank Islam')}
</div>
<div style="display: grid; grid-template-columns: repeat(${wide ? 2 : 1}, minmax(0, 1fr)); gap: 16px;">
  ${field('Account number', input('114233892201', 'Numbers only'), 'Numbers only — no spaces or dashes.')}
  ${field('Account holder name', input('Nur Aisyah binti Rahman', ''), 'Exactly as registered with the bank.')}
</div>
<div style="padding: 12px 14px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a;">
  <p style="margin: 0; font-size: 13px; line-height: 1.45; color: #78350f;">If the account is in someone else’s name, give their name here — we will ask about it later. A name mismatch is the most common reason a payout is delayed.</p>
</div>`;

const row = (k, v) => `
<div style="display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 1px solid ${BD};">
  <div style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;">
    <span style="font-size: 12px; color: ${MF};">${k}</span>
    <span style="font-size: 14px; font-weight: 500; line-height: 1.35;">${v}</span>
  </div>
  <a href="#" style="font-size: 13px; font-weight: 500; text-decoration: none; flex-shrink: 0;">Change</a>
</div>`;
const group = (h, rows) => `
<div style="display: flex; flex-direction: column; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff; padding: 4px 16px;">
  <h3 style="margin: 0; padding: 10px 0 2px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: ${MF};">${h}</h3>
  ${rows}
</div>`;
const reviewBody = (wide) => `
<div style="display: flex; flex-direction: column; gap: 12px;">
${group('Claim type', row('Type of claim', 'Flight delay'))}
${group('You &amp; your trip', row('Full name', 'Nur Aisyah binti Rahman') + row('Policy number', 'TC-8827-3341-09') + row('Trip', '12–19 Aug 2026 · Japan') + row('Incident', '14 Aug 2026, 12:30'))}
${group('What happened', row('Flight', 'Malaysia Airlines MH88') + row('Scheduled departure', '14 Aug 2026, 09:40') + row('Actual departure', '14 Aug 2026, 16:05'))}
${group('Evidence', row('Boarding pass', 'boarding-pass.jpg') + row('Airline delay confirmation', 'delay-letter.pdf'))}
${group('Payout', row('Bank', 'Maybank · ····2201') + row('Account holder', 'Nur Aisyah binti Rahman'))}
</div>
<div style="display: flex; gap: 12px; padding: 14px; border-radius: 12px; border: 1px solid ${P}; background: ${TINT};">
  <span style="width: 22px; height: 22px; border-radius: 6px; background: ${P}; display: flex; align-items: center; justify-content: center; color: #ffffff; flex-shrink: 0; margin-top: 1px;">${ck}</span>
  <p style="margin: 0; font-size: 13px; line-height: 1.45;">I confirm the details above are true and complete to the best of my knowledge, and I understand a false statement may void this claim.</p>
</div>`;

const RAIL = {
  type: [['Mobile', '+60 12 345 6789 · verified']],
  you: [['Mobile', '+60 12 345 6789 · verified'], ['Type of claim', 'Flight delay']],
  happened: [['Mobile', '+60 12 345 6789 · verified'], ['Type of claim', 'Flight delay'], ['Name', 'Nur Aisyah binti Rahman'], ['Policy', 'TC-8827-3341-09'], ['Trip', '12–19 Aug 2026 · Japan'], ['Incident', '14 Aug 2026, 12:30']],
  evidence: [['Type of claim', 'Flight delay'], ['Name', 'Nur Aisyah binti Rahman'], ['Policy', 'TC-8827-3341-09'], ['Trip', '12–19 Aug 2026 · Japan'], ['Flight', 'Malaysia Airlines MH88'], ['Evidence', '1 of 2 required added']],
  payout: [['Type of claim', 'Flight delay'], ['Name', 'Nur Aisyah binti Rahman'], ['Policy', 'TC-8827-3341-09'], ['Trip', '12–19 Aug 2026 · Japan'], ['Flight', 'Malaysia Airlines MH88'], ['Evidence', '2 of 2 required added']],
  review: [['Type of claim', 'Flight delay'], ['Name', 'Nur Aisyah binti Rahman'], ['Policy', 'TC-8827-3341-09'], ['Trip', '12–19 Aug 2026 · Japan'], ['Flight', 'Malaysia Airlines MH88'], ['Evidence', '2 of 2 required added'], ['Payout', 'Maybank · ····2201']],
};


const prePage = (h2, sub, body, actions, wide, minH) => wide ? `${head}
<div style="width: 1440px; min-height: ${minH || 900}px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true)}
<div style="display: flex; justify-content: center; padding: 64px 64px 72px; flex-grow: 1;">
  <main style="width: 640px; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <span style="font-size: 12px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Before we start</span>
      <h2 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em;">${h2}</h2>
      ${sub ? `<p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.45;">${sub}</p>` : ''}
    </div>
    ${body}
    <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid ${BD}; margin-top: 8px; padding-top: 20px;">${actions}</div>
  </main>
</div>
${footer(true)}
</div>
${tail}` : `${head}
<div style="width: 390px; min-height: ${minH || 844}px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(false)}
<main style="display: flex; flex-direction: column; gap: 18px; padding: 28px 16px 24px; flex-grow: 1;">
  <div style="display: flex; flex-direction: column; gap: 4px;">
    <span style="font-size: 12px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Before we start</span>
    <h2 style="margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; line-height: 1.2;">${h2}</h2>
    ${sub ? `<p style="margin: 0; font-size: 14px; color: ${MF}; line-height: 1.45;">${sub}</p>` : ''}
  </div>
  ${body}
</main>
<div style="display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid ${BD}; background: #ffffff;">${actions}</div>
${footer(false)}
</div>
${tail}`;


const READY = ['Your policy number', 'Passport or IC', 'Boarding pass or itinerary', 'Airline letter, police report or receipts for what happened', 'Bank account for the payout'];
const readyList = () => READY.map(t => `<div style="display: flex; align-items: center; gap: 10px; font-size: 14px;"><span style="width: 20px; height: 20px; border-radius: 999px; background: ${TINT}; color: ${P}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${ck}</span>${t}</div>`).join('');
const readyCard = (wide) => `
<div style="display: flex; flex-direction: column; gap: 10px; padding: ${wide ? 24 : 18}px; border-radius: 14px; background: #ffffff; border: 1px solid ${BD}; align-self: start;">
  <h3 style="margin: 0 0 2px; font-size: 14px; font-weight: 600;">Have these ready</h3>
  ${readyList()}
  <p style="margin: 6px 0 0; font-size: 12px; color: ${MF}; line-height: 1.45;">Missing something? Start anyway — we save as you go, and you can come back with the same number to add documents.</p>
</div>`;
const entryForm = (wide) => `
${field('Mobile number', input('12 345 6789', '12 345 6789', '', '+60'), 'We send a 6-digit code to this number on WhatsApp. Started already? Enter the same number and we pick up where you left off.')}
<div style="display: flex; ${wide ? 'align-items: center; gap: 16px;' : 'flex-direction: column; gap: 10px;'}">
  ${btnPrimary('Send code', !wide)}
  <span style="font-size: 13px; color: ${MF}; ${wide ? '' : 'text-align: center;'}">Or message us on <a href="#">WhatsApp</a> or <a href="#">Telegram</a> — same questions, same team.</span>
</div>`;

const entryDesktop = `${head}
<div style="width: 1440px; min-height: 900px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true)}
<section style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 40px; padding: 72px 64px 72px; flex-grow: 1;">
  <div style="grid-column: 2 / span 6; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <span style="font-size: 13px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Travel insurance claims</span>
      <h1 style="margin: 0; font-size: 40px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; text-wrap: balance;">Make your travel claim online, in about ten minutes.</h1>
      <p style="margin: 0; font-size: 16px; color: ${MF}; line-height: 1.5; max-width: 560px;">Flight delays, lost or damaged luggage, cancelled trips and overseas medical bills. Six short steps, saved as you go.</p>
    </div>
    ${entryForm(true)}
  </div>
  <div style="grid-column: span 4;">${readyCard(true)}</div>
</section>
${footer(true)}
</div>
${tail}`;

const entryPhone = `${head}
<div style="width: 390px; min-height: 844px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(false)}
<section style="display: flex; flex-direction: column; gap: 18px; padding: 28px 16px 24px; flex-grow: 1;">
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <span style="font-size: 12px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Travel insurance claims</span>
    <h1 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; text-wrap: balance;">Make your travel claim online, in about ten minutes.</h1>
    <p style="margin: 0; font-size: 14px; color: ${MF}; line-height: 1.5;">Flight delays, lost or damaged luggage, cancelled trips and overseas medical bills. Six short steps, saved as you go.</p>
  </div>
  ${entryForm(false)}
  ${readyCard(false)}
</section>
${footer(false)}
</div>
${tail}`;

// ---------- Landing (desktop + phone)
const benefit = (icon, h, p) => `<div style="display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff;"><span style="display: flex; color: ${P};">${icon}</span><span style="font-size: 15px; font-weight: 600;">${h}</span><span style="font-size: 13px; color: ${MF}; line-height: 1.45;">${p}</span></div>`;
const landingDesktop = `${head}
<div style="width: 1440px; min-height: 900px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true)}
<section style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 40px; padding: 72px 64px 48px;">
  <div style="grid-column: span 7; display: flex; flex-direction: column; gap: 20px;">
    <span style="font-size: 13px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Travel insurance claims</span>
    <h1 style="margin: 0; font-size: 44px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; text-wrap: balance;">Make your travel claim online, in about ten minutes.</h1>
    <p style="margin: 0; font-size: 17px; color: ${MF}; line-height: 1.5; max-width: 560px;">Flight delays, lost or damaged luggage, cancelled trips and overseas medical bills. Tell us what happened, add your documents, and we do the rest — no branch visit, no phone queue.</p>
    <div style="display: flex; gap: 12px; align-items: center; margin-top: 8px;">
      ${btnPrimary('Start a claim')}
      <a href="#" style="font-size: 14px; font-weight: 500; text-decoration: none;">Continue a claim you started</a>
    </div>
    <p style="margin: 0; font-size: 13px; color: ${MF};">Or message us on <a href="#">WhatsApp</a> or <a href="#">Telegram</a> — same claim, same team.</p>
  </div>
  <div style="grid-column: span 5; display: flex; flex-direction: column; gap: 10px; padding: 24px; border-radius: 16px; background: #ffffff; border: 1px solid ${BD}; align-self: start;">
    <h3 style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">Have these ready</h3>
    ${['Your policy number', 'Passport or IC', 'Boarding pass or itinerary', 'Airline letter, police report or receipts for what happened', 'Bank account for the payout'].map(t => `<div style="display: flex; align-items: center; gap: 10px; font-size: 14px;"><span style="width: 20px; height: 20px; border-radius: 999px; background: ${TINT}; color: ${P}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${ck}</span>${t}</div>`).join('')}
    <p style="margin: 8px 0 0; font-size: 12px; color: ${MF}; line-height: 1.45;">Missing something? Start anyway — we save as you go, and you can come back with the same number to add documents.</p>
  </div>
</section>
<section style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; padding: 0 64px 72px;">
  ${benefit(clock, 'Saved as you go', 'Six short steps. Close the tab and come back on any device with your mobile number.')}
  ${benefit(phone, 'Works on your phone', 'Same website, no app to install. Photograph documents straight from the camera.')}
  ${benefit(shield, 'Clear on how it is assessed', 'Documents are read by software to pre-fill your claim. An adjuster reviews every decision.')}
</section>
${footer(true)}
</div>
${tail}`;

const landingPhone = `${head}
<div style="width: 390px; min-height: 844px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(false)}
<section style="display: flex; flex-direction: column; gap: 16px; padding: 32px 16px 24px;">
  <span style="font-size: 12px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Travel insurance claims</span>
  <h1 style="margin: 0; font-size: 30px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.15; text-wrap: balance;">Make your travel claim online, in about ten minutes.</h1>
  <p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.5;">Flight delays, lost or damaged luggage, cancelled trips and overseas medical bills. No branch visit, no phone queue.</p>
  <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
    ${btnPrimary('Start a claim', true)}
    <a href="#" style="font-size: 14px; font-weight: 500; text-decoration: none; text-align: center; padding: 8px;">Continue a claim you started</a>
  </div>
  <p style="margin: 0; font-size: 13px; color: ${MF}; text-align: center;">Or message us on <a href="#">WhatsApp</a> or <a href="#">Telegram</a>.</p>
</section>
<section style="display: flex; flex-direction: column; gap: 10px; margin: 0 16px 32px; padding: 18px; border-radius: 14px; background: #ffffff; border: 1px solid ${BD};">
  <h3 style="margin: 0 0 2px; font-size: 14px; font-weight: 600;">Have these ready</h3>
  ${['Your policy number', 'Passport or IC', 'Boarding pass or itinerary', 'Airline letter, police report or receipts', 'Bank account for the payout'].map(t => `<div style="display: flex; align-items: center; gap: 10px; font-size: 14px;"><span style="width: 20px; height: 20px; border-radius: 999px; background: ${TINT}; color: ${P}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${ck}</span>${t}</div>`).join('')}
</section>
${footer(false)}
</div>
${tail}`;

// ---------- Submitted
const submittedDesktop = `${head}
<div style="width: 1440px; min-height: 900px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true, 'TC-2026-004812')}
<section style="display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 96px 64px 72px; text-align: center;">
  <span style="width: 64px; height: 64px; border-radius: 999px; background: ${TINT}; color: ${P}; display: flex; align-items: center; justify-content: center;">${bigCheck}</span>
  <h1 style="margin: 0; font-size: 36px; font-weight: 700; letter-spacing: -0.02em;">Your claim request is submitted</h1>
  <p style="margin: 0; font-size: 16px; color: ${MF}; line-height: 1.5; max-width: 560px;">Reference <strong style="color: ${FG};">TC-2026-004812</strong>. We have sent it to +60 12 345 6789 on WhatsApp. To add documents later, come back to this site with the same number.</p>
  <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; width: 900px; margin-top: 24px; text-align: left;">
    ${[['1', 'Documents checked', 'Usually within one working day. We message you if anything is unclear.'], ['2', 'Assessment', 'An adjuster reviews the claim. Some claims need a short video call — we book it with you.'], ['3', 'Decision and payout', 'Paid to Maybank ····2201. You are told the outcome and the reasons either way.']].map(([n, h, p]) => `<div style="display: flex; flex-direction: column; gap: 8px; padding: 20px; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff;"><span style="width: 24px; height: 24px; border-radius: 999px; background: ${P}; color: #ffffff; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center;">${n}</span><span style="font-size: 15px; font-weight: 600;">${h}</span><span style="font-size: 13px; color: ${MF}; line-height: 1.45;">${p}</span></div>`).join('')}
  </div>
  <p style="margin: 16px 0 0; font-size: 14px; color: ${MF};">Something to add or change? <a href="#">Message our team</a>.</p>
</section>
${footer(true)}
</div>
${tail}`;


const submittedPhone = `${head}
<div style="width: 390px; min-height: 900px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(false)}
<section style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 40px 16px 24px; text-align: center; flex-grow: 1;">
  <span style="width: 56px; height: 56px; border-radius: 999px; background: ${TINT}; color: ${P}; display: flex; align-items: center; justify-content: center;">${bigCheck}</span>
  <h1 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.2;">Your claim request is submitted</h1>
  <p style="margin: 0; font-size: 14px; color: ${MF}; line-height: 1.5;">Reference <strong style="color: ${FG};">TC-2026-004812</strong>. We have sent it to +60 12 345 6789 on WhatsApp. To add documents later, come back with the same number.</p>
  <div style="display: flex; flex-direction: column; gap: 10px; width: 100%; text-align: left; margin-top: 8px;">
    ${[['1', 'Documents checked', 'Usually within one working day.'], ['2', 'Assessment', 'An adjuster reviews the claim. Some need a short video call.'], ['3', 'Decision and payout', 'Paid to Maybank ····2201, with the reasons either way.']].map(([n, h, t]) => `<div style="display: flex; gap: 12px; padding: 14px; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff;"><span style="width: 24px; height: 24px; border-radius: 999px; background: ${P}; color: #ffffff; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${n}</span><div style="display: flex; flex-direction: column; gap: 2px;"><span style="font-size: 14px; font-weight: 600;">${h}</span><span style="font-size: 13px; color: ${MF}; line-height: 1.45;">${t}</span></div></div>`).join('')}
  </div>
  <p style="margin: 8px 0 0; font-size: 13px; color: ${MF};">Something to add or change? <a href="#">Message our team</a>.</p>
</section>
${footer(false)}
</div>
${tail}`;

// ---------- write everything
const D = (name, html) => writeFileSync(name, html);
D('Main.dc.html', entryDesktop);
D('Code.dc.html', prePage('Check your messages', null, codeBody(true), btnGhost('Back') + btnPrimary('Confirm'), true));
D('Consent.dc.html', prePage('How your data is used', 'Please read this before you tell us about your claim.', consentBody(true), btnPrimary('Continue'), true));
D('ClaimType.dc.html', page(0, 'What do you want to claim for?', 'We only ask the questions this type of claim needs.', claimTypeBody(true), btnPrimary('Continue'), RAIL.type));
D('YouTrip.dc.html', page(1, 'You and your trip', null, youTripBody(true), btnGhost('Back') + btnPrimary('Continue'), RAIL.you, 1000));
D('WhatHappened.dc.html', page(2, 'What happened?', null, happenedBody(true), btnGhost('Back') + btnPrimary('Continue'), RAIL.happened));
D('Evidence.dc.html', page(3, 'Evidence for a flight delay', 'Photos are fine. You can add the rest later — come back to this site with the same number.', evidenceBody(true), btnGhost('Back') + btnPrimary('Continue'), RAIL.evidence));
D('Payout.dc.html', page(4, 'Where should we pay?', null, payoutBody(true), btnGhost('Back') + btnPrimary('Continue'), RAIL.payout));
D('Review.dc.html', page(5, 'Check and submit', 'Use Change on anything that is wrong.', reviewBody(true), btnGhost('Back') + btnPrimary('Submit claim request'), RAIL.review, 1360));
D('Submitted.dc.html', submittedDesktop);

D('PhoneEntry.dc.html', entryPhone);
D('PhoneCode.dc.html', prePage('Check your messages', null, codeBody(false), btnGhost('Back') + btnPrimary('Confirm', true), false));
D('PhoneConsent.dc.html', prePage('How your data is used', 'Please read this before you tell us about your claim.', consentBody(false), btnPrimary('Continue', true), false, 900));
D('PhoneClaimType.dc.html', phonePage(0, 'What do you want to claim for?', 'We only ask what this type of claim needs.', claimTypeBody(false), btnPrimary('Continue', true), 900));
D('PhoneYouTrip.dc.html', phonePage(1, 'You and your trip', null, youTripBody(false), btnGhost('Back') + btnPrimary('Continue', true), 1180));
D('PhoneEvidence.dc.html', phonePage(3, 'Evidence for a flight delay', 'Photos are fine. You can add the rest later with the same number.', evidenceBody(false), btnGhost('Back') + btnPrimary('Continue', true)));
D('PhoneWhatHappened.dc.html', phonePage(2, 'What happened?', null, happenedBody(false), btnGhost('Back') + btnPrimary('Continue', true), 1000));
D('PhonePayout.dc.html', phonePage(4, 'Where should we pay?', null, payoutBody(false), btnGhost('Back') + btnPrimary('Continue', true), 1060));
D('PhoneSubmitted.dc.html', submittedPhone);
D('PhoneReview.dc.html', phonePage(5, 'Check and submit', 'Use Change on anything that is wrong.', reviewBody(false), btnGhost('Back') + btnPrimary('Submit claim request', true), 1380));


// ===========================================================================
// AGENT-ASSISTED FLOW
// Same form, different door. The agent reaches these screens from a staff
// address behind the login they already have; the customer never can. What
// differs is only the two pre-claim screens and a band on every page — the
// six sections themselves are byte-identical to the customer's.
// ===========================================================================

const AMB = '#fffbeb', AMBD = '#fcd34d', AMBT = '#92400e';

const lock = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const userCheck = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline></svg>`;

// The band. Present on every assisted screen, absent from every customer one.
// Amber rather than the site green on purpose: it is a standing reminder that
// the person typing is not the person the data is about.
const band = (consent) => `
<div style="display: flex; align-items: center; gap: 16px; padding: 12px 64px; background: ${AMB}; border-bottom: 1px solid ${AMBD}; color: ${AMBT};">
  <span style="display: flex; flex-shrink: 0;">${userCheck}</span>
  <div style="display: flex; flex-direction: column; gap: 2px;">
    <span style="font-size: 13px; font-weight: 700;">Assisted claim &mdash; you are entering this for Nur Aisyah binti Rahman &middot; +60 12 345 6789</span>
    <span style="font-size: 12px;">${consent ? 'Verbal consent attested by you at 10:42 &middot; notice v3 (EN)' : 'Consent not yet recorded &mdash; no claim details can be entered'}</span>
  </div>
  <span style="flex-grow: 1;"></span>
  <span style="font-size: 12px; white-space: nowrap;">Faiz Rahman &middot; Pacific Adjusters &middot; <a href="#" style="color: ${AMBT};">Sign out</a></span>
</div>`;

// Desktop assisted form page = the customer page with the band inserted.
const agentPage = (active, h2, sub, body, actions, railRows, minH = 900) => `${head}
<div style="width: 1440px; min-height: ${minH}px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true, 'TC-2026-004812')}
${band(true)}
<div style="display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 40px; padding: 40px 64px 56px; flex-grow: 1;">
  <div style="grid-column: span 3;">${sectionList(active)}</div>
  <main style="grid-column: span 6; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <h2 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em;">${h2}</h2>
      ${sub ? `<p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.45;">${sub}</p>` : ''}
    </div>
    ${body}
    <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid ${BD}; margin-top: 8px; padding-top: 20px;">${actions}</div>
  </main>
  <div style="grid-column: span 3;">${rail(railRows)}</div>
</div>
${footer(true)}
</div>
${tail}`;

// Pre-claim assisted page: band, centred column, no section list (no case yet).
const agentPre = (eyebrow, h2, sub, body, actions, showBand, consent, minH = 900) => `${head}
<div style="width: 1440px; min-height: ${minH}px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true)}
${showBand ? band(consent) : ''}
<div style="display: flex; justify-content: center; padding: 56px 64px 72px; flex-grow: 1;">
  <main style="width: 640px; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <span style="font-size: 12px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">${eyebrow}</span>
      <h2 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em;">${h2}</h2>
      ${sub ? `<p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.45;">${sub}</p>` : ''}
    </div>
    ${body}
    <div style="display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid ${BD}; margin-top: 8px; padding-top: 20px;">${actions}</div>
  </main>
</div>
${footer(true)}
</div>
${tail}`;

const noteCard = (icon, text) => `
<div style="display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; border-radius: 12px; border: 1px solid ${BD}; background: #ffffff;">
  <span style="color: ${P}; display: flex; margin-top: 1px; flex-shrink: 0;">${icon}</span>
  <p style="margin: 0; font-size: 13px; line-height: 1.45;">${text}</p>
</div>`;

// --- 1. Staff access: their own mobile, a WhatsApp code, no password --------
// Deliberately the same mechanism the claimant uses. There is no password
// anywhere on this site, so there is no password to leak, reset or share; the
// firm registers which staff numbers may sign in, and the session is long
// enough that an agent meets these two screens about as often as they change
// phone. Never confusable with the claimant's own sign-in: this asks for the
// agent's number, and it lives at an address a claimant cannot open.
const staffShell = (h2, sub, body, actions) => `${head}
<div style="width: 1440px; min-height: 900px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true)}
<div style="display: flex; justify-content: center; padding: 88px 64px 72px; flex-grow: 1;">
  <main style="width: 440px; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <span style="font-size: 12px; font-weight: 600; color: ${P}; text-transform: uppercase; letter-spacing: 0.08em;">Staff access</span>
      <h2 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: -0.01em;">${h2}</h2>
      <p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.45;">${sub}</p>
    </div>
    <div style="display: flex; flex-direction: column; gap: 18px; padding: 24px; border-radius: 14px; border: 1px solid ${BD}; background: #ffffff;">
      ${body}
      ${actions}
    </div>
    ${noteCard(shield, 'Staff only. Claimants use the public form, where the code goes to <strong>their own</strong> mobile \u2014 these screens cannot be reached without a registered staff number.')}
  </main>
</div>
${footer(true)}
</div>
${tail}`;

const agentSignIn = staffShell(
  'Sign in with your mobile',
  'We send a code on WhatsApp to the number your firm registered for you. There is no password.',
  field('Your mobile number', input('+60 12 987 6543', ''), 'Yours, not the claimant\u2019s. <a href="#">Number changed?</a>'),
  btnPrimary('Send code', true));

const agentCode = staffShell(
  'Enter the code',
  'Sent on WhatsApp to +60 12 987 6543.',
  field('6-digit code', `<div style="display: flex; gap: 8px;">${['7','1','5','','',''].map((d, i) => `<div style="width: 52px; height: 56px; border-radius: 10px; border: 1px solid ${i === 3 ? P : BD}; background: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 600;">${d}</div>`).join('')}</div>`, 'Did not get it? <a href="#">Send again</a> in 0:42.')
    + `<div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 10px; background: ${TINT};">
    <span style="width: 18px; height: 18px; border-radius: 5px; border: 2px solid ${P}; background: ${P}; color: #ffffff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${ck}</span>
    <span style="font-size: 13px; line-height: 1.4;">Keep me signed in on this device for 30 days</span>
  </div>`,
  btnPrimary('Continue', true));

// --- 2. Who is this for -----------------------------------------------------
const lookupBody = `
<div style="display: flex; flex-direction: column; gap: 16px; padding: 24px; border-radius: 14px; border: 1px solid ${BD}; background: #ffffff;">
  ${field('Their mobile number', input('+60 12 345 6789', '', 'search'), 'The number on the policy. We do not send a code \u2014 you are signed in, so the code is not what identifies this claim.')}
  <div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; background: ${TINT}; border: 1px solid ${P};">
    <span style="width: 34px; height: 34px; border-radius: 999px; background: #ffffff; color: ${P}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${userCheck}</span>
    <div style="display: flex; flex-direction: column; gap: 1px;">
      <span style="font-size: 14px; font-weight: 600;">Nur Aisyah binti Rahman</span>
      <span style="font-size: 12px; color: ${MF};">Existing claimant &middot; IC \u00b7\u00b7\u00b7\u00b7 5555 &middot; 1 previous claim request</span>
    </div>
    <span style="flex-grow: 1;"></span>
    <span style="font-size: 12px; color: ${P}; font-weight: 600;">Found</span>
  </div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px;">
    ${field('Full name', input('Nur Aisyah binti Rahman', ''))}
    ${field('IC number', input('880101-14-5555', ''))}
  </div>
</div>
${noteCard(clock, 'Nothing is saved yet. The claim request is only created once you have recorded consent on the next screen.')}`;

const agentLookup = agentPre(
  'Assisted claim \u00b7 step 1 of 2',
  'Who are you filling this in for?',
  'Find them by the mobile number on the policy. If they are new, fill in the details and we will create the record.',
  lookupBody,
  btnGhost('Cancel') + btnPrimary('Continue'),
  false, false, 900);

// --- 3. Verbal consent declaration -----------------------------------------
const noticeBox = `
<div style="display: flex; flex-direction: column; gap: 10px; padding: 20px 22px; border-radius: 14px; border: 1px solid ${BD}; background: #ffffff; max-height: 240px; overflow: hidden;">
  <div style="display: flex; align-items: baseline; gap: 8px;">
    <h3 style="margin: 0; font-size: 15px; font-weight: 700;">How we handle your personal data</h3>
    <span style="font-size: 11px; color: ${MF};">Version 3 &middot; English &middot; approved 14 Jul 2026</span>
  </div>
  <p style="margin: 0; font-size: 13px; color: ${MF}; line-height: 1.6;">True Claim Insight Sdn Bhd assesses this claim on behalf of your insurer. We collect the details and documents you give us, together with your identification and bank details, so that we can verify and assess what happened. Parts of the assessment are carried out by automated tools; a person makes the decision. Some of our processors operate outside Malaysia&hellip;</p>
  <span style="font-size: 12px; color: ${P}; font-weight: 600;">Read the full notice aloud &rarr;</span>
</div>`;

const declarationBody = `
${noticeBox}
<div style="display: flex; flex-direction: column; gap: 16px; padding: 22px 24px; border-radius: 14px; border: 2px solid ${AMBD}; background: ${AMB};">
  <div style="display: flex; align-items: flex-start; gap: 12px;">
    <span style="width: 22px; height: 22px; border-radius: 6px; border: 2px solid ${P}; background: ${P}; color: #ffffff; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">${ck}</span>
    <p style="margin: 0; font-size: 14px; line-height: 1.5; color: ${AMBT}; font-weight: 500;">I confirm that I explained the assisted-claim process and the applicable privacy notice to the claimant, and the claimant verbally agreed to me entering and submitting this claim request on their behalf.</p>
  </div>
  <div style="display: flex; flex-direction: column; gap: 8px;">
    <label style="font-size: 13px; font-weight: 600; color: ${AMBT};">How did you speak to them?</label>
    <div style="display: flex; gap: 8px;">${chip('By phone', true)}${chip('In person', false)}${chip('Video call', false)}${chip('Other', false)}</div>
  </div>
  ${field('Call or appointment reference <span style="font-weight: 400; color: ' + MF + ';">(optional)</span>', input('', 'e.g. CALL-2026-08-14-1042'), 'A reference we can trace back. Never the recording itself.')}
</div>
${noteCard(shield, 'This is recorded as <strong>agent-attested verbal consent</strong> against notice v3 &mdash; your name, your firm and the time. It is never recorded as the claimant having accepted anything digitally.')}`;

const agentDeclaration = agentPre(
  'Assisted claim \u00b7 step 2 of 2',
  'Read the notice out, then confirm',
  'You cannot enter any of their details until this is recorded. Read the notice to them in full, in the language they prefer.',
  declarationBody,
  btnGhost('Back') + btnPrimary('Record consent and continue'),
  true, false, 1120);

// --- 4. A section, mid-flow -------------------------------------------------
const agentSection = agentPage(1, 'You &amp; your trip', 'Ask them each of these. Anything you are unsure of can be left and corrected at the review.', youTripBody(true), btnGhost('Back') + btnPrimary('Continue'), RAIL.you, 1000);

// --- 5. Submitted -----------------------------------------------------------
const agentSubmitted = `${head}
<div style="width: 1440px; min-height: 900px; background: ${BG}; display: flex; flex-direction: column;">
${siteNav(true, 'TC-2026-004812')}
${band(true)}
<div style="display: flex; justify-content: center; padding: 72px 64px 72px; flex-grow: 1;">
  <main style="width: 620px; display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center;">
    <span style="width: 60px; height: 60px; border-radius: 999px; background: ${TINT}; color: ${P}; display: flex; align-items: center; justify-content: center;">${bigCheck}</span>
    <h2 style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em;">Claim request TC-2026-004812 submitted</h2>
    <p style="margin: 0; font-size: 15px; color: ${MF}; line-height: 1.5; max-width: 500px;">Submitted on behalf of Nur Aisyah binti Rahman, on her recorded verbal agreement.</p>
    <div style="display: flex; flex-direction: column; gap: 12px; width: 100%; text-align: left; padding: 22px 24px; border-radius: 14px; border: 1px solid ${BD}; background: #ffffff;">
      <div style="display: flex; justify-content: space-between; font-size: 14px; padding-bottom: 12px; border-bottom: 1px solid ${BD};"><span style="color: ${MF};">Handled by</span><span style="font-weight: 600;">Pacific Adjusters</span></div>
      <div style="display: flex; justify-content: space-between; font-size: 14px; padding-bottom: 12px; border-bottom: 1px solid ${BD};"><span style="color: ${MF};">Entered by</span><span style="font-weight: 600;">Faiz Rahman &middot; 14 Aug 2026, 11:07</span></div>
      <div style="display: flex; justify-content: space-between; font-size: 14px;"><span style="color: ${MF};">Consent</span><span style="font-weight: 600;">Agent attested verbal &middot; notice v3</span></div>
    </div>
    ${noteCard(shield, 'This request now belongs to <strong>Pacific Adjusters</strong>, so you will not be able to open it from here. They will contact Nur Aisyah on WhatsApp if anything is missing. Give her the reference above.')}
    <div style="display: flex; gap: 10px; padding-top: 4px;">${btnGhost('Back to my claims')}${btnPrimary('Start another assisted claim')}</div>
  </main>
</div>
${footer(true)}
</div>
${tail}`;

D('AgentSignIn.dc.html', agentSignIn);
D('AgentCode.dc.html', agentCode);
D('AgentLookup.dc.html', agentLookup);
D('AgentDeclaration.dc.html', agentDeclaration);
D('AgentSection.dc.html', agentSection);
D('AgentSubmitted.dc.html', agentSubmitted);


const DX = 1560, PX = 480;
const R = 1040;
writeFileSync('canvas.json', JSON.stringify({
  artboards: [
    { file: 'Main.dc.html', title: 'Start (mobile number)', x: 0, y: 0, w: 1440, h: 900 },
    { file: 'Code.dc.html', title: 'Code', x: DX, y: 0, w: 1440, h: 900 },
    { file: 'Consent.dc.html', title: 'PDPA consent (gate)', x: 0, y: R, w: 1440, h: 900 },
    { file: 'ClaimType.dc.html', title: '1 · Claim type', x: DX, y: R, w: 1440, h: 900 },
    { file: 'YouTrip.dc.html', title: '2 · You & your trip', x: DX * 2, y: R, w: 1440, h: 1000 },
    { file: 'WhatHappened.dc.html', title: '3 · What happened', x: 0, y: R * 2 + 100, w: 1440, h: 900 },
    { file: 'Evidence.dc.html', title: '4 · Evidence', x: DX, y: R * 2 + 100, w: 1440, h: 900 },
    { file: 'Payout.dc.html', title: '5 · Payout', x: DX * 2, y: R * 2 + 100, w: 1440, h: 900 },
    { file: 'Review.dc.html', title: '6 · Review & submit', x: 0, y: R * 3 + 100, w: 1440, h: 1360 },
    { file: 'Submitted.dc.html', title: 'Submitted', x: DX, y: R * 3 + 100, w: 1440, h: 900 },
    { file: 'PhoneEntry.dc.html', title: 'Phone · Start', x: 0, y: R * 4 + 760, w: 390, h: 844 },
    { file: 'PhoneCode.dc.html', title: 'Phone · Code', x: PX, y: R * 4 + 760, w: 390, h: 844 },
    { file: 'PhoneConsent.dc.html', title: 'Phone · Consent', x: PX * 2, y: R * 4 + 760, w: 390, h: 900 },
    { file: 'PhoneClaimType.dc.html', title: 'Phone · 1 Claim type', x: PX * 3, y: R * 4 + 760, w: 390, h: 900 },
    { file: 'PhoneYouTrip.dc.html', title: 'Phone · 2 You & trip', x: PX * 4, y: R * 4 + 760, w: 390, h: 1180 },
    { file: 'PhoneEvidence.dc.html', title: 'Phone · 4 Evidence', x: PX * 6, y: R * 4 + 760, w: 390, h: 844 },
    { file: 'PhoneWhatHappened.dc.html', title: 'Phone · 3 What happened', x: PX * 5, y: R * 4 + 760, w: 390, h: 1000 },
    { file: 'PhoneReview.dc.html', title: 'Phone · 6 Review', x: PX * 7, y: R * 4 + 760, w: 390, h: 1380 },
    { file: 'PhonePayout.dc.html', title: 'Phone · 5 Payout', x: PX * 8, y: R * 4 + 760, w: 390, h: 1060 },
    { file: 'PhoneSubmitted.dc.html', title: 'Phone · Submitted', x: PX * 9, y: R * 4 + 760, w: 390, h: 900 },
    { file: 'AgentSignIn.dc.html', title: 'Agent · Sign in (mobile)', x: 0, y: R * 6 + 1180, w: 1440, h: 900 },
    { file: 'AgentCode.dc.html', title: 'Agent · Code', x: DX, y: R * 6 + 1180, w: 1440, h: 900 },
    { file: 'AgentLookup.dc.html', title: 'Agent · 1 Who is this for', x: DX * 2, y: R * 6 + 1180, w: 1440, h: 900 },
    { file: 'AgentDeclaration.dc.html', title: 'Agent · 2 Verbal consent', x: DX * 3, y: R * 6 + 1180, w: 1440, h: 1120 },
    { file: 'AgentSection.dc.html', title: 'Agent · the same six sections', x: DX * 4, y: R * 6 + 1180, w: 1440, h: 1000 },
    { file: 'AgentSubmitted.dc.html', title: 'Agent · Submitted', x: DX * 5, y: R * 6 + 1180, w: 1440, h: 900 },
  ],
  annotations: [
    { id: 'site-note', x: 0, y: -190, w: 720, text: 'Order matches the conversation gateway exactly: mobile → code → PDPA consent gate → claim type → name, policy, trip dates, destination, incident date → per-type questions → per-type documents → bank → review.\nNo separate home page: the first screen is the mobile-number step, with the have-these-ready list beside it. The pre-form pages have no section list because no Case exists yet: the server has not chosen a flow.' },
    { id: 'consent-note', x: 0, y: R - 120, w: 560, text: 'Consent shows the approved notice text and records "I agree" against that wording. The approval mechanism itself is still the open gap in docs/PDPA_NOTICE_APPROVAL_GAP.md.' },
    { id: 'agent-note', x: 0, y: R * 6 + 1000, w: 900, text: 'Agent-assisted: the same form, reached from a staff address. The agent signs in with their own mobile and a WhatsApp code \u2014 the same mechanism the claimant uses, so there is no password anywhere on this site \u2014 and stays signed in for 30 days. A claimant cannot open these screens and an agent cannot skip the phone code on the public one \u2014 the door decides, never a field on the page. Only the two pre-claim screens differ: look up the claimant, then record the verbal consent. Everything from Claim type to Review is byte-identical to the customer flow. The amber band is on every assisted screen and on none of the customer ones.' },
    { id: 'phone-note', x: 0, y: R * 4 + 620, w: 640, text: 'The same pages in a phone browser. Section list becomes the "Step n of 6" bar, the summary rail folds into Review, two-column grids stack, actions pin to the bottom.' },
  ],
  launch: { view: 'canvas' },
}, null, 2));
console.log('written');
