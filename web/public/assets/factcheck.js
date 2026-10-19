(() => {
  const el = id => document.getElementById(id);
  const labels = {
    en:{supported:'Supported by archives',contradicted:'Issue found',unverified:'Unverified',not_factual:'Opinion',apolitical:'Apolitical',other_political:'Outside Swiss parliament',uncertain:'Scope uncertain',mixed:'Mixed',sentenceCheck:'Sentence check',waiting:'Preparing this language…',source:'Sources',topic:'Topics of cited affairs',retry:'Check against archives anyway',noAssessment:'No claim assessment was returned. Please retry this check.',sentence:'Sentence',archiveSuggestion:'ARCHIVE-BACKED SUGGESTION',viewSource:'View source',apply:'Apply to draft',applied:'Applied to draft',affairAuthor:'Affair author',authorMissing:'Affair author not available in the retrieved metadata.',affairOpened:'Affair opened',originalRecord:'Original parliamentary record',coverage:'Archive coverage and retrieval',searched:'Searched affairs',sourcePassages:'source passages',anchored:'Matched a named affair in this article.',keywordSearch:'Multilingual keyword and available semantic retrieval.'},
    de:{supported:'Durch Archiv belegt',contradicted:'Abweichung gefunden',unverified:'Nicht verifiziert',not_factual:'Meinung',apolitical:'Unpolitisch',other_political:'Ausserhalb des Schweizer Parlaments',uncertain:'Themenbereich unklar',mixed:'Gemischt',sentenceCheck:'Satzprüfung',waiting:'Diese Sprache wird vorbereitet …',source:'Quellen',topic:'Themen der zitierten Geschäfte',retry:'Trotzdem im Archiv prüfen',noAssessment:'Keine Faktenprüfung verfügbar. Bitte erneut versuchen.',sentence:'Satz',archiveSuggestion:'DURCH ARCHIV BELEGTER VORSCHLAG',viewSource:'Quelle öffnen',apply:'Im Entwurf ersetzen',applied:'Im Entwurf ersetzt',affairAuthor:'Urheber des Geschäfts',authorMissing:'Urheber in den abgerufenen Metadaten nicht verfügbar.',affairOpened:'Geschäft eröffnet',originalRecord:'Originaleintrag im Parlament',coverage:'Archivabdeckung und Suche',searched:'Durchsuchte Geschäfte',sourcePassages:'Quellenpassagen',anchored:'Geschäft im Artikel gefunden.',keywordSearch:'Mehrsprachige Stichwort- und semantische Suche.'},
    fr:{supported:'Confirmé par les archives',contradicted:'Écart détecté',unverified:'Non vérifié',not_factual:'Opinion',apolitical:'Apolitique',other_political:'Hors du Parlement suisse',uncertain:'Portée incertaine',mixed:'Mixte',sentenceCheck:'Vérification',waiting:'Préparation de la langue…',source:'Sources',topic:'Thèmes des affaires citées',retry:'Vérifier quand même',noAssessment:'Aucune vérification disponible. Réessayez.',sentence:'Phrase',archiveSuggestion:'SUGGESTION ÉTAYÉE PAR LES ARCHIVES',viewSource:'Voir la source',apply:'Remplacer dans le texte',applied:'Remplacé dans le texte',affairAuthor:'Auteur de l’affaire',authorMissing:'Auteur indisponible dans les métadonnées.',affairOpened:'Affaire ouverte',originalRecord:'Dossier parlementaire original',coverage:'Couverture et recherche',searched:'Affaires recherchées',sourcePassages:'passages sources',anchored:'Affaire nommée retrouvée dans l’article.',keywordSearch:'Recherche multilingue par mots-clés et sémantique.'},
    it:{supported:'Confermato dagli archivi',contradicted:'Incongruenza rilevata',unverified:'Non verificato',not_factual:'Opinione',apolitical:'Apolitico',other_political:'Fuori dal Parlamento svizzero',uncertain:'Ambito incerto',mixed:'Misto',sentenceCheck:'Verifica della frase',waiting:'Preparazione della lingua…',source:'Fonti',topic:'Temi degli affari citati',retry:'Verifica comunque',noAssessment:'Verifica non disponibile. Riprova.',sentence:'Frase',archiveSuggestion:'SUGGERIMENTO BASATO SUGLI ARCHIVI',viewSource:'Apri la fonte',apply:'Sostituisci nel testo',applied:'Sostituito nel testo',affairAuthor:'Autore dell’affare',authorMissing:'Autore non disponibile nei metadati.',affairOpened:'Affare aperto',originalRecord:'Atto parlamentare originale',coverage:'Copertura e ricerca',searched:'Affari cercati',sourcePassages:'passaggi fonte',anchored:'Atto citato trovato nell’articolo.',keywordSearch:'Ricerca multilingue per parole chiave e semantica.'},
    rm:{supported:'Confermà dals archivs',contradicted:'Differenza chattada',unverified:'Betg verifitgà',not_factual:'Opiniun',apolitical:'Apolitic',other_political:'Betg dal parlament svizzer',uncertain:'Champ intschert',mixed:'Maschadà',sentenceCheck:'Controlla da la frasa',waiting:'Preparaziun da la lingua…',source:'Funtaunas',topic:'Temas da las fatschentas citadas',retry:'Controllar tuttina',noAssessment:'Naginna controlla disponibla. Empruvai anc ina giada.',sentence:'Frasa',archiveSuggestion:'PROPOSTA SUTSTEGNIDA DA L’ARCHIV',viewSource:'Vesair funtauna',apply:'Midar il sboz',applied:'Sboz midà',affairAuthor:'Autur da la fatschenta',authorMissing:'Autur betg disponibel en las metadatas.',affairOpened:'Fatschenta averta',originalRecord:'Document parlamentar original',coverage:'Dumber e tschertga en l’archiv',searched:'Fatschentas tschertgadas',sourcePassages:'passaschas da funtauna',anchored:'Fatschenta chattada en l’artitgel.',keywordSearch:'Tschertga multilingua per pleds-clav e semantica.'}
  };
  let outputLanguage = localStorage.getItem('polinews.language') || 'en';
  const languageNames = {en:'English',de:'Deutsch',fr:'Français',it:'Italiano',rm:'Rumantsch'};
  const topicUi = {
    en:{title:'TOPIC MATCH',aps:'APS standard classification',custom:'Custom classification',speaker:'Speaker / affair author',date:'Affair date',missing:'Not in archive metadata',none:'No evidence-backed topic match for this sentence.'},
    de:{title:'THEMENZUORDNUNG',aps:'APS-Standardklassifikation',custom:'Eigene Klassifikation',speaker:'Sprecher:in / Urheber:in',date:'Datum des Geschäfts',missing:'Keine Angabe in den Archivmetadaten',none:'Keine belegte Themenzuordnung für diesen Satz.'},
    fr:{title:'THÈME ASSOCIÉ',aps:'Classification APS standard',custom:'Classification personnalisée',speaker:'Intervenant·e / auteur·e',date:'Date de l’affaire',missing:'Absent des métadonnées',none:'Aucun thème étayé pour cette phrase.'},
    it:{title:'TEMA ASSOCIATO',aps:'Classificazione APS standard',custom:'Classificazione personalizzata',speaker:'Oratore / autore dell’atto',date:'Data dell’atto',missing:'Dato non presente nei metadati',none:'Nessun tema supportato per questa frase.'},
    rm:{title:'TEMA ATTRIBUÌ',aps:'Classificaziun standard APS',custom:'Classificaziun persunalisada',speaker:'Oratur / autur da la fatschenta',date:'Data da la fatschenta',missing:'Betg en las metadatas',none:'Nagins temas sustegnids per questa frasa.'}
  };
  const sectionUi = {
    en:{assessment:'Sentence assessment',claims:'Claim-level findings',correction:'Archive-backed correction',evidence:'Supporting evidence',records:'Cited parliamentary affairs',topicIssues:'Topic classification notes',scope:'Archive search details'},
    de:{assessment:'Satzbewertung',claims:'Bewertung einzelner Behauptungen',correction:'Archivgestützte Korrektur',evidence:'Belege',records:'Zitierte parlamentarische Geschäfte',topicIssues:'Hinweise zur Themenklassifikation',scope:'Details zur Archivrecherche'},
    fr:{assessment:'Évaluation de la phrase',claims:'Évaluation des affirmations',correction:'Correction étayée par les archives',evidence:'Éléments à l’appui',records:'Affaires parlementaires citées',topicIssues:'Notes sur la classification thématique',scope:'Détails de la recherche'},
    it:{assessment:'Valutazione della frase',claims:'Valutazione delle affermazioni',correction:'Correzione basata sugli archivi',evidence:'Prove a sostegno',records:'Atti parlamentari citati',topicIssues:'Note sulla classificazione tematica',scope:'Dettagli della ricerca'},
    rm:{assessment:'Valitaziun da la frasa',claims:'Valitaziun da las pretensiuns',correction:'Correctura sustegnida da l’archiv',evidence:'Indizis',records:'Fatschentas parlamentaras citadas',topicIssues:'Remartgas davart la classificaziun',scope:'Detagls da la tschertga'}
  };
  const sectionLabel = key => (sectionUi[outputLanguage] || sectionUi.en)[key];
  let run = null, stopped = false, busy = false, bulkJob = null, jobTimer = null;
  const completed = new Set();
  const results = new Map();
  const translations = new Map();
  const sentenceCards = new Map();
  const translationQueue = [];
  let translating = false;
  let activeSentence = null;
  let topicHoverIndex = null;
  let topicHoverPointer = null;
  const label = key => (labels[outputLanguage] || labels.en)[key] || labels.en[key] || key;
  const HISTORY_KEY = 'polinews.browser-history.v1';
  function readHistory() {
    try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(value) ? value : []; }
    catch { return []; }
  }
  function persistHistory() {
    if (!run?.id) return;
    const previous = readHistory().filter(item => item.id !== run.id);
    const entry = {id:run.id, text:run.text, language:run.language || outputLanguage, model:run.model || '', topic_ids:run.topic_ids || [], createdAt:run.createdAt || new Date().toISOString(), sentences:run.sentences, results:[...results.values()], translations:[...translations].map(([index, variants]) => [index, Object.fromEntries(variants)])};
    run.createdAt = entry.createdAt;
    const history = [entry, ...previous].slice(0, 12);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); }
    catch {
      try {
        history.slice(4).forEach(item => { item.results = []; item.translations = []; });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch {
        try { history.forEach(item => { item.results = []; item.translations = []; }); localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
      }
    }
    renderHistory();
  }
  function openHistory(open = true) {
    el('historyDrawer').hidden = !open; el('historyBackdrop').hidden = !open;
    el('historyMenu').setAttribute('aria-expanded', String(open));
    if (open) renderHistory();
  }
  function renderHistory() {
    const list = el('historyList'); if (!list) return;
    list.replaceChildren();
    const items = readHistory();
    if (!items.length) { list.append(node('p', 'Stories you check on this device will appear here.', 'historyEmpty')); return; }
    for (const item of items) {
      const button = node('button', '', 'historyItem'); button.type = 'button';
      const title = (item.text || '').replace(/\s+/g, ' ').trim();
      button.append(node('strong', title.length > 95 ? `${title.slice(0,92)}…` : title));
      const date = new Date(item.createdAt);
      button.append(node('span', `${date.toLocaleDateString()} · ${(item.language || 'en').toUpperCase()} · ${item.results?.length || 0}/${item.sentences?.length || 0} checked`));
      button.onclick = () => restoreHistoryItem(item);
      list.append(button);
    }
  }
  function restoreHistoryItem(item) {
    openHistory(false); tab(true); el('news').value = item.text || '';
    el('factEntry').hidden = true;
    run = {id:item.id, text:item.text || '', language:item.language || 'en', model:item.model, topic_ids:item.topic_ids || [], sentences:item.sentences || []};
    completed.clear(); results.clear(); translations.clear();
    for (const [index, variants] of item.translations || []) translations.set(Number(index), new Map(Object.entries(variants || {})));
    setOutputLanguage(item.language || 'en');
    makeSubmittedStory(run);
    for (const result of item.results || []) {
      results.set(result.index, result); completed.add(result.index);
      const card = sentenceCards.get(result.index); if (card) render(translatedResult(result.index) || result, card);
      queueTranslations(result.index);
    }
    el('resumeNews').hidden = completed.size === run.sentences.length;
    el('storyReview').scrollIntoView({behavior:'smooth', block:'start'});
  }
  function node(tag, text, className) {
    const n = document.createElement(tag); n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  function setActiveSentence(index) {
    activeSentence = index;
    window.PoliGraphs.news(index === null ? null : translatedResult(index) || results.get(index));
    for (const button of document.querySelectorAll('.storySentence, .timelineStep')) {
      const active = Number(button.dataset.index) === index;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
    if (index !== null && results.has(index)) { showSentence(index); return; }
    const panel = el('sentenceResponse');
    const card = sentenceCards.get(index);
    fillResponsePanel(card, index);
  }
  function positionTopicHover(anchor, pointer = null) {
    const popover = el('topicHover'), rect = anchor.getBoundingClientRect();
    const width = Math.min(360, window.innerWidth - 24), height = popover.offsetHeight;
    const x = pointer?.x ?? rect.left, y = pointer?.y ?? rect.top;
    let left = x + 16;
    if (left + width > window.innerWidth - 12) left = x - width - 16;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    let top = y + 16;
    if (top + height > window.innerHeight - 12) top = y - height - 16;
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px`;
  }
  function showTopicHover(index, anchor, pointerEvent = null) {
    const result = results.get(index), popover = el('topicHover');
    if (!result) return;
    topicHoverIndex = index;
    topicHoverPointer = pointerEvent && Number.isFinite(pointerEvent.clientX) ? {x:pointerEvent.clientX, y:pointerEvent.clientY} : null;
    const ui = topicUi[outputLanguage] || topicUi.en;
    const topics = Array.isArray(result.topics) ? result.topics : [];
    const affairs = Array.isArray(result.matched_affairs) ? result.matched_affairs : [];
    popover.replaceChildren();
    popover.append(node('span', ui.title, 'eyebrow'));
    const affairIds = [...new Set([...topics.map(topic => String(topic.affair_id)), ...affairs.map(affair => String(affair.id))])];
    if (!affairIds.length) popover.append(node('p', ui.none, 'hint'));
    for (const id of affairIds) {
      const affair = affairs.find(item => String(item.id) === id);
      const provenance = affair?.provenance || {};
      const record = node('section', '', 'topicHoverGroup');
      if (affair) record.append(node('strong', `${id} · ${Object.values(affair.titles || {}).find(Boolean) || 'OpenParlData affair'}`));
      const matches = topics.filter(topic => String(topic.affair_id) === id);
      if (matches.length) {
        for (const [scheme, title] of [['APS', ui.aps], ['Custom', ui.custom]]) {
          const selected = matches.filter(topic => (topic.scheme || '').toLowerCase() === scheme.toLowerCase());
          if (!selected.length) continue;
          record.append(node('span', title, 'topicFieldLabel'));
          for (const topic of selected) record.append(node('span', `${topic.chapter?.de ? `${topic.chapter.de} → ` : ''}${topic.name}`, 'topicChip'));
        }
      } else record.append(node('span', ui.none, 'topicMissing'));
      const people = (provenance.authors || []).map(person => person.role ? `${person.name} (${person.role})` : person.name).filter(Boolean);
      for (const event of provenance.events || []) if (event.actor && !people.some(person => person.startsWith(event.actor))) people.push(event.label ? `${event.actor} (${event.label})` : event.actor);
      record.append(node('span', ui.speaker, 'topicFieldLabel'), node('span', people.join(', ') || ui.missing, 'topicFieldValue'));
      const eventDates = (provenance.events || []).filter(event => event.date).map(event => `${event.date}${event.label ? ` · ${event.label}` : ''}`);
      const dates = eventDates.length ? [...new Set(eventDates)] : [provenance.record_start_date].filter(Boolean);
      record.append(node('span', ui.date, 'topicFieldLabel'), node('span', dates.join(' · ') || ui.missing, 'topicFieldValue'));
      popover.append(record);
    }
    popover.hidden = false;
    positionTopicHover(anchor, topicHoverPointer);
  }
  function hideTopicHover(index) {
    if (topicHoverIndex !== index) return;
    topicHoverIndex = null; topicHoverPointer = null; el('topicHover').hidden = true;
  }
  function fillResponsePanel(card, index) {
    const panel = el('sentenceResponse');
    panel.replaceChildren();
    panel.append(node('span', label('sentenceCheck').toUpperCase(), 'eyebrow'));
    if (card) panel.append(card);
    else panel.append(node('p', index === null ? 'Select a sentence to view its check.' : 'This sentence is waiting to be checked.', 'hint'));
  }
  function makeSubmittedStory(sourceRun) {
    el('storyEditor').hidden = true; el('storyTimeline').hidden = false; el('submittedStoryText').hidden = false;
    const story = el('submittedStoryText'); story.replaceChildren();
    const timeline = el('storyTimeline'); timeline.replaceChildren();
    sentenceCards.clear(); activeSentence = null;
    let cursor = 0;
    for (const sentence of sourceRun.sentences) {
      const start = Math.max(cursor, sentence.start), end = Math.min(sourceRun.text.length, sentence.end);
      if (start > cursor) story.append(document.createTextNode(sourceRun.text.slice(cursor, start)));
      const button = node('button', sourceRun.text.slice(start, end), 'storySentence waiting');
      button.type = 'button'; button.dataset.index = sentence.index;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Sentence ${sentence.index + 1}, check pending. Hover, focus, or select to view details.`);
      button.addEventListener('mouseenter', () => setActiveSentence(sentence.index));
      button.addEventListener('focus', () => setActiveSentence(sentence.index));
      button.addEventListener('click', () => setActiveSentence(sentence.index));
      button.addEventListener('mouseenter', event => showTopicHover(sentence.index, button, event));
      button.addEventListener('mousemove', event => { if (topicHoverIndex === sentence.index) { topicHoverPointer = {x:event.clientX,y:event.clientY}; positionTopicHover(button, topicHoverPointer); } });
      button.addEventListener('mouseleave', () => hideTopicHover(sentence.index));
      button.addEventListener('focus', () => showTopicHover(sentence.index, button));
      button.addEventListener('blur', () => hideTopicHover(sentence.index));
      button.addEventListener('click', () => showTopicHover(sentence.index, button));
      story.append(button);
      const step = node('button', String(sentence.index + 1), 'timelineStep waiting'); step.type = 'button'; step.dataset.index = sentence.index;
      step.setAttribute('aria-label', `Open sentence ${sentence.index + 1}`); step.title = `Sentence ${sentence.index + 1}`;
      step.addEventListener('mouseenter', event => { setActiveSentence(sentence.index); showTopicHover(sentence.index, step, event); });
      step.addEventListener('mousemove', event => { if (topicHoverIndex === sentence.index) { topicHoverPointer = {x:event.clientX,y:event.clientY}; positionTopicHover(step, topicHoverPointer); } });
      step.addEventListener('mouseleave', () => hideTopicHover(sentence.index));
      step.addEventListener('focus', () => { setActiveSentence(sentence.index); showTopicHover(sentence.index, step); });
      step.addEventListener('blur', () => hideTopicHover(sentence.index));
      step.addEventListener('click', () => { setActiveSentence(sentence.index); showTopicHover(sentence.index, step); });
      timeline.append(step);
      const waitingCard = node('article', '', 'factCard waitingCard');
      waitingCard.append(node('h3', `Sentence ${sentence.index + 1} · Checking`), node('p', 'The assessment and archive evidence will appear here when ready.', 'hint'));
      sentenceCards.set(sentence.index, waitingCard);
      cursor = end;
    }
    if (cursor < sourceRun.text.length) story.append(document.createTextNode(sourceRun.text.slice(cursor)));
    el('storyReview').hidden = false;
    setActiveSentence(null);
  }
  function updateStorySentence(result) {
    const button = el('submittedStoryText').querySelector(`[data-index="${result.index}"]`);
    if (!button) return;
    const state = result.scope === 'apolitical' ? 'apolitical' : result.status || 'unverified';
    button.className = `storySentence ${state}`;
    button.setAttribute('aria-label', `Sentence ${result.index + 1}: ${label(state)}. Hover, focus, or select to view details.`);
    const step = el('storyTimeline').querySelector(`[data-index="${result.index}"]`);
    if (step) { step.className = `timelineStep ${state}`; step.title = `Sentence ${result.index + 1} · ${label(state)}`; }
    if (topicHoverIndex === result.index) showTopicHover(result.index, button);
  }
  function renderInlineAssessment(result, target) {
    const line = node('p', '', 'sentenceMarkup');
    const claims = (result.claims || []).filter(claim => claim.text && result.text.includes(claim.text))
      .map(claim => ({claim, start: result.text.indexOf(claim.text)})).sort((a,b) => a.start-b.start);
    let cursor = 0;
    for (const item of claims) {
      if (item.start < cursor) continue;
      line.append(document.createTextNode(result.text.slice(cursor, item.start)));
      const mark = node('mark', item.claim.text, `inlineClaim ${item.claim.verdict}`);
      mark.title = label(item.claim.verdict);
      line.append(mark);
      cursor = item.start + item.claim.text.length;
    }
    line.append(document.createTextNode(result.text.slice(cursor)));
    target.append(line);
    for (const claim of result.claims || []) {
      if (claim.verdict !== 'contradicted' || !claim.correction) continue;
      const suggestion = node('div', '', 'inlineCorrection');
      suggestion.append(node('span', label('archiveSuggestion'), 'correctionEyebrow'));
      suggestion.append(node('p', claim.correction, 'replacementText'));
      const source = claim.correction_evidence?.[0] || claim.evidence?.[0];
      if (source?.source_url) {
        try {
          const url = new URL(source.source_url);
          if (['http:', 'https:'].includes(url.protocol)) {
            const link = node('a', `${label('viewSource')} · ${source.affair_id}`); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; suggestion.append(link);
          }
        } catch {}
      }
      const absoluteStart = (run?.sentences?.[result.index]?.start || 0) + result.text.indexOf(claim.text);
      const sourceText = run?.text || '';
      const canReplace = absoluteStart >= 0 && sourceText.slice(absoluteStart, absoluteStart + claim.text.length) === claim.text;
      const revisedText = canReplace ? sourceText.slice(0, absoluteStart) + claim.correction + sourceText.slice(absoluteStart + claim.text.length) : '';
      const replace = node('button', 'Replace & recheck', 'applyCorrection secondary'); replace.type = 'button'; replace.disabled = !canReplace;
      replace.title = canReplace ? 'Replace this wording and run a fresh check.' : 'This sentence has changed. Edit and recheck the current story first.';
      replace.onclick = async () => { replace.disabled = true; try { await startFactCheck(revisedText, run.topic_ids || [], run.model || el('newsModel').value); } catch (error) { replace.disabled = false; el('factProgress').textContent = error.message; } };
      const review = node('button', 'Review & edit', 'applyCorrection secondary'); review.type = 'button'; review.disabled = !canReplace;
      review.title = 'Open the replacement in the story editor so you can review or revise it before rechecking.';
      review.onclick = () => enterStoryEdit(revisedText);
      suggestion.append(replace, review); target.append(suggestion);
    }
  }
  async function post(path, body = {}) {
    const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to check this sentence. Retry.');
    return data;
  }
  function translatedResult(index) {
    const base = results.get(index);
    if (!base) return null;
    if (outputLanguage === run?.language) return base;
    const translated = translations.get(index)?.get(outputLanguage);
    if (!translated) return null;
    return {...base, ...translated, claims:(base.claims || []).map((claim, i) => ({...claim, ...(translated.claims?.[i] || {})}))};
  }
  function showSentence(index) {
    const base = results.get(index), card = sentenceCards.get(index);
    if (!base || !card) return;
    const translated = translatedResult(index);
    if (translated) render(translated, card);
    else {
      const status = base.scope === 'apolitical' ? label('apolitical') : label(base.status || 'unverified');
      card.className = `factCard ${base.status || 'unverified'}`;
      card.replaceChildren(node('h3', `${label('sentence')} ${index + 1} · ${status}`), node('p', `${label('waiting')} ${languageNames[outputLanguage]}`, 'hint'));
      if (activeSentence === index) fillResponsePanel(card, index);
    }
  }
  async function processTranslationQueue() {
    if (translating) return;
    translating = true;
    try {
      while (translationQueue.length) {
        const task = translationQueue.shift();
        if (task.runId !== run?.id || !results.has(task.index)) continue;
        try {
          const translated = await post(`/api/fact-checks/${task.runId}/sentences/${task.index}/translations/${task.language}`);
          if (task.runId !== run?.id) continue;
          if (!translations.has(task.index)) translations.set(task.index, new Map());
          translations.get(task.index).set(task.language, translated);
          persistHistory();
          if (outputLanguage === task.language) showSentence(task.index);
        } catch (error) {
          if (outputLanguage === task.language && activeSentence === task.index) {
            const card = sentenceCards.get(task.index);
            card.append(node('p', `Translation unavailable: ${error.message}`, 'hint'));
          }
        }
      }
    } finally { translating = false; }
  }
  function queueTranslations(index) {
    const preferred = ['en','de','fr','it','rm'];
    for (const language of preferred) if (language !== run.language && !translations.get(index)?.has(language)) translationQueue.push({runId:run.id, index, language});
    void processTranslationQueue();
  }
  function setOutputLanguage(language) {
    if (!languageNames[language]) return;
    outputLanguage = language; localStorage.setItem('polinews.language', language);
    document.documentElement.lang = language;
    for (const button of document.querySelectorAll('[data-language]')) button.setAttribute('aria-pressed', String(button.dataset.language === language));
    el('moreLanguage').value = ['fr','it','rm'].includes(language) ? language : 'more';
    if (activeSentence !== null) showSentence(activeSentence);
    if (topicHoverIndex !== null) {
      const anchor = el('submittedStoryText').querySelector(`[data-index="${topicHoverIndex}"]`);
      if (anchor) showTopicHover(topicHoverIndex, anchor);
    }
  }
  async function loadCustomTopics() {
    try {
      const response = await fetch('/api/topics');
      if (!response.ok) throw new Error('Could not load saved topics.');
      const topics = (await response.json()).filter(topic => topic.scheme === 'custom');
      const selected = new Set([...el('customTopics').selectedOptions].map(option => option.value));
      const bulkSelected = el('bulkTopic').value;
      el('bulkTopic').replaceChildren(node('option', 'APS standard topics'));
      el('bulkTopic').options[0].value = 'aps';
      for (const topic of topics) {
        const option = node('option', `${topic.name} · v${topic.version}`); option.value = topic.id; el('bulkTopic').append(option);
      }
      if ([...el('bulkTopic').options].some(option => option.value === bulkSelected)) el('bulkTopic').value = bulkSelected;
      el('customTopics').replaceChildren();
      for (const topic of topics) {
        const option = document.createElement('option'); option.value = topic.id;
        option.textContent = `${topic.name} · v${topic.version}`; option.selected = selected.has(topic.id);
        el('customTopics').append(option);
      }
    } catch (error) { el('customTopicStatus').textContent = error.message; }
  }
  el('draftCustomTopic').addEventListener('click', async () => {
    const name = el('customTopicName').value.trim();
    if (!name) { el('customTopicStatus').textContent = 'Enter a topic name first.'; return; }
    el('draftCustomTopic').disabled = true; el('customTopicStatus').textContent = 'Apertus is drafting a definition for your review…';
    try {
      const draft = await post('/api/topics/draft', {name});
      el('customTopicDefinition').value = draft.definition;
      el('customTopicKeywords').value = JSON.stringify({de:draft.keywords_de, fr:draft.keywords_fr, it:draft.keywords_it}, null, 2);
      el('customTopicStatus').textContent = 'Draft only. Review the definition and keywords before saving.';
    } catch (error) { el('customTopicStatus').textContent = error.message; }
    finally { el('draftCustomTopic').disabled = false; }
  });
  el('saveCustomTopic').addEventListener('click', async () => {
    const name = el('customTopicName').value.trim(), definition = el('customTopicDefinition').value.trim();
    if (!name || definition.length < 10) { el('customTopicStatus').textContent = 'Enter a name and a definition of at least 10 characters.'; return; }
    el('saveCustomTopic').disabled = true;
    try {
      const topic = await post('/api/topics', {name, definition, keywords:JSON.parse(el('customTopicKeywords').value || '{}')});
      await loadCustomTopics();
      for (const option of el('customTopics').options) if (option.value === topic.id) option.selected = true;
      el('customTopicStatus').textContent = 'Saved. No retraining required; this topic will be applied to cited parliamentary affairs.';
    } catch (error) { el('customTopicStatus').textContent = error instanceof SyntaxError ? 'Keywords must be valid JSON.' : error.message; }
    finally { el('saveCustomTopic').disabled = false; }
  });
  function render(result, card) {
    result = result && typeof result === 'object' ? result : {};
    if (activeSentence === result.index) window.PoliGraphs.news(result);
    result.text = result.text || run?.sentences?.[result.index]?.text || '';
    const claims = Array.isArray(result.claims) ? result.claims : [];
    const status = result.status || 'unverified';
    const heading = result.scope === 'apolitical' ? label('apolitical') : label(status);
    card.replaceChildren(node('h3', `${label('sentence')} ${result.index + 1} · ${heading}`));
    if (result.needs_review) card.append(node('p', result.review_notice, 'reviewNotice'));
    card.className = `factCard ${status}`;
    let content = card;
    if (result.scope === 'apolitical') {
      content = document.createElement('details'); content.append(node('summary', 'Show apolitical sentence')); card.append(content);
    }
    if (result.scope === 'apolitical' || !claims.length) content.append(node('p', result.text || '', 'sentenceText'));
    else renderInlineAssessment(result, content);
    if (result.scope && result.scope !== 'apolitical' && !claims.length) content.append(node('p', label('noAssessment'), 'error'));
    if (result.scope_explanation) { content.append(node('h4', sectionLabel('assessment'), 'resultSectionTitle'), node('p', result.scope_explanation, 'hint')); }
    if (result.input_language && result.input_language !== 'en' && result.sentence_english) {
      const interpretation = document.createElement('details'); interpretation.append(node('summary', 'Machine-translated meaning used for comparison (English)'), node('p', result.sentence_english)); content.append(interpretation);
    }
    for (const claim of claims) {
      const block = node('section', '', `claim ${claim.verdict}`);
      block.append(node('h4', sectionLabel('claims'), 'resultSectionTitle'));
      block.append(node('strong', label(claim.verdict)), node('p', claim.text), node('p', claim.explanation));
      if (claim.correction) block.append(node('h5', sectionLabel('correction'), 'resultSubsectionTitle'), node('p', claim.correction, 'correction'));
      if (claim.evidence?.length) block.append(node('h5', sectionLabel('evidence'), 'resultSubsectionTitle'));
      for (const evidence of Array.isArray(claim.evidence) ? claim.evidence : []) {
        block.append(node('blockquote', evidence.quote));
        try {
          const url = new URL(evidence.source_url);
          if (['http:', 'https:'].includes(url.protocol)) {
            const link = node('a', `Archive source · affair ${evidence.affair_id}`); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; block.append(link);
          }
        } catch { block.append(node('span', 'Source link unavailable')); }
      }
      content.append(block);
    }
    if (result.matched_affairs?.length) {
      const sources = document.createElement('section'); sources.className = 'recordSection'; sources.append(node('h4', sectionLabel('records'), 'resultSectionTitle'));
      for (const affair of result.matched_affairs) {
        sources.append(node('p', `${affair.id} · ${Object.values(affair.titles).join(' / ')}`));
        const provenance = affair.provenance || {};
        sources.append(node('p', provenance.authors?.length ? `${label('affairAuthor')}: ${provenance.authors.map(a => a.name).join(', ')}` : label('authorMissing')));
        const events = document.createElement('ol'); events.className = 'eventTimeline';
        if (provenance.record_start_date) {
          const item = document.createElement('li'); item.append(node('time', provenance.record_start_date), node('span', label('affairOpened'))); events.append(item);
        }
        for (const event of provenance.events || []) {
          const item = document.createElement('li'); item.append(node('time', event.date), node('span', `${event.label}${event.actor ? ' · ' + event.actor : ''}`)); events.append(item);
        }
        if (events.childElementCount) sources.append(events);
        if (provenance.attribution_note) sources.append(node('p', provenance.attribution_note, 'hint'));
        try {
          const url = new URL(provenance.original_url);
          if (['https:', 'http:'].includes(url.protocol)) {
            const link = node('a', label('originalRecord')); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
          }
        } catch {}
        for (const warning of provenance.warnings || []) sources.append(node('p', warning, 'hint'));
      }
      content.append(sources);
    }
    if (result.topic_errors?.length) {
      const topicNotes = node('section', '', 'topicLabels'); topicNotes.append(node('h4', sectionLabel('topicIssues'), 'resultSectionTitle'));
      for (const error of result.topic_errors) topicNotes.append(node('p', error, 'hint'));
      content.append(topicNotes);
    }
    if (result.retrieval) {
      const retrieval = result.retrieval;
      const coverage = retrieval.coverage || {};
      const details = document.createElement('details'); details.append(node('summary', sectionLabel('scope')));
      details.append(node('p', `${coverage.affairs ?? '?'} affairs in catalogue; ${coverage.with_text ?? '?'} have cached text; ${coverage.with_embeddings ?? '?'} have embeddings.`));
      const candidates = Array.isArray(retrieval.candidate_ids) ? retrieval.candidate_ids : [];
      details.append(node('p', `${label('searched')}: ${candidates.join(', ') || 'none'}. ${retrieval.passages ?? 0} ${label('sourcePassages')}. ${retrieval.anchored ? label('anchored') : label('keywordSearch')}`));
      for (const warning of retrieval.warnings || []) details.append(node('p', warning));
      content.append(details);
    }
    content.append(node('p', result.notice, 'hint'));
    if (['apolitical', 'other_political'].includes(result.scope) && !claims.length) {
      const runId = run.id;
      const retry = node('button', label('retry'), 'secondary');
      retry.onclick = async () => {
        retry.disabled = true;
        try { render(await post(`/api/fact-checks/${runId}/sentences/${result.index}?force_archive=true`), card); }
        catch (error) { content.append(node('p', error.message, 'error')); retry.disabled = false; }
      };
      content.append(retry);
    }
    sentenceCards.set(result.index, card);
    updateStorySentence(result);
    if (activeSentence === result.index) fillResponsePanel(card, result.index);
  }
  async function process() {
    busy = true; stopped = false;
    el('checkNews').disabled = true; el('news').disabled = true; el('newsModel').disabled = true; el('stopNews').disabled = false; el('resumeNews').hidden = true;
    for (const sentence of run.sentences) {
      if (stopped) break;
      if (completed.has(sentence.index)) continue;
      const card = sentenceCards.get(sentence.index);
      el('factProgress').textContent = `Checking ${sentence.index + 1} / ${run.sentences.length}`;
      try {
        const checked = await post(`/api/fact-checks/${run.id}/sentences/${sentence.index}`);
        results.set(sentence.index, checked); translations.set(sentence.index, new Map());
        const selectedResult = outputLanguage === run.language ? checked : translatedResult(sentence.index);
        if (selectedResult) render(selectedResult, card); else showSentence(sentence.index);
        completed.add(sentence.index);
        persistHistory();
        queueTranslations(sentence.index);
      } catch (error) {
        card.replaceChildren(node('h3', `Sentence ${sentence.index + 1} · Check failed`), node('p', sentence.text), node('p', error.message, 'error'));
        updateStorySentence({index:sentence.index, status:'unverified'});
        if (activeSentence === sentence.index) setActiveSentence(sentence.index);
      }
    }
    busy = false;
    el('checkNews').disabled = false; el('news').disabled = false; el('newsModel').disabled = false; el('stopNews').disabled = true;
    el('resumeNews').hidden = completed.size === run.sentences.length;
    el('factProgress').textContent = `${completed.size} / ${run.sentences.length} checked${stopped ? ' · Paused' : ''}`;
  }
  async function startFactCheck(submittedText, topic_ids, model) {
    if (busy) return;
    busy = true; el('checkNews').disabled = true;
    try {
      const created = await post('/api/fact-checks', {text:submittedText, language:outputLanguage, topic_ids, model});
      if (!created || typeof created.id !== 'string' || !Array.isArray(created.sentences)) throw new Error('The server did not create a fact-check run. Please retry.');
      run = {...created, text:submittedText, topic_ids, createdAt:new Date().toISOString()}; completed.clear(); results.clear(); translations.clear();
      el('news').value = submittedText; el('newsModel').value = model; el('factEntry').hidden = true;
      makeSubmittedStory(run); persistHistory(); el('storyReview').scrollIntoView({behavior:'smooth', block:'start'});
      await process();
    } catch (error) { busy = false; el('checkNews').disabled = false; throw error; }
  }
  function enterStoryEdit(text = run?.text || '') {
    el('storyDraft').value = text;
    el('storyTimeline').hidden = true; el('submittedStoryText').hidden = true; el('storyEditor').hidden = false;
    el('storyDraft').focus();
  }
  el('factForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    try {
      const topic_ids = [...el('customTopics').selectedOptions].map(option => option.value);
      if (topic_ids.length > 3) throw new Error('Select no more than three custom topics.');
      await startFactCheck(el('news').value, topic_ids, el('newsModel').value);
    } catch (error) { el('factProgress').textContent = error.message; el('checkNews').disabled = false; }
  });
  el('editStory').onclick = () => enterStoryEdit();
  el('cancelStoryEdit').onclick = () => { el('storyEditor').hidden = true; el('storyTimeline').hidden = false; el('submittedStoryText').hidden = false; };
  el('saveStoryEdit').onclick = async () => {
    const updated = el('storyDraft').value.trim();
    if (!updated) { el('factProgress').textContent = 'Add story text before rechecking.'; return; }
    el('saveStoryEdit').disabled = true;
    try { await startFactCheck(updated, run?.topic_ids || [], run?.model || el('newsModel').value); }
    catch (error) { el('factProgress').textContent = error.message; }
    finally { el('saveStoryEdit').disabled = false; }
  };
  el('newCheck').onclick = () => {
    if (busy) return;
    el('storyReview').hidden = true; el('factEntry').hidden = false; el('factProgress').textContent = '';
    el('news').value = ''; el('news').focus(); el('applicationPages').scrollTo({top:0, behavior:'smooth'});
  };
  el('stopNews').onclick = () => { stopped = true; el('stopNews').disabled = true; el('factProgress').textContent = 'Stopping after the current sentence finishes…'; };
  el('resumeNews').onclick = () => { if (!busy) process(); };
  function duration(seconds) {
    if (!Number.isFinite(seconds)) return 'Calculating…';
    const minutes = Math.round(seconds / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
    if (days) return `${days}d ${hours % 24}h`;
    if (hours) return `${hours}h ${minutes % 60}m`;
    return `${minutes} minutes`;
  }
  function renderTopicRanking(topics, done) {
    const chart = el('topicRanking');
    const signature = JSON.stringify([topics, done]);
    if (chart.dataset.signature === signature) return;
    chart.dataset.signature = signature;
    chart.replaceChildren();
    el('topicRankingSummary').textContent = `${topics.length.toLocaleString()} topics · ${done.toLocaleString()} completed affairs`;
    el('topicRankingEmpty').hidden = topics.length > 0;
    const maximum = Math.max(1, ...topics.map(topic => topic.count));
    topics.forEach((topic, index) => {
      const row = document.createElement('li');
      row.className = 'topicRankRow';
      const rank = document.createElement('span');
      rank.className = 'topicRankNumber'; rank.textContent = String(index + 1).padStart(2, '0');
      const body = document.createElement('div'); body.className = 'topicRankBody';
      const heading = document.createElement('div'); heading.className = 'topicRankHeading';
      const name = document.createElement('span'); name.textContent = topic.name || topic.topic_id;
      const count = document.createElement('span'); count.className = 'topicRankCount';
      count.textContent = `${topic.count.toLocaleString()} affairs`;
      count.title = `${done ? (topic.count / done * 100).toFixed(1) : 0}% of completed affairs`;
      heading.append(name, count);
      const track = document.createElement('div'); track.className = 'topicRankTrack'; track.setAttribute('aria-hidden', 'true');
      const bar = document.createElement('div'); bar.className = 'topicRankBar';
      bar.style.width = `${topic.count / maximum * 100}%`;
      track.append(bar); body.append(heading, track); row.append(rank, body); chart.append(row);
    });
  }
  function renderRunQuality(quality) {
    if (!quality) { el('qualityUpdated').textContent = 'Quality data unavailable'; return; }
    const percentage = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
    const scores = quality.scores;
    [['qualityAccuracy','exact_match'],['qualityPrecision','micro_precision'],['qualityRecall','micro_recall'],['qualityF1','micro_f1']].forEach(([id, key]) => {
      el(id).textContent = scores ? percentage(scores[key]) : 'Judge warming up';
      el(id).classList.toggle('awaitingJudge', !scores);
    });
    el('qualitySample').textContent = `${quality.reviewed.toLocaleString()} judged / ${quality.completed.toLocaleString()} completed · ${quality.unjudgeable || 0} abstained · ${quality.judge_failed || 0} judge failures · ${Math.max(0, quality.completed - quality.reviewed - (quality.unjudgeable || 0) - (quality.judge_failed || 0))} awaiting judge`;
    const rate = (count, denominator) => `${count.toLocaleString()} · ${percentage(denominator ? count / denominator : null)}`;
    el('qualityTopics').textContent = rate(quality.with_topics, quality.completed);
    el('qualityEvidence').textContent = rate(quality.insufficient_evidence, quality.completed);
    el('qualityFailures').textContent = rate(quality.failed, quality.completed + quality.failed);
    el('qualityBasis').textContent = quality.basis;
    el('qualityConfusion').textContent = `Compared with the judge: ${quality.true_positive} matching labels · ${quality.false_positive} extra · ${quality.false_negative} missed. Judge: ${quality.judge_model || 'Apertus 70B'}. A dash means the metric has no denominator.`;
    el('qualityUpdated').textContent = `Updated ${new Date(quality.updated_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'})}`;
  }
  let jobPollInFlight = false;
  async function pollJob() {
    if (!bulkJob) return;
    if (jobPollInFlight) return;
    jobPollInFlight = true;
    try {
      const response = await fetch(`/api/jobs/${bulkJob.id}`, {cache:'no-store'});
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const job = await response.json();
      const counts = Object.fromEntries(job.progress.map(item => [item.status, item.count]));
      const done = counts.done || 0, failed = counts.failed || 0;
      el('jobStatus').textContent = `${job.status} · ${done.toLocaleString()} / ${job.total.toLocaleString()}`;
      const progress = el('classificationProgress');
      progress.max = job.total; progress.value = done;
      el('classificationPercent').textContent = `${(done / Math.max(1, job.total) * 100).toFixed(1)}%`;
      el('classificationDone').textContent = done.toLocaleString();
      renderTopicRanking(job.topic_distribution || [], done);
      renderRunQuality(job.quality);
      window.PoliGraphs.archive(job.topic_graph);
      el('classificationFailures').textContent = `Cases needing retry: ${failed.toLocaleString()}`;
      const remaining = job.live_estimated_remaining_seconds;
      const active = ['queued', 'running'].includes(job.status);
      const jobModel = job.config.model || 'apertus-v1-5-70b';
      el('classificationRate').textContent = job.live_cases_per_minute ? `${job.live_cases_per_minute.toFixed(1)} affairs / min` : 'Measuring…';
      el('jobDetail').textContent = `${jobModel} · APS classification${job.elapsed_seconds ? ` · running ${duration(job.elapsed_seconds)}` : ''}`;
      if (active && remaining !== null && Number.isFinite(remaining)) {
        el('estimateTime').textContent = duration(remaining);
        el('estimateDetail').textContent = `At the current run-rate · estimated finish ${new Date(Date.now() + remaining * 1000).toLocaleString()}`;
      } else if (!active) {
        el('estimateTime').textContent = job.status === 'completed' ? 'Complete' : 'Waiting to resume';
        el('estimateDetail').textContent = job.status === 'completed' ? 'All queued archive affairs are classified.' : 'The backend will continue this run when available.';
      } else {
        el('estimateTime').textContent = 'Measuring…';
        el('estimateDetail').textContent = 'A live finish estimate appears after the first cases complete.';
      }
      if (!active && ['paused','cancelled','completed_with_errors'].includes(job.status) && !job.resumable) el('jobDetail').textContent += ' · This saved run cannot resume with the current prompt version.';
    } catch (error) {
      el('jobDetail').textContent = `Progress connection interrupted: ${error.message}`;
      el('qualityUpdated').textContent = 'Connection interrupted · showing last update';
    } finally { jobPollInFlight = false; }
  }
  async function restoreJob() {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) return;
      const history = await response.json();
      const automatic = history.find(job => job.config?.continuous_archive);
      const active = history.find(job => ['queued','running'].includes(job.status));
      const resumable = history.find(job => job.resumable);
      const latest = automatic || active || resumable || history[0];
      if (!latest) {
        el('jobStatus').textContent = 'Waiting for archive runner';
        el('jobDetail').textContent = 'The backend starts the 300,000-affair run automatically when archive data is available.';
        return;
      }
      bulkJob = latest; el('bulkModel').value = latest.config.model || 'apertus-v1-5-8b'; el('bulkTopic').value = latest.topic_id || 'aps';
      await pollJob();
      jobTimer = setInterval(pollJob, 6000);
    } catch { el('jobDetail').textContent = 'Saved run status could not be loaded.'; }
  }
  loadCustomTopics().then(restoreJob);
  function tab(fact) {
    el('factDesk').hidden = !fact; el('researchDesk').hidden = fact;
    el('searchTab').innerHTML = fact ? '<span aria-hidden="true">⌕</span> Search' : '<span aria-hidden="true">←</span> Fact-check';
    el('searchTab').setAttribute('aria-label', fact ? 'Open archive research' : 'Return to fact-checking');
    window.dispatchEvent(new Event('resize'));
  }
  el('searchTab').onclick = () => tab(el('factDesk').hidden);
  el('historyMenu').onclick = () => openHistory(el('historyDrawer').hidden);
  el('closeHistory').onclick = () => openHistory(false);
  el('historyBackdrop').onclick = () => openHistory(false);
  el('clearHistory').onclick = () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); };
  if (!languageNames[outputLanguage]) outputLanguage = 'en';
  document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click', () => setOutputLanguage(button.dataset.language)));
  el('moreLanguage').addEventListener('change', () => { if (el('moreLanguage').value !== 'more') setOutputLanguage(el('moreLanguage').value); });
  setOutputLanguage(outputLanguage);
  renderHistory();
})();
