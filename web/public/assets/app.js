const byId = (id) => document.getElementById(id);
const state = { topics: [], results: [], shortlist: new Map(), topic: "", busy: false };
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
function link(url, label = "Original source ↗") {
  try { const parsed = new URL(url); if (!["http:", "https:"].includes(parsed.protocol)) return "Source link unavailable"; }
  catch { return "Source link unavailable"; }
  return `<a href="${escapeText(url)}" target="_blank" rel="noopener noreferrer">${escapeText(label)}</a>`;
}
function notice(message, error = false) { byId("notice").textContent = message; byId("notice").classList.toggle("error", error); }
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  if (!response.ok) { let detail; try { detail = (await response.json()).detail; } catch {} throw new Error(typeof detail === "string" ? detail : `Request failed (${response.status}). Check your backend and try again.`); }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}
async function work(action) {
  if (state.busy) return;
  state.busy = true;
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  try { await action(); } catch (error) { notice(error.message, true); }
  finally { state.busy = false; document.querySelectorAll("button").forEach((button) => { button.disabled = false; }); updateShortlist(); }
}
function title(record) { return Object.values(record.titles || {})[0] || `Affair ${record.id}`; }
async function loadTopics(selected = "") {
  state.topics = await api("/api/topics");
  byId("topic").innerHTML = '<option value="">Choose a topic…</option><option value="aps">APS standard topics</option>' + state.topics.filter((item) => item.scheme !== "aps").map((item) => `<option value="${escapeText(item.id)}">${escapeText(item.name)} · v${item.version}</option>`).join("");
  byId("topic").value = selected;
  state.topic = selected;
}
function resetResults() { state.results = []; renderResults(); state.shortlist.clear(); updateShortlist(); }
byId("topic").onchange = () => {
  if (state.busy) { byId("topic").value = state.topic; return; }
  state.topic = byId("topic").value; resetResults();
  const topic = state.topics.find((item) => item.id === state.topic);
  if (topic) { byId("issue").value = topic.name; byId("definition").value = topic.definition; byId("keywords").value = topic.raw || "{}"; }
  byId("topicInfo").textContent = topic ? `Approved definition v${topic.version}. Editing fields does not change it: approve again to create a new topic.` : "APS labels classify policy subjects; enter a discovery query.";
};
byId("draft").onclick = () => work(async () => {
  notice("Apertus is suggesting a scope. Review it before approving.");
  const draft = await api("/api/topics/draft", {name: byId("issue").value});
  byId("definition").value = draft.definition; byId("keywords").value = JSON.stringify({de: draft.keywords_de, fr: draft.keywords_fr, it: draft.keywords_it}, null, 2);
  notice("Scope drafted—not approved. Check its inclusion and exclusion criteria.");
});
byId("approve").onclick = () => work(async () => {
  const topic = await api("/api/topics", {name: byId("issue").value, definition: byId("definition").value, keywords: JSON.parse(byId("keywords").value)});
  await loadTopics(topic.id); resetResults(); byId("topicInfo").textContent = "Scope approved. Search for candidates, then classify individual affairs."; notice("Topic saved. No retraining required.");
});
byId("search").onclick = () => work(async () => {
  const parameters = new URLSearchParams({limit: "20", semantic: String(byId("semantic").checked)});
  const query = byId("query").value.trim();
  if (query) parameters.set("q", query);
  else if (state.topic && state.topic !== "aps") parameters.set("topic_id", state.topic);
  else throw new Error("Enter a discovery query or approve a custom topic.");
  if (state.topic) parameters.set("topic_id", state.topic);
  for (const [element, parameter] of [["body","body"],["language","language"],["from","date_from"],["to","date_to"]]) if (byId(element).value) parameters.set(parameter, byId(element).value);
  notice("Searching the local collection. First semantic search may load the embedding model…");
  const response = await api(`/api/search?${parameters}`); state.results = response.results;
  byId("searchInfo").textContent = `${response.elapsed_seconds}s · ${response.semantic_enabled ? "Keyword + semantic" : "Keyword only"} retrieval. ${response.notice}`;
  renderResults(); notice("Candidates found. A retrieved result is not yet a confirmed topic match.");
});
byId("matches").onchange = renderResults;
function renderResults() {
  const records = state.results.filter((item) => !byId("matches").checked || item.classification?.status === "relevant");
  byId("resultCount").textContent = `${records.length} of ${state.results.length} candidates shown`;
  byId("results").innerHTML = records.map((item) => {
    const prediction = item.classification;
    const status = prediction?.status === "relevant" ? "Suggested match" : prediction?.status === "not_relevant" ? "Suggested non-match" : prediction ? "Insufficient evidence" : "Unclassified candidate";
    return `<article class="result"><div class="meta">${escapeText(item.body_key)} · ${escapeText(item.begin_date || "Date unknown")} · ${escapeText(Object.keys(item.titles).join(" / "))} · #${item.id}</div><h3>${escapeText(title(item))}</h3><span class="badge ${prediction?.status === "relevant" ? "match" : "warning"}">${status}</span> ${!item.has_full_text ? '<span class="badge warning">Title-only cache</span>' : ""}<p class="hint">${prediction ? escapeText(prediction.labels.map((label) => label.name).join(" · ")) : "Classify against your selected scope to assess relevance."}</p><button data-action="inspect" data-id="${item.id}" class="secondary">Inspect sources</button><button data-action="classify" data-id="${item.id}">Classify topic</button><button data-action="select" data-id="${item.id}" class="secondary">${state.shortlist.has(item.id) ? "Remove from shortlist" : "+ Shortlist"}</button></article>`;
  }).join("") || '<section class="empty">No results in this view. Broaden filters, search another term, or classify candidates before filtering to matches.</section>';
}
byId("results").onclick = (event) => {
  const button = event.target.closest("button[data-id]"); if (!button || state.busy) return;
  const identifier = Number(button.dataset.id); const record = state.results.find((item) => item.id === identifier);
  if (button.dataset.action === "select") { state.shortlist.has(identifier) ? state.shortlist.delete(identifier) : state.shortlist.set(identifier, record); renderResults(); updateShortlist(); return; }
  work(async () => {
    if (button.dataset.action === "classify") {
      if (!state.topic) throw new Error("Approve or select a topic first.");
      notice("Fetching source texts and asking Apertus to classify this affair…");
      record.classification = await api(`/api/affairs/${identifier}/classify`, {topic_id: state.topic, language: byId("language").value || null});
      renderResults(); notice("Classification saved. Inspect the original evidence before using it.");
    }
    await inspect(identifier);
  });
};
async function inspect(identifier) {
  const record = await api(`/api/affairs/${identifier}`);
  const predictions = record.classifications.filter((item) => item.topic_id === (state.topic || "aps"));
  const prediction = predictions.find((item) => item.current);
  const units = new Map(record.units.map((item) => [item.id, item]));
  const evidence = (prediction?.labels || []).map((label) => {
    const source = units.get(label.evidence.unit_id);
    if (!source || !source.text.includes(label.evidence.quote)) return '<p class="hint">Evidence no longer matches the cached source. Reclassify.</p>';
    return `<h3>${escapeText(label.name)}</h3><blockquote>${escapeText(label.evidence.quote)}</blockquote>${link(source.source_url)}`;
  }).join("");
  byId("detailContent").innerHTML = `<p class="eyebrow">SOURCE INSPECTION / #${identifier}</p><h2>${escapeText(title(record))}</h2>${link(record.source_url)}<p class="hint">${prediction ? `Current model suggestion: ${escapeText(prediction.status)} · ${escapeText(prediction.model)}` : "No current classification for this scope. Older predictions are not presented as current."}</p>${prediction?.partial_content ? '<p class="badge warning">Only part of the available content was classified.</p>' : ""}${evidence}${prediction ? '<div class="actions"><button data-review="keep">Mark relevant</button><button data-review="reject" class="secondary">Mark not relevant</button></div><p class="hint">Corrections are stored separately. Use the classification lab to edit individual APS labels.</p>' : ""}<h3>Previous reviewer decisions</h3>${record.reviews.map((review) => `<p class="hint">${escapeText(review.topic_id)} / ${escapeText(review.language)}: ${review.relevant ? "relevant" : "not relevant"} · ${review.frozen ? "frozen" : "editable"}. Historical decisions may need re-review.</p>`).join("") || '<p class="hint">None yet.</p>'}<h3>Available source texts</h3>${record.units.map((unit) => `<details><summary>${escapeText(unit.kind)} · ${escapeText(unit.language)} · ${unit.text.length.toLocaleString()} characters</summary>${link(unit.source_url)}<p>${escapeText(unit.text)}</p></details>`).join("")}`;
  byId("detailContent").querySelectorAll("button[data-review]").forEach((button) => { button.onclick = () => work(async () => {
    const relevant = button.dataset.review === "keep";
    const labels = relevant ? (state.topic === "aps" ? prediction.labels.map((label) => label.topic_id) : [state.topic]) : [];
    if (relevant && !labels.length) throw new Error("Use the classification lab to select the correct APS labels.");
    await api(`/api/affairs/${identifier}/review`, {topic_id: prediction.topic_id, language: prediction.language, labels, relevant, frozen: false, notes: "Journalist workspace assisted review"});
    notice("Reviewer correction saved separately from the model prediction."); await inspect(identifier);
  }); });
  if (!byId("detail").open) byId("detail").showModal();
}
byId("closeDetail").onclick = () => byId("detail").close();
function updateShortlist() {
  byId("shortlistCount").textContent = `${state.shortlist.size} affairs selected`;
  byId("export").disabled = !state.shortlist.size || state.busy;
  byId("selected").innerHTML = [...state.shortlist.values()].map((item) => `<button class="secondary" data-remove="${item.id}">${escapeText(title(item).slice(0, 65))} ×</button>`).join("");
}
byId("selected").onclick = (event) => { const button = event.target.closest("button[data-remove]"); if (button && !state.busy) { state.shortlist.delete(Number(button.dataset.remove)); updateShortlist(); renderResults(); } };
byId("clear").onclick = () => { state.shortlist.clear(); updateShortlist(); renderResults(); };
byId("export").onclick = () => work(async () => {
  const markdown = await api("/api/brief", {title: byId("issue").value || "Research shortlist", affair_ids: [...state.shortlist.keys()], topic_id: state.topic || "aps"});
  const url = URL.createObjectURL(new Blob([markdown], {type:"text/markdown;charset=utf-8"}));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "research-brief.md"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice("Evidence brief exported. Confirm procedural outcomes and seek responses before publication.");
});
work(async () => {
  const [coverage, bodies] = await Promise.all([api("/api/status"), api("/api/bodies"), loadTopics()]);
  byId("coverage").innerHTML = `<strong>${coverage.affairs.toLocaleString()}</strong> affair records<br>${coverage.with_text.toLocaleString()} with cached text<br>${coverage.with_embeddings.toLocaleString()} with current embeddings<br>${coverage.ever_classified.toLocaleString()} ever classified`;
  byId("body").innerHTML += bodies.map((body) => `<option value="${escapeText(body.body_key)}">${escapeText(body.body_key)} (${body.affairs.toLocaleString()})</option>`).join("");
  notice("Ready. Approve a reporting scope or search with your own terms.");
});
