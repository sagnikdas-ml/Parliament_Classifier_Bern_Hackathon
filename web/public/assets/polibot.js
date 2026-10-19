(() => {
  const el = id => document.getElementById(id);
  const root = el('polibot'), panel = el('polibotPanel');
  let controller = null, audio = null, audioUrl = null, generation = 0, preferredDocument = null;
  let chatContext = null, history = [];
  function resetChat() {
    chatContext = null; history = [];
    el('polibotMessages').replaceChildren();
    el('polibotQuestion').value = '';
    el('polibotQuestion').disabled = true; el('polibotSend').disabled = true;
    el('polibotQuestion').placeholder = 'Summarize or explain a document first';
  }
  function chatMessage(role, text, sources = []) {
    const bubble = document.createElement('div'); bubble.className = 'polibotMessage ' + role;
    const label = document.createElement('strong'); label.textContent = role === 'user' ? 'You' : 'PoliBot';
    const body = document.createElement('p'); body.textContent = text; bubble.append(label, body);
    for (const source of sources) {
      try {
        const url = new URL(source.url);
        if (!['https:', 'http:'].includes(url.protocol)) continue;
        const link = document.createElement('a'); link.href = url.href; link.textContent = `Source #${source.id} ↗`;
        link.target = '_blank'; link.rel = 'noopener noreferrer'; bubble.append(link);
      } catch {}
    }
    const messages = el('polibotMessages'); messages.append(bubble); messages.scrollTop = messages.scrollHeight;
  }
  function context() {
    const research = !el('researchDesk').hidden;
    const supplied = (research ? window.PoliNewsResearchContext?.() : window.PoliNewsStoryContext?.()) || {};
    const {documents = [], ...body} = supplied;
    return {body, documents};
  }
  function refreshDocuments() {
    const {documents} = context(), select = el('polibotDocument');
    const previous = preferredDocument || Number(select.value);
    select.replaceChildren(new Option('Select a cited record', ''));
    for (const doc of documents) select.add(new Option(`#${doc.id} · ${doc.title}`, String(doc.id)));
    if (documents.some(doc => doc.id === previous)) select.value = String(previous);
    preferredDocument = null;
  }
  function stop(message = 'Speaking stopped.') {
    generation++;
    controller?.abort(); controller = null;
    if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); audio = null; }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
    root.dataset.speaking = 'false';
    el('polibotStop').disabled = true;
    el('polibotSend').disabled = !chatContext; el('polibotQuestion').disabled = !chatContext;
    el('polibotSummarize').disabled = false; el('polibotExplain').disabled = false;
    if (message) el('polibotStatus').textContent = message;
  }
  function open(value) {
    panel.hidden = !value;
    el('polibotLauncher').setAttribute('aria-expanded', String(value));
    el('polibotLauncher').setAttribute('aria-label', value ? 'Close PoliBot' : 'Open PoliBot');
    if (value) { refreshDocuments(); el('polibotSummarize').focus(); }
    else { stop(null); el('polibotLauncher').focus(); }
  }
  async function post(path, body, signal) {
    const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal});
    if (!response.ok) {
      let error; try { error = (await response.json()).detail; } catch {}
      throw new Error(typeof error === 'string' ? error : `PoliBot is unavailable (${response.status}). Your results are unchanged.`);
    }
    return response;
  }
  function render(data) {
    const output = el('polibotOutput'); output.replaceChildren();
    const text = document.createElement('p'); text.textContent = data.text; output.append(text);
    for (const source of data.sources || []) {
      const article = document.createElement('article');
      const title = document.createElement('h3'); title.textContent = `#${source.id} · ${source.title}`; article.append(title);
      const meta = document.createElement('p'); meta.textContent = `${source.body || 'Parliament'} · ${source.date || 'Date unavailable'} · ${source.status}`; article.append(meta);
      if (source.quote) {
        const quote = document.createElement('blockquote'); quote.textContent = source.quote; article.append(quote);
      }
      try {
        const url = new URL(source.url);
        if (['https:', 'http:'].includes(url.protocol)) {
          const link = document.createElement('a'); link.textContent = 'Original evidence ↗'; link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link);
        }
      } catch {}
      output.append(article);
    }
  }
  async function run(action) {
    stop(null);
    resetChat();
    const token = generation;
    const {body} = context();
    const request = {...body, action};
    if (action === 'document') {
      request.document_id = Number(el('polibotDocument').value) || null;
      if (!request.document_id) { el('polibotStatus').textContent = 'Open Evidence or select a cited document first.'; return; }
    }
    const current = controller = new AbortController();
    el('polibotSummarize').disabled = true; el('polibotExplain').disabled = true; el('polibotStop').disabled = false;
    el('polibotStatus').textContent = 'Reading existing evidence…';
    try {
      const response = await post('/api/polibot/summary', request, current.signal);
      const data = await response.json();
      if (token !== generation) return;
      render(data);
      chatContext = {...request, briefing_hash:data.briefing_hash};
      el('polibotQuestion').disabled = false; el('polibotSend').disabled = false;
      el('polibotQuestion').placeholder = 'e.g. What does this proposal ask for?';
      el('polibotStatus').textContent = 'Briefing ready. Based on cached results at the time you clicked.';
      if (!el('polibotVoice').checked) return;
      if (!data.speech_available) { el('polibotStatus').textContent = 'Briefing ready. Speech is not configured; text remains available.'; return; }
      el('polibotStatus').textContent = 'Preparing optional speech…';
      const speech = await post('/api/polibot/speech', {...request, briefing_hash:data.briefing_hash}, current.signal);
      const blob = await speech.blob();
      if (token !== generation || !el('polibotVoice').checked) return;
      audioUrl = URL.createObjectURL(blob); audio = new Audio(audioUrl);
      audio.onended = () => { if (token === generation) stop('Finished speaking.'); };
      audio.onerror = () => { if (token === generation) stop('Audio could not be played. Read the briefing above.'); };
      await audio.play();
      if (token === generation) { root.dataset.speaking = 'true'; el('polibotStatus').textContent = 'Speaking in English…'; }
    } catch (error) {
      if (token === generation && error.name !== 'AbortError') stop(`${error.message} The text briefing remains available if generated.`);
    } finally {
      if (token === generation) {
        el('polibotSummarize').disabled = false; el('polibotExplain').disabled = false;
        if (!audio) el('polibotStop').disabled = true;
      }
    }
  }
  el('polibotChatForm').addEventListener('submit', async event => {
    event.preventDefault();
    const question = el('polibotQuestion').value.trim();
    if (!question || !chatContext || el('polibotSend').disabled) return;
    stop(null);
    const token = generation, current = controller = new AbortController();
    chatMessage('user', question);
    el('polibotQuestion').value = ''; el('polibotQuestion').disabled = true; el('polibotSend').disabled = true;
    el('polibotSummarize').disabled = true; el('polibotExplain').disabled = true; el('polibotStop').disabled = false;
    el('polibotStatus').textContent = 'Reading document passages and reasoning about your question…';
    try {
      const response = await post('/api/polibot/chat', {context:chatContext, question, history}, current.signal);
      const data = await response.json();
      if (token !== generation) return;
      chatContext.briefing_hash = data.briefing_hash || chatContext.briefing_hash;
      chatMessage('assistant', data.answer, data.sources);
      history = [...history, {role:'user',text:question}, {role:'assistant',text:data.answer}].slice(-6);
      el('polibotStatus').textContent = data.answer_kind === 'background' ? 'General background — not verification of the submitted claim.' : data.sources?.length ? 'Answer ready. Check the cited source before using it.' : 'Explanation ready. This does not independently verify the claim.';
    } catch (error) {
      if (token === generation && error.name !== 'AbortError') { chatMessage('assistant', error.message); el('polibotStatus').textContent = 'Question could not be answered. Please try again.'; }
    } finally {
      if (token === generation) {
        el('polibotQuestion').disabled = false; el('polibotSend').disabled = false;
        el('polibotSummarize').disabled = false; el('polibotExplain').disabled = false; el('polibotStop').disabled = true;
        el('polibotQuestion').focus();
      }
    }
  });
  el('polibotLauncher').onclick = () => open(panel.hidden);
  el('polibotClose').onclick = () => open(false);
  el('polibotSummarize').onclick = () => run('summary');
  el('polibotExplain').onclick = () => run('document');
  el('polibotDocument').addEventListener('focus', refreshDocuments);
  el('polibotDocument').addEventListener('change', () => { stop(null); resetChat(); });
  el('polibotStop').onclick = () => stop();
  el('polibotVoice').onchange = () => { if (!el('polibotVoice').checked) stop('Speech disabled. Text briefings remain available.'); };
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); open(false); } });
  window.addEventListener('polinews:document', event => {
    stop(null);
    resetChat();
    preferredDocument = event.detail.id;
    // Modal evidence dialogs are in the browser's top layer. Keep the widget usable there.
    if (el('detail').open) el('detail').append(root);
    refreshDocuments();
  });
  el('detail').addEventListener('close', () => { document.body.append(root); stop(null); });
  // Switching story/search or creating a new run must not leave an old narration playing.
  for (const id of ['searchTab', 'historyList', 'newCheck', 'factForm', 'searchForm']) {
    el(id)?.addEventListener(id.endsWith('Form') ? 'submit' : 'click', () => { stop('Context changed. Generate a new briefing.'); el('polibotOutput').replaceChildren(); resetChat(); refreshDocuments(); });
  }
  window.addEventListener('pagehide', () => stop(null));
  fetch('/api/polibot/status', {cache:'no-store'}).then(response => response.ok ? response.json() : null).then(data => {
    if (!data?.speech_available) el('polibotSpeechNote').textContent = 'Speech is not configured on this server. Text briefings work normally.';
  }).catch(() => {});
})();
