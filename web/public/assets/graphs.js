/* Evidence-only SVG graphs. No model calls or inferred social relationships. */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svgNode = (tag, attrs = {}, text = '') => {
    const element = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    element.textContent = text;
    return element;
  };
  function render(id, nodes, edges, note) {
    const root = document.getElementById(id);
    const signature = JSON.stringify([nodes, edges, note]);
    if (root.dataset.graph === signature) return;
    root.dataset.graph = signature;
    root.replaceChildren();
    const caption = document.createElement('p'); caption.className = 'hint'; caption.textContent = note; root.append(caption);
    if (!nodes.length) return;
    const height = Math.max(400, ...nodes.map(n => n.y + 55));
    const svg = svgNode('svg', {viewBox:`0 0 900 ${height}`, role:'group', 'aria-label':id === 'newsGraph' ? 'Cited evidence connections' : 'Topics sharing classified affairs'});
    const scroll = document.createElement('div'); scroll.className = 'graphViewport'; scroll.append(svg); root.append(scroll);
    const info = document.createElement('div'); info.className = 'graphSelection'; info.setAttribute('aria-live', 'polite');
    info.textContent = 'Select a node to explore its recorded connections.';
    root.append(info);
    const byId = new Map(nodes.map(n => [n.id,n]));
    const lines = [], groups = [];
    for (const edge of edges) {
      const a = byId.get(edge.source), b = byId.get(edge.target);
      if (!a || !b) continue;
      const line = svgNode('path', {d:`M ${a.x} ${a.y} C ${(a.x+b.x)/2} ${a.y}, ${(a.x+b.x)/2} ${b.y}, ${b.x} ${b.y}`, fill:'none', stroke:'#b9c8e1', 'stroke-width':Math.min(8, 1 + Math.sqrt(edge.weight || 1)), class:'graphEdge'});
      line.append(svgNode('title', {}, edge.label || `${edge.weight} shared affairs`)); svg.append(line); lines.push([line,edge]);
    }
    const select = selected => {
      const links = edges.filter(e => e.source === selected.id || e.target === selected.id);
      const related = new Set([selected.id, ...links.flatMap(e => [e.source,e.target])]);
      for (const [group,n] of groups) { group.style.opacity = related.has(n.id) ? '1' : '.25'; group.setAttribute('aria-pressed', String(n.id === selected.id)); }
      for (const [line,e] of lines) { line.style.opacity = e.source === selected.id || e.target === selected.id ? '1' : '.12'; }
      info.replaceChildren();
      const heading = document.createElement('strong'); heading.textContent = selected.label; info.append(heading);
      const detail = document.createElement('p'); detail.textContent = selected.detail || selected.kind; info.append(detail);
      const list = document.createElement('ul');
      for (const edge of links) {
        const other = byId.get(edge.source === selected.id ? edge.target : edge.source);
        const li = document.createElement('li'); li.textContent = `${other.label} · ${edge.label || `${edge.weight} shared affairs`}`; list.append(li);
      }
      if (!links.length) { const li = document.createElement('li'); li.textContent = 'No recorded connections in this view.'; list.append(li); }
      info.append(list);
    };
    for (const n of nodes) {
      const group = svgNode('g', {tabindex:'0', role:'button', 'aria-label':`${n.kind}: ${n.label}`, 'aria-pressed':'false', class:'graphNode'});
      const color = {sentence:'#14243b',affair:'#4f46e5',author:'#087c83',topic:'#7773dc'}[n.kind] || '#4f46e5';
      group.append(svgNode('circle', {cx:n.x,cy:n.y,r:n.radius || 9,fill:color,stroke:'#fff','stroke-width':3}));
      const label = n.label.length > 34 ? n.label.slice(0,32) + '…' : n.label;
      group.append(svgNode('text', {x:n.x,y:n.y+28,'text-anchor':'middle',class:'graphLabel'}, label));
      group.append(svgNode('title', {}, `${n.label}\n${n.detail || n.kind}`));
      group.addEventListener('click', () => select(n));
      group.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n); } });
      group.addEventListener('focus', () => select(n));
      svg.append(group); groups.push([group,n]);
    }
  }
  window.PoliGraphs = {
    archive(data) {
      const source = data?.nodes || [];
      const nodes = source.map((n,i) => {
        const angle = -Math.PI/2 + i * 2*Math.PI/source.length;
        return {id:n.topic_id,label:n.name,kind:'topic',detail:`${n.count} classified affairs`,x:450+290*Math.cos(angle),y:230+170*Math.sin(angle),radius:8+Math.min(12,Math.sqrt(n.count))};
      });
      render('archiveGraph', nodes, data?.edges || [], source.length ? `Top ${source.length} of ${data.total_topics} topics. Links count shared affairs, not causation. Node size reflects topic frequency.` : 'Connections appear when classified affairs receive topic labels.');
    },
    news(result) {
      const nodes=[], edges=[], seen=new Set();
      const add = n => { if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); } };
      if (!result) { render('newsGraph', [], [], 'Choose a checked sentence to explore its sources.'); return; }
      const affairs = result.matched_affairs || [];
      if (!affairs.length) { render('newsGraph', [], [], 'No cited parliamentary records for this sentence.'); return; }
      add({id:'sentence',label:`Sentence ${result.index+1}`,detail:result.text,kind:'sentence',x:110,y:Math.max(90,affairs.length*45)});
      let rightRow=0;
      affairs.forEach((affair,i) => {
        const id=`affair:${affair.id}`;
        add({id,label:`Affair ${affair.id}`,detail:Object.values(affair.titles || {}).filter(Boolean).join(' / '),kind:'affair',x:430,y:70+i*100});
        edges.push({source:'sentence',target:id,label:'Cited record (not necessarily supporting)'});
        for (const person of affair.provenance?.authors || []) {
          // Scope names without stable identifiers to their record; never infer identity.
          const key=person.id ? `author:${person.id}` : `author:${affair.id}:${person.name}`;
          if (!person.name) continue;
          if (!seen.has(key)) rightRow++;
          add({id:key,label:person.name,detail:person.role || 'Recorded affair author',kind:'author',x:740,y:45+rightRow*65});
          edges.push({source:id,target:key,label:person.role || 'Recorded author'});
        }
        for (const topic of (result.topics || []).filter(t => String(t.affair_id) === String(affair.id))) {
          const key=`topic:${topic.scheme}:${topic.topic_id || topic.id || topic.name}`;
          if (!seen.has(key)) rightRow++;
          add({id:key,label:topic.name || topic.topic_id,detail:`${topic.scheme || 'Archive'} classification`,kind:'topic',x:740,y:45+rightRow*65});
          edges.push({source:id,target:key,label:'Assigned topic'});
        }
      });
      render('newsGraph',nodes,edges,'Selected sentence → cited records → recorded authors and assigned topics. Select a node for details.');
    }
  };
})();
