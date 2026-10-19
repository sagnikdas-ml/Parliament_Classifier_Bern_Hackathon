// DEMO DATA. The records are real OpenParlData affairs (IDs, titles, dates, authors, verbatim quotations copied from
// the archive). The APS labels, confidence scores and fact-check verdicts are ILLUSTRATIVE, not live model output.
// The UI always shows a "Demo data" marker when these are on screen.

export const DEMO_AFFAIRS = [
  {
    id: 235308, number: '25.3011', body: 'CHE', level: 'Federal', lang: 'DE', langs: ['DE', 'FR', 'IT'], date: '2025-01-27',
    title: 'Die Rolle von Hosting- und Cloud-Anbietern bei der Bewältigung von Cyberbedrohungen stärken',
    author: 'Sicherheitspolitische Kommission NR', party: null, digital: 0.95,
    aps: [{ code: '7.2.9', chapter: 'Sicherheitspolitik', name: 'Cybersicherheit', conf: 0.95 }, { code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.88 }],
    kind: 'submitted text',
    quote: 'Hosting- und Cloudanbieter spielen bei der Bewältigung von Cyberbedrohungen eine ebenso zentrale Rolle wie Internetanbieter',
    source: 'Der Bundesrat wird beauftragt, gesetzliche Grundlagen auszuarbeiten, welche Hosting- und Cloudanbietern bei der Bewältigung von Cyberbedrohungen die nötigen Rechten und Pflichten erteilt, um den Missbrauch der von ihnen angebotenen Infrastrukturen und Dienste für Cyberangriffe zu bekämpfen. Hosting- und Cloudanbieter spielen bei der Bewältigung von Cyberbedrohungen eine ebenso zentrale Rolle wie Internetanbieter',
  },
  {
    id: 161452, number: '24.4164', body: 'CHE', level: 'Federal', lang: 'DE', langs: ['DE', 'FR', 'IT'], date: '2024-09-26',
    title: 'Cybersicherheit. Hotline für Opfer von Cyberangriffen',
    author: 'Jacqueline de Quattro', party: 'FDP.Die Liberalen', digital: 0.93,
    aps: [{ code: '7.2.9', chapter: 'Sicherheitspolitik', name: 'Cybersicherheit', conf: 0.93 }, { code: '7.2.7', chapter: 'Sicherheitspolitik', name: 'Öffentliche Sicherheit', conf: 0.76 }],
    kind: 'submitted text',
    quote: 'eine Hotline oder eine Beratungsplattform zu schaffen, die als spezialisierte Einrichtung die Bevölkerung im Umgang mit Cyberkriminalität berät',
    source: 'Der Bundesrat wird beauftragt, auf Bundesebene eine Hotline oder eine Beratungsplattform zu schaffen, die als spezialisierte Einrichtung die Bevölkerung im Umgang mit Cyberkriminalität berät, also eine Art «Dargebotene Hand» für die Opfer von Cyberangriffen.',
  },
  {
    id: 161610, number: '24.4519', body: 'CHE', level: 'Federal', lang: 'DE', langs: ['DE', 'FR', 'IT'], date: '2024-12-19',
    title: 'Eine Strategie zur Bekämpfung von Desinformation',
    author: 'Jacqueline de Quattro', party: 'FDP.Die Liberalen', digital: 0.84,
    aps: [{ code: '4.4.4', chapter: 'Medien', name: 'Digitale Medien', conf: 0.84 }, { code: '7.2.7', chapter: 'Sicherheitspolitik', name: 'Öffentliche Sicherheit', conf: 0.7 }],
    kind: 'submitted text',
    quote: 'Der Bundesrat wird beauftragt, eine Strategie zur Bekämpfung von Desinformation auszuarbeiten.',
    source: 'Der Bundesrat wird beauftragt, eine Strategie zur Bekämpfung von Desinformation auszuarbeiten. Vor dem Hintergrund der aktuellen geopolitischen Lage stellen Propagandakampagnen eine echte Gefahr dar.',
  },
  {
    id: 253612, number: '25.4331', body: 'CHE', level: 'Federal', lang: 'DE', langs: ['DE', 'FR', 'IT'], date: '2025-09-26',
    title: 'Krankenversicherung. Digitale Kommunikationskanäle konsequent nutzen und Ressourcen schonen',
    author: 'Michaël Buffat', party: 'Schweizerische Volkspartei', digital: 0.89,
    aps: [{ code: '5.2.4', chapter: 'Sozialversicherungen', name: 'Krankenversicherung', conf: 0.92 }, { code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.86 }],
    kind: 'submitted text',
    quote: 'digitale Kommunikationskanäle für die externe Kommunikation im Rahmen der obligatorischen Krankenpflegeversicherung (OKP) verbindlich vorgeschrieben werden können',
    source: 'Der Bundesrat wird beauftragt, die gesetzlichen Grundlagen dahingehend anzupassen, dass digitale Kommunikationskanäle für die externe Kommunikation im Rahmen der obligatorischen Krankenpflegeversicherung (OKP) verbindlich vorgeschrieben werden können.',
  },
  {
    id: 337367, number: '26.066', body: 'CHE', level: 'Federal', lang: 'DE', langs: ['DE', 'FR', 'IT'], date: '2026-09-09',
    title: 'Breitbandfördergesetz (BBFG)', author: null, party: null, digital: 0.81,
    aps: [{ code: '6.1.8', chapter: 'Verkehr und Kommunikation', name: 'Telekommunikation', conf: 0.9 }, { code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.8 }],
    kind: 'title (record has no text yet)', quote: 'Breitbandfördergesetz (BBFG)', source: 'Breitbandfördergesetz (BBFG)',
  },
  {
    id: 329562, number: 'MO1920', body: 'TI', level: 'Cantonal', lang: 'IT', langs: ['IT'], date: '2026-05-18',
    title: 'Per un’intelligenza artificiale pubblica svizzera, sviluppata e gestita “in casa”, al servizio dei Cantoni, dei Comuni e dei cittadini',
    author: null, party: null, digital: 0.91,
    aps: [{ code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.91 }, { code: '1.2.2', chapter: 'Institutionen', name: 'Verwaltung', conf: 0.64 }],
    kind: 'title (record has no text)', quote: 'intelligenza artificiale pubblica svizzera',
    source: 'Per un’intelligenza artificiale pubblica svizzera, sviluppata e gestita “in casa”, al servizio dei Cantoni, dei Comuni e dei cittadini',
  },
  {
    id: 303044, number: '2026.GRPARL.123', body: 'BE', level: 'Cantonal', lang: 'DE', langs: ['DE'], date: '2026-03-05',
    title: 'eBau - elektronisches Baubewilligungsverfahren im Kanton Bern', author: null, party: null, digital: 0.9,
    aps: [{ code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.9 }, { code: '6.3.1', chapter: 'Raumplanung und Wohnungswesen', name: 'Raumplanung', conf: 0.72 }],
    kind: 'title (record has no text)', quote: 'elektronisches Baubewilligungsverfahren', source: 'eBau - elektronisches Baubewilligungsverfahren im Kanton Bern',
  },
  {
    id: 335263, number: '4134', body: 'ZG', level: 'Cantonal', lang: 'DE', langs: ['DE'], date: '2026-06-10',
    title: 'Zugänglichkeit von e.Tax Zug und AGOV', author: null, party: null, digital: 0.86,
    aps: [{ code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.86 }, { code: '8.2.4', chapter: 'Öffentliche Finanzen', name: 'Steuern', conf: 0.69 }],
    kind: 'title (record has no text)', quote: 'e.Tax Zug und AGOV', source: 'Zugänglichkeit von e.Tax Zug und AGOV',
  },
  {
    id: 339810, number: 'VNL1002005', body: 'ZH', level: 'Cantonal', lang: 'DE', langs: ['DE'], date: '2026-09-25',
    title: 'Gesetz über egovpartner', author: null, party: null, digital: 0.88,
    aps: [{ code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.88 }, { code: '1.2.2', chapter: 'Institutionen', name: 'Verwaltung', conf: 0.74 }],
    kind: 'title (record has no text)', quote: 'Gesetz über egovpartner', source: 'Gesetz über egovpartner',
  },
  {
    id: 334122, number: '24/MO 44/347', body: 'TG', level: 'Cantonal', lang: 'DE', langs: ['DE'], date: '2026-06-10',
    title: 'Digitale Souveränität des Kantons Thurgau - Abhängigkeiten, Risiken und Strategie', author: null, party: null, digital: 0.87,
    aps: [{ code: '6.1.9', chapter: 'Verkehr und Kommunikation', name: 'Digitalisierung', conf: 0.87 }, { code: '7.2.9', chapter: 'Sicherheitspolitik', name: 'Cybersicherheit', conf: 0.66 }],
    kind: 'title (record has no text)', quote: 'Digitale Souveränität des Kantons Thurgau',
    source: 'Digitale Souveränität des Kantons Thurgau - Abhängigkeiten, Risiken und Strategie',
  },
]

export const BODY_NAMES = {
  CHE: 'Federal Assembly', TI: 'Gran Consiglio TI', BE: 'Grosser Rat BE', ZG: 'Kantonsrat ZG', ZH: 'Kanton Zürich', TG: 'Grosser Rat TG',
}

export const DEMO_ARTICLE =
  'FDP National Councillor Jacqueline de Quattro submitted a motion calling for a national hotline for victims of cyberattacks. ' +
  'In 2023, Parliament was asked to draw up a strategy against disinformation. ' +
  'A parliamentary committee argues that hosting and cloud providers play as central a role in tackling cyber threats as internet providers. ' +
  'Digital health insurance letters will save the Swiss health system more than CHF 100 million a year. ' +
  'This is clearly a welcome step in the right direction.'

const byId = Object.fromEntries(DEMO_AFFAIRS.map((a) => [a.id, a]))
const SCRIPT = {
  'FDP National Councillor Jacqueline de Quattro submitted a motion calling for a national hotline for victims of cyberattacks.': {
    verdict: 'supported', affair: 161452,
    explanation: 'The archive record shows a motion by Jacqueline de Quattro (FDP) instructing the Federal Council to create such a hotline. A submitted motion is not an adopted decision.',
  },
  'In 2023, Parliament was asked to draw up a strategy against disinformation.': {
    verdict: 'contradicted', affair: 161610,
    explanation: 'The matching motion was submitted on 19 December 2024, not in 2023.',
    correction: 'The motion asking for a disinformation strategy was submitted on 19 December 2024.',
  },
  'A parliamentary committee argues that hosting and cloud providers play as central a role in tackling cyber threats as internet providers.': {
    verdict: 'supported', affair: 235308,
    explanation: 'Motion 25.3011 of the Security Policy Committee of the National Council (SiK-N) states exactly this.',
  },
  'Digital health insurance letters will save the Swiss health system more than CHF 100 million a year.': {
    verdict: 'unverified', affair: 253612, closestOnly: true,
    explanation: 'Motion 25.4331 asks for binding digital channels in health insurance, but no savings figure appears in the archive text. Absence of evidence is not evidence of falsity.',
  },
  'This is clearly a welcome step in the right direction.': {
    verdict: 'not_factual', affair: null, explanation: 'Evaluative opinion; there is nothing to verify against the archive.',
  },
}

/** Split into sentences (client-side, demo only; the real backend returns exact offsets). */
export function splitSentences(text) {
  return text.trim().split(/(?<=[.!?])\s+(?=[A-ZÄÖÜÉÈÀ0-9“"])/).filter(Boolean).slice(0, 40)
}

/** Demo analysis for one sentence, shaped like the normalised live result (see lib/api.js normalizeSentence). */
export function demoSentence(text, index) {
  const hit = SCRIPT[text]
  const a = hit?.affair ? byId[hit.affair] : null
  const claim = hit
    ? { text, verdict: hit.verdict, explanation: hit.explanation, correction: hit.correction || null,
        evidence: a && !hit.closestOnly && ['supported', 'contradicted'].includes(hit.verdict)
          ? [{ quote: a.quote, source: a.source, affairId: a.id, lang: a.lang, server: false }] : [],
        needsReview: ['unverified', 'contradicted'].includes(hit.verdict) }
    : { text, verdict: 'unverified', evidence: [], correction: null, needsReview: true,
        explanation: 'Demo mode: archive retrieval is not connected for free text. No archive match never means the claim is false.' }
  return {
    index, text, scope: hit?.verdict === 'not_factual' ? 'apolitical' : 'swiss_parliament', claims: [claim],
    affairs: a ? [{ id: a.id, number: a.number, title: a.title, authors: a.author ? [{ name: a.author, party: a.party }] : [], date: a.date, body: a.body }] : [],
    topics: a && claim.verdict !== 'unverified' ? a.aps.slice(0, 2).map((t) => ({ name: t.name, chapter: t.chapter })) : [],
  }
}
