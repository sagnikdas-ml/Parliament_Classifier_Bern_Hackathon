(() => {
  const el = id => document.getElementById(id);
  const labels = {supported:'Supported by archives', contradicted:'Contradicted by archives', unverified:'Needs review · unverified', not_factual:'Opinion / not a factual assertion', apolitical:'Apolitical', other_political:'Outside Swiss parliamentary scope', uncertain:'Scope uncertain', mixed:'Mixed — inspect each claim'};
  let run = null, stopped = false, busy = false;
  const completed = new Set();
  const results = new Map();
  function reviewSummary() {
    const count = [...results.values()].filter(result => result.needs_review).length;
    el('reviewSummary').hidden = results.size === 0;
    el('reviewSummary').textContent = count
      ? `${count} sentence${count === 1 ? '' : 's'} need editorial review. Apolitical sentences are excluded.`
      : 'No review flags among checked sentences. Apolitical sentences are excluded.';
  }
  function node(tag, text, className) {
    const n = document.createElement(tag); n.textContent = text;
    if (className) n.className = className;
    return n;
  }
  async function post(path, body = {}) {
    const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to check this sentence. Retry.');
    return data;
  }
  async function loadCustomTopics() {
    try {
      const response = await fetch('/api/topics');
      if (!response.ok) throw new Error('Could not load saved topics.');
      const topics = (await response.json()).filter(topic => topic.scheme === 'custom');
      const selected = new Set([...el('customTopics').selectedOptions].map(option => option.value));
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
    results.set(result.index, result); reviewSummary();
    const heading = result.scope === 'apolitical' ? labels.apolitical : labels[result.status] || result.status;
    card.replaceChildren(node('h3', `Sentence ${result.index + 1} · ${heading}`));
    if (result.needs_review) card.append(node('p', result.review_notice, 'reviewNotice'));
    card.className = `factCard ${result.status}`;
    let content = card;
    if (result.scope === 'apolitical') {
      content = document.createElement('details'); content.append(node('summary', 'Show apolitical sentence')); card.append(content);
    }
    content.append(node('p', result.text, 'sentenceText'), node('p', result.scope_explanation, 'hint'));
    if (result.input_language && result.input_language !== 'en' && result.sentence_english) {
      const interpretation = document.createElement('details'); interpretation.append(node('summary', 'Machine-translated meaning used for comparison (English)'), node('p', result.sentence_english)); content.append(interpretation);
    }
    for (const claim of result.claims) {
      const block = node('section', '', `claim ${claim.verdict}`);
      block.append(node('strong', result.scope === 'apolitical' && claim.verdict === 'unverified' ? 'Unverified' : labels[claim.verdict]), node('p', claim.text), node('p', claim.explanation));
      if (claim.correction) block.append(node('p', `Suggested correction: ${claim.correction}`, 'correction'));
      if (claim.correction) block.append(node('strong', 'Source evidence for this correction'));
      for (const evidence of claim.evidence) {
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
      const sources = document.createElement('section'); sources.append(node('strong', 'Source, author and recorded dates')); 
      for (const affair of result.matched_affairs) {
        sources.append(node('p', `${affair.id} · ${Object.values(affair.titles).join(' / ')}`));
        const provenance = affair.provenance || {};
        sources.append(node('p', provenance.authors?.length ? `Affair author: ${provenance.authors.map(a => a.name).join(', ')}` : 'Affair author: not available in the retrieved metadata.'));
        if (provenance.record_start_date) sources.append(node('p', `Affair start date: ${provenance.record_start_date}`));
        for (const event of provenance.events || []) sources.append(node('p', `${event.label}: ${event.date}${event.actor ? ' · ' + event.actor : ''}`));
        if (provenance.attribution_note) sources.append(node('p', provenance.attribution_note, 'hint'));
        try {
          const url = new URL(provenance.original_url);
          if (['https:', 'http:'].includes(url.protocol)) {
            const link = node('a', 'Original parliamentary record'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
          }
        } catch {}
        for (const warning of provenance.warnings || []) sources.append(node('p', warning, 'hint'));
      }
      content.append(sources);
    }
    if (result.topics?.length) {
      const topics = node('section', '', 'topicLabels');
      topics.append(node('strong', 'Topics of the cited affairs'));
      const seen = new Set();
      for (const topic of result.topics) {
        const key = `${topic.scheme}:${topic.topic_id}:${topic.affair_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        topics.append(node('p', `${topic.scheme === 'APS' && topic.chapter?.de ? topic.chapter.de + ' → ' : ''}${topic.name} · ${topic.scheme} · affair ${topic.affair_id}`));
      }
      content.append(topics);
    }
    for (const error of result.topic_errors || []) content.append(node('p', error, 'hint'));
    if (result.retrieval) {
      const retrieval = result.retrieval;
      const coverage = retrieval.coverage || {};
      const details = document.createElement('details'); details.append(node('summary', 'Archive coverage and retrieval'));
      details.append(node('p', `${coverage.affairs ?? '?'} affairs in catalogue; ${coverage.with_text ?? '?'} have cached text; ${coverage.with_embeddings ?? '?'} have embeddings.`));
      details.append(node('p', `Searched affairs: ${retrieval.candidate_ids.join(', ') || 'none'}. ${retrieval.passages} source passages. ${retrieval.anchored ? 'Matched a named affair in this article.' : 'Multilingual keyword and available semantic retrieval.'}`));
      for (const warning of retrieval.warnings || []) details.append(node('p', warning));
      content.append(details);
    }
    content.append(node('p', result.notice, 'hint'));
    if (['apolitical', 'other_political'].includes(result.scope) && !result.claims.length) {
      const runId = run.id;
      const retry = node('button', 'Check against archives anyway', 'secondary');
      retry.onclick = async () => {
        retry.disabled = true;
        try { render(await post(`/api/fact-checks/${runId}/sentences/${result.index}?force_archive=true`), card); }
        catch (error) { content.append(node('p', error.message, 'error')); retry.disabled = false; }
      };
      content.append(retry);
    }
  }
  async function process() {
    busy = true; stopped = false;
    el('checkNews').disabled = true; el('news').disabled = true; el('newsLanguage').disabled = true; el('stopNews').disabled = false; el('resumeNews').hidden = true;
    for (const sentence of run.sentences) {
      if (stopped) break;
      if (completed.has(sentence.index)) continue;
      const card = el(`sentence-${sentence.index}`);
      el('factProgress').textContent = `Checking sentence ${sentence.index + 1} of ${run.sentences.length}…`;
      try {
        render(await post(`/api/fact-checks/${run.id}/sentences/${sentence.index}`), card);
        completed.add(sentence.index);
      } catch (error) {
        card.replaceChildren(node('h3', `Sentence ${sentence.index + 1} · Check failed`), node('p', sentence.text), node('p', error.message, 'error'));
      }
    }
    busy = false;
    el('checkNews').disabled = false; el('news').disabled = false; el('newsLanguage').disabled = false; el('stopNews').disabled = true;
    el('resumeNews').hidden = completed.size === run.sentences.length;
    el('factProgress').textContent = `${completed.size} of ${run.sentences.length} sentences checked.${stopped ? ' Stopped after the current sentence.' : ''} Unverified claims are not labelled false.`;
  }
  el('factForm').addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    el('checkNews').disabled = true;
    try {
      const topic_ids = [...el('customTopics').selectedOptions].map(option => option.value);
      if (topic_ids.length > 3) throw new Error('Select no more than three custom topics.');
      run = await post('/api/fact-checks', {text:el('news').value, language:el('newsLanguage').value, topic_ids}); completed.clear(); results.clear(); reviewSummary(); el('factResults').replaceChildren();
      for (const sentence of run.sentences) {
        const card = node('article', '', 'factCard'); card.id = `sentence-${sentence.index}`;
        card.append(node('h3', `Sentence ${sentence.index + 1} · Waiting`), node('p', sentence.text)); el('factResults').append(card);
      }
      await process();
    } catch (error) { el('factProgress').textContent = error.message; el('checkNews').disabled = false; }
  });
  el('stopNews').onclick = () => { stopped = true; el('stopNews').disabled = true; el('factProgress').textContent = 'Stopping after the current sentence finishes…'; };
  el('resumeNews').onclick = () => { if (!busy) process(); };
  loadCustomTopics();
  function tab(fact) {
    el('factDesk').hidden = !fact; el('researchDesk').hidden = fact;
    el('factTab').setAttribute('aria-pressed', String(fact)); el('researchTab').setAttribute('aria-pressed', String(!fact));
    window.dispatchEvent(new Event('resize'));
  }
  el('factTab').onclick = () => tab(true); el('researchTab').onclick = () => tab(false);
})();
