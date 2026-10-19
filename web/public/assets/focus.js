const byId = (id) => document.getElementById(id);
const state = {results: [], plan: null, page: 0, selected: new Set(), busy: false, stopped: false};
let pageSize = 5;
const escapeText = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[character]));
function notice(message, error = false) {
  byId("notice").textContent = message;
  byId("notice").classList.toggle("error", error);
}
function sourceLink(url, label = "Original source") {
  try { if (!["https:", "http:"].includes(new URL(url).protocol)) return ""; } catch { return ""; }
  return '<a target="_blank" rel="noopener noreferrer" href="' + escapeText(url) + '">' + escapeText(label) + '</a>';
}
async function api(path, body) {
  const response = await fetch(path, body === undefined ? {} : {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  if (!response.ok) {
    let detail;
    try { detail = (await response.json()).detail; } catch {}
    throw new Error(typeof detail === "string" ? detail : "Request failed (" + response.status + "). Retry.");
  }
  return response.headers.get("content-type")?.includes("application/json") ? response.json() : response.text();
}
function originalTitle(record) {
  return record.translation?.title_original || record.titles?.[record.classification?.language] || Object.values(record.titles || {})[0] || "Affair " + record.id;
}
function statusLabel(record) {
  if (record.processing) return "Classifying / translating…";
  if (record.error) return "Failed — retry";
  const status = record.classification?.status;
  return status === "relevant" ? "Suggested match" : status === "not_relevant" ? "Suggested non-match" : status ? "Insufficient evidence" : "Queued";
}
function controls() {
  byId("search").disabled = state.busy;
  byId("query").disabled = state.busy;
  byId("researchModel").disabled = state.busy;
  byId("from").disabled = state.busy;
  byId("to").disabled = state.busy;
  byId("stop").disabled = !state.busy || state.stopped;
  byId("previous").disabled = state.page === 0;
  byId("next").disabled = (state.page + 1) * pageSize >= state.results.length;
  byId("export").disabled = !state.selected.size || state.busy;
  byId("selectedCount").textContent = state.selected.size + " selected";
}
function render() {
  pageSize = Math.max(1, Math.min(5, Math.floor((byId("results").clientHeight - 32) / 90)));
  state.page = Math.min(state.page, Math.max(0, Math.ceil(state.results.length / pageSize) - 1));
  const start = state.page * pageSize;
  const records = state.results.slice(start, start + pageSize);
  byId("resultCount").textContent = state.results.length + " candidates";
  byId("pageInfo").textContent = records.length ? (start + 1) + "–" + (start + records.length) + " of " + state.results.length : "0 results";
  const rows = records.map((record, offset) => {
    const original = originalTitle(record);
    const english = record.translation?.title_english;
    const review = record.review === undefined ? "" : '<div class="meta">Your review: ' + (record.review ? "relevant" : "not relevant") + "</div>";
    return '<tr><td class="rankCell">' + (start + offset + 1) + '</td><td class="titleCell"><strong title="' + escapeText(english || original) + '">' + escapeText(english || original) + '</strong>' +
      (english ? '<div class="originalTitle" title="' + escapeText(original) + '">' + escapeText(original) + '</div>' : "") +
      '<div class="meta">' + escapeText(record.body_key) + " · " + escapeText((record.begin_date || "").slice(0, 10)) + " · #" + record.id + (english ? " · AI translation" : "") + '</div></td><td class="statusCell"><span class="badge ' +
      (record.classification?.status === "relevant" ? "match" : "") + '">' + escapeText(statusLabel(record)) + '</span>' + review +
      (record.classification?.partial_content ? '<div class="meta">Partial source review</div>' : "") +
      (record.translation_error ? '<div class="meta">Translation unavailable</div>' : "") +
      '</td><td><div class="resultActions"><button data-action="inspect" data-id="' + record.id + '">Evidence</button><button data-action="select" data-id="' + record.id + '" aria-pressed="' + state.selected.has(record.id) + '">' +
      (state.selected.has(record.id) ? "Remove" : "Select") + '</button>' +
      ((record.error || record.translation_error || (!record.classification && !state.busy)) ? '<button data-action="retry" data-id="' + record.id + '"' + (state.busy ? " disabled" : "") + '>Retry</button>' : "") + '</div></td></tr>';
  }).join("");
  byId("results").innerHTML = rows ? '<div class="tableScroll"><table><thead><tr><th scope="col">#</th><th scope="col">Affair · English / original</th><th scope="col">Model result</th><th scope="col">Actions</th></tr></thead><tbody>' + rows + "</tbody></table></div>" : '<p class="empty">No candidates in this date range. Try a broader question or dates.</p>';
  controls();
}
async function analyseRecord(record) {
  record.processing = true; record.error = null; render();
  try {
    const result = await api("/api/research/analyse", {affair_id: record.id, topic_id: state.plan.topic_id, date_from: state.plan.date_from, date_to: state.plan.date_to, language: state.plan.language, model:state.plan.model});
    Object.assign(record, result);
  } catch (error) { record.error = error.message; }
  finally { record.processing = false; render(); }
}
byId("searchForm").onsubmit = async (event) => {
  event.preventDefault();
  if (state.busy) return;
  state.busy = true; state.stopped = false; controls();
  let syncWarning = "";
  try {
    notice("Interpreting your question and retrieving candidates…");
    const response = await api("/api/research/search", {question: byId("query").value.trim(), date_from: byId("from").value || null, date_to: byId("to").value || null, model:byId("researchModel").value});
    state.results = response.results; state.plan = {...response.plan, model:byId("researchModel").value}; state.page = 0; state.selected.clear();
    syncWarning = response.sync.warnings.length ? " Live retrieval incomplete; cached data included." : " Bounded live search + local catalogue.";
    byId("interpretation").textContent = response.plan.name + " · " + response.plan.date_from + " — " + response.plan.date_to + (response.plan.body ? " · " + response.plan.body : "");
    byId("interpretation").title = response.plan.definition;
    render();
    for (const [index, record] of state.results.entries()) {
      if (state.stopped) break;
      notice("Classifying and translating " + (index + 1) + "/" + state.results.length + "." + syncWarning);
      await analyseRecord(record);
    }
    const failed = state.results.filter((record) => record.error || record.translation_error).length;
    notice((state.stopped ? "Stopped. Retry remaining rows when ready." : "Done. " + state.results.length + " candidates processed." + (failed ? " " + failed + " rows need retry." : "")) + syncWarning);
  } catch (error) { notice(error.message, true); }
  finally { state.busy = false; render(); }
};
byId("stop").onclick = () => { state.stopped = true; controls(); notice("Stopping after the current request."); };
byId("previous").onclick = () => { if (state.page > 0) state.page--; render(); };
byId("next").onclick = () => { if ((state.page + 1) * pageSize < state.results.length) state.page++; render(); };
byId("results").onclick = async (event) => {
  const button = event.target.closest("button[data-id]");
  if (!button) return;
  const record = state.results.find((item) => item.id === Number(button.dataset.id));
  if (!record) return;
  if (button.dataset.action === "select") {
    state.selected.has(record.id) ? state.selected.delete(record.id) : state.selected.add(record.id);
    render(); return;
  }
  if (button.dataset.action === "retry" && !state.busy) {
    state.busy = true; state.stopped = false; controls();
    try { await analyseRecord(record); } finally { state.busy = false; render(); }
    return;
  }
  if (button.dataset.action === "inspect") {
    try { await inspect(record); } catch (error) { notice(error.message, true); }
  }
};
async function inspect(record) {
  const detail = await api("/api/affairs/" + record.id + "?model=" + encodeURIComponent(state.plan.model));
  const prediction = record.classification;
  const translated = record.translation;
  const passages = translated?.passages || prediction?.labels.map((label) => ({original: label.evidence.quote, source_url: label.evidence.source_url})) || [];
  byId("detailContent").innerHTML = '<h2>' + escapeText(translated?.title_english || originalTitle(record)) + '</h2>' +
    (translated ? '<p class="hint">Original: ' + escapeText(translated.title_original) + "</p>" : "") +
    '<p>' + escapeText(statusLabel(record)) + " · " + sourceLink(detail.source_url, "OpenParlData record") + '</p>' +
    (record.error ? '<p class="error">' + escapeText(record.error) + "</p>" : "") +
    (record.translation_error ? '<p class="hint">' + escapeText(record.translation_error) + "</p>" : "") +
    (prediction?.partial_content ? '<p class="hint">Only part of the source was classified.</p>' : "") +
    passages.map((passage) => '<h3>Original evidence</h3><blockquote>' + escapeText(passage.original) + '</blockquote>' +
      (passage.english ? '<h3>English · machine translation</h3><blockquote>' + escapeText(passage.english) + '</blockquote>' : "") + sourceLink(passage.source_url)).join("") +
    (!passages.length ? '<p class="hint">No accepted evidence quotation. This does not establish that the affair is irrelevant.</p>' : "") +
    (prediction ? '<div class="actions"><button data-review="yes">Mark relevant</button><button data-review="no" class="secondary">Mark not relevant</button></div>' : "") +
    '<details><summary>Source documents</summary>' + [...new Set(detail.units.filter((unit) => unit.kind !== "title").map((unit) => unit.source_url))].map((url, index) => '<p>' + sourceLink(url, "Source " + (index + 1)) + '</p>').join("") + '</details>';
  byId("detailContent").querySelectorAll("button[data-review]").forEach((button) => {
    button.onclick = async () => {
      button.disabled = true;
      try {
        const relevant = button.dataset.review === "yes";
        await api("/api/affairs/" + record.id + "/review", {topic_id: state.plan.topic_id, language: prediction.language, model:state.plan.model, labels: relevant ? [state.plan.topic_id] : [], relevant, frozen: false, notes: "Assisted review of a natural-language research query"});
        record.review = relevant; render(); notice("Review saved."); byId("detail").close();
      } catch (error) { notice(error.message, true); } finally { button.disabled = false; }
    };
  });
  if (!byId("detail").open) byId("detail").showModal();
  window.dispatchEvent(new CustomEvent("polinews:document", {detail:{id:record.id}}));
}
byId("closeDetail").onclick = () => byId("detail").close();
byId("clear").onclick = () => { state.selected.clear(); render(); };
byId("export").onclick = async () => {
  try {
    const markdown = await api("/api/brief", {title: state.plan.name, affair_ids: [...state.selected], topic_id: state.plan.topic_id});
    const url = URL.createObjectURL(new Blob([markdown], {type: "text/markdown;charset=utf-8"}));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "research-evidence.md"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); notice("Original-source evidence exported.");
  } catch (error) { notice(error.message, true); }
};
byId("evaluation").onclick = async () => {
  try {
    const report = await api("/api/digitalisation/benchmark");
    const overall = report.groups?.all;
    byId("benchmark").textContent = overall ? overall.recovered_so_far + "/" + overall.known_positives + " known positives recovered. Title-keyword baseline: " + (100 * overall.keyword_title_recall).toFixed(1) + "%. Model: " + report.model + "." : "No completed benchmark.";
    byId("evaluationDialog").showModal();
  } catch (error) { notice(error.message, true); }
};
byId("closeEvaluation").onclick = () => byId("evaluationDialog").close();
controls();
window.addEventListener("resize", render);

// Read-only context for the optional PoliBot widget. No source text crosses this boundary.
window.PoliNewsResearchContext = () => ({
  affair_ids: state.results.map(record => record.id).slice(0, 10),
  topic_id: state.plan?.topic_id || "aps", model: state.plan?.model || "apertus-v1-5-70b",
  documents: state.results.map(record => ({id:record.id, title:record.translation?.title_english || originalTitle(record)})).slice(0, 10)
});
