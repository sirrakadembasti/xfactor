function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function embeddedJson(graph) {
  return JSON.stringify(graph).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

export function renderGraphHtml(graph) {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>XFactor · Kaynak ve İlişki Haritası</title>
<style>
:root{font:14px system-ui,sans-serif;color:#e2e8f0;background:#0b1220}*{box-sizing:border-box}
body{margin:0}header{padding:14px 20px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:20px;flex-wrap:wrap}
h1{font-size:19px;margin:0;color:#7dd3fc}header p{margin:0;color:#94a3b8}
main{display:grid;grid-template-columns:320px minmax(0,1fr) 300px;height:calc(100vh - 73px)}
aside{overflow:auto;padding:14px;border-right:1px solid #334155}#detail{border-right:0;border-left:1px solid #334155}
input,select,button{font:inherit;color:inherit;background:#172338;border:1px solid #475569;border-radius:6px;padding:8px}
input,select{width:100%;margin-bottom:8px}button{cursor:pointer;text-align:left}button:hover,button.active{background:#164e63;border-color:#22d3ee}
#node-list button,#edge-list button{display:block;width:100%;margin:4px 0;overflow-wrap:anywhere}
#node-list small,#edge-list small{display:block;color:#94a3b8;font-size:11px}
#canvas-wrap{overflow:auto;display:flex;align-items:center;justify-content:center;background:radial-gradient(#1e293b,#0b1220)}
svg{width:100%;height:100%;min-height:550px}svg line{stroke:#64748b;stroke-opacity:.7;stroke-width:1.5}
svg circle{stroke:#cbd5e1;stroke-width:1.5;cursor:pointer}svg text{fill:#e2e8f0;font-size:10px;pointer-events:none;text-anchor:middle}
h2{font-size:15px;margin:12px 0}p{line-height:1.45}code{overflow-wrap:anywhere;color:#bae6fd}
.muted{color:#94a3b8}.count{font-size:12px;color:#94a3b8;margin:4px 0 10px}
@media(max-width:900px){main{display:block;height:auto}aside{max-height:300px;border:0;border-bottom:1px solid #334155}#detail{border:0}#canvas-wrap{height:550px}}
</style></head><body>
<header><h1>XFactor · Kaynak ve İlişki Haritası</h1><p>${graph.nodes.length} düğüm · ${graph.links.length} ilişki · Düğümlere gelin veya tıklayın</p><a href="GRAPH_TREE.html" style="color:#7dd3fc">Dosya ağacı</a></header>
<main><aside><input id="graph-search" aria-label="Düğüm ara" placeholder="Dosya, fonksiyon veya rota ara…"><select id="node-filter" aria-label="Düğüm türü"><option value="all">Tüm düğümler</option><option value="files">Dosyalar</option><option value="symbols">Sınıf, fonksiyon ve metotlar</option><option value="routes">HTTP rotaları ve istekleri</option><option value="packages">Paketler</option><option value="config">Ortam değişkenleri</option></select><select id="relation-filter" aria-label="İlişki türü"><option value="all">Tüm ilişkiler</option></select><div id="node-count" class="count"></div><div id="node-list"></div></aside>
<div id="canvas-wrap"><svg id="map" role="img" aria-label="Seçilen düğüm ve bağlantılarının görsel haritası" viewBox="0 0 900 650"></svg></div>
<aside id="detail"><h2 id="detail-title">Düğüm seçin</h2><p id="detail-meta" class="muted"></p><p id="detail-desc"></p><div id="edge-count" class="count"></div><div id="edge-list"></div></aside></main>
<script id="graph-data" type="application/json">${embeddedJson(graph)}</script>
<script>
const graph=JSON.parse(document.getElementById('graph-data').textContent);
const byId=new Map(graph.nodes.map(n=>[n.id,n]));
const adjacency=new Map();
for(const edge of graph.links){for(const id of [edge.source,edge.target]){if(!adjacency.has(id))adjacency.set(id,[]);adjacency.get(id).push(edge)}}
const colors={docs:'#a855f7',agents:'#8b5cf6',engine:'#3b82f6',backend:'#10b981',frontend:'#f59e0b',tests:'#ef4444',packages:'#38bdf8',config:'#f472b6'};
const search=document.getElementById('graph-search'), nodeFilter=document.getElementById('node-filter'), relationFilter=document.getElementById('relation-filter');
for(const label of [...new Set(graph.links.map(e=>e.label))].sort()){const option=document.createElement('option');option.value=label;option.textContent=label;relationFilter.append(option)}
let selected=graph.nodes.find(n=>n.id==='backend/engine/workflow.js')?.id||graph.nodes[0]?.id;
const fileTypes=new Set(['SourceFile','Document','BackendService','FrontendComponent','AgentModule','EngineCore','TestSuite']);
function visible(n){const kind=nodeFilter.value;if(kind==='files'&&!fileTypes.has(n.type))return false;if(kind==='symbols'&&!['Class','Function','Method'].includes(n.type))return false;if(kind==='routes'&&!['HttpRoute','HttpRequest'].includes(n.type))return false;if(kind==='packages'&&n.type!=='Package')return false;if(kind==='config'&&n.type!=='EnvVar')return false;const q=search.value.trim().toLowerCase();return !q||(n.label+' '+n.id+' '+(n.description||'')).toLowerCase().includes(q)}
function renderList(){const list=document.getElementById('node-list');list.replaceChildren();const matches=graph.nodes.filter(visible);document.getElementById('node-count').textContent=matches.length+' eşleşme · ilk 250 gösteriliyor';for(const n of matches.slice(0,250)){const button=document.createElement('button');button.className=n.id===selected?'active':'';button.textContent=n.label;const small=document.createElement('small');small.textContent=n.file||n.type;button.append(small);button.onclick=()=>select(n.id);list.append(button)}}
function svgElement(name,attributes){const e=document.createElementNS('http://www.w3.org/2000/svg',name);for(const [key,value] of Object.entries(attributes))e.setAttribute(key,value);return e}
function select(id){selected=id;renderList();renderDetail()}
function renderDetail(){const n=byId.get(selected);if(!n)return;document.getElementById('detail-title').textContent=n.label;document.getElementById('detail-meta').textContent=n.type+' · '+(n.file||n.id)+(n.line?':'+n.line:'');document.getElementById('detail-desc').textContent=n.description||'Kaynak koddan çıkarılan düğüm.';
const edges=(adjacency.get(selected)||[]).filter(e=>relationFilter.value==='all'||e.label===relationFilter.value);
document.getElementById('edge-count').textContent=edges.length+' ilişki';const list=document.getElementById('edge-list');list.replaceChildren();
for(const e of edges){const other=byId.get(e.source===selected?e.target:e.source);if(!other)continue;const button=document.createElement('button');button.textContent=(e.source===selected?'→ ':'← ')+other.label;const small=document.createElement('small');small.textContent=e.label+' · '+(other.file||other.id)+(e.location?' · '+e.location.file+':'+e.location.line:'');button.append(small);button.onclick=()=>select(other.id);list.append(button)}
const svg=document.getElementById('map');svg.replaceChildren();const unique=[...new Map(edges.map(e=>{const id=e.source===selected?e.target:e.source;return[id,byId.get(id)]})).values()].filter(Boolean);const shown=unique.slice(0,80);const positions=new Map([[selected,[450,325]]]);shown.forEach((node,i)=>{const angle=2*Math.PI*i/Math.max(shown.length,1)-Math.PI/2;const radius=shown.length>25?255:220;positions.set(node.id,[450+Math.cos(angle)*radius,325+Math.sin(angle)*radius])});
for(const e of edges){if(!positions.has(e.source)||!positions.has(e.target))continue;const a=positions.get(e.source),b=positions.get(e.target);const line=svgElement('line',{x1:a[0],y1:a[1],x2:b[0],y2:b[1]});const title=svgElement('title',{});title.textContent=e.label;line.append(title);svg.append(line)}
for(const node of [n,...shown]){const [x,y]=positions.get(node.id);const group=svgElement('g',{});const circle=svgElement('circle',{cx:x,cy:y,r:node.id===selected?17:10,fill:colors[node.group]||'#94a3b8'});circle.onclick=()=>select(node.id);const title=svgElement('title',{});title.textContent=node.id;circle.append(title);group.append(circle);const text=svgElement('text',{x,y:y+27});const shortLabel=node.label.length>28?node.label.slice(0,25)+'…':node.label;text.textContent=node.id===selected||shown.length<=18?shortLabel:'';if(node.id!==selected&&shown.length>18){circle.onmouseenter=()=>{text.textContent=shortLabel};circle.onmouseleave=()=>{text.textContent=''}}group.append(text);svg.append(group)}
if(unique.length>shown.length){const note=svgElement('text',{x:450,y:630});note.textContent='Görselde ilk 80 komşu gösteriliyor; sağdaki listede tüm ilişkiler var.';svg.append(note)}
}
search.oninput=renderList;nodeFilter.onchange=renderList;relationFilter.onchange=renderDetail;renderList();renderDetail();
</script></body></html>`;
}

export function renderTreeHtml(graph) {
  const root = { dirs: new Map(), files: [] };
  const fileNodes = graph.nodes.filter(node => node.file === node.id && node.type !== 'Package');
  for (const node of fileNodes) {
    const parts = node.id.split('/');
    let branch = root;
    for (const part of parts.slice(0, -1)) {
      if (!branch.dirs.has(part)) branch.dirs.set(part, { dirs: new Map(), files: [] });
      branch = branch.dirs.get(part);
    }
    branch.files.push(node);
  }
  function renderBranch(branch) {
    const dirs = [...branch.dirs].sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]) => `<details><summary>📁 ${escapeHtml(name)}/</summary>${renderBranch(child)}</details>`).join('');
    const files = branch.files.sort((a, b) => a.id.localeCompare(b.id))
      .map(node => `<div class="file" data-path="${escapeHtml(node.id)}">📄 ${escapeHtml(node.id)}</div>`).join('');
    return dirs + files;
  }
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>XFactor · Güncel Dosya Ağacı</title><style>body{font:14px system-ui;background:#0f172a;color:#e2e8f0;padding:25px;max-width:1100px;margin:auto}h1{color:#7dd3fc}a{color:#7dd3fc}input{padding:9px;background:#1e293b;color:white;border:1px solid #64748b;width:min(100%,500px)}details{margin:6px 0 6px 20px}summary{cursor:pointer;color:#93c5fd}.file{margin:5px 0 5px 35px;overflow-wrap:anywhere}.hidden{display:none}</style></head><body><h1>XFactor · Güncel Dosya Ağacı</h1><p>${fileNodes.length} kaynak ve belge dosyası · <a href="graph.html">İlişki haritası</a></p><input id="tree-search" aria-label="Dosya ara" placeholder="Dosya yolu ara…"><div id="tree">${renderBranch(root)}</div><script>const search=document.getElementById('tree-search');search.oninput=()=>{const q=search.value.trim().toLowerCase();for(const file of document.querySelectorAll('.file'))file.classList.toggle('hidden',!file.dataset.path.toLowerCase().includes(q));for(const folder of [...document.querySelectorAll('details')].reverse()){folder.classList.toggle('hidden',!!q&&!folder.querySelector('.file:not(.hidden)'));if(q&&!folder.classList.contains('hidden'))folder.open=true}}</script></body></html>`;
}

export function renderGraphReport(graph) {
  const counts = values => [...values.entries()].sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `| ${name} | ${count} |`).join('\n');
  const nodeCounts = new Map();
  const linkCounts = new Map();
  for (const node of graph.nodes) nodeCounts.set(node.type, (nodeCounts.get(node.type) || 0) + 1);
  for (const link of graph.links) linkCounts.set(link.label, (linkCounts.get(link.label) || 0) + 1);
  const fileCount = graph.nodes.filter(node => node.file === node.id).length;
  return `# XFactor kaynak haritası\n\nÜretim tarihi: ${new Date().toISOString()}\n\n- ${fileCount} kaynak ve belge dosyası\n- ${graph.nodes.length} düğüm\n- ${graph.links.length} ilişki\n\n## Düğüm türleri\n\n| Tür | Adet |\n|---|---:|\n${counts(nodeCounts)}\n\n## İlişki türleri\n\n| Tür | Adet |\n|---|---:|\n${counts(linkCounts)}\n\n## Yorum sınırları\n\nİçe aktarma, çağrı, HTTP rota/isteği ve dosya içerme ilişkileri AST taramasından gelir; mimari ilişkiler üreticide tanımlanmış açıklamalı bağlantılardır. Çağrı bağı yalnızca statik olarak tek hedefe çözülen durumlarda çizilir. İstemci isteği ile sunucu rotası bağı, yöntem ve yolun tek bir rotayla eşleştiği durumlarda çıkarımdır. Çalışma zamanı davranışı, tüm veri akışı ve dinamik değerler bu haritadan tek başına doğrulanamaz.\n\n- [Etkileşimli ilişki haritası](graph.html)\n- [Güncel dosya ağacı](GRAPH_TREE.html)\n- [Ham JSON](graph.json)\n`;
}
