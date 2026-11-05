/* =====================================================================
 *  「导入户型图」对话框：选图 → 自动识别（可调参数）→ 比例尺校准 → 生成户型
 *  全部在浏览器本地完成，图片不上传。
 * ===================================================================== */
import {tr} from '../i18n.js';
import {state, ui, mutate} from '../store.js';
import {MATS} from '../data.js';
import {analyze, toPlan, typicalDoorPx, labelRooms, findSplits, chooseScale, floorPlates, strokeToWalls, brushHits, ocrHints} from './build.js';
import {pointInPoly} from './rooms.js';
import {setUnderlay} from './underlay.js';
import {fitView} from '../plan2d/viewport.js';
import {esc} from '../ui/panel.js';
import {toast} from '../io.js';

const MAX_SIDE = 1600;                       // 识别用图的最长边（更大的图先缩小，速度 / 精度折中）
let dlg = null, S = null;                    // S：当前会话状态

const html = () => `
<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="impTitle">
  <header class="modal-head">
    <div><b id="impTitle">${tr('导入户型图', 'Import floor plan image')}</b>
      <span>${tr('支持链家 / 贝壳 / 我爱我家等户型图，识别全部在本地完成，图片不会上传', 'Works with typical listing floor plans (Lianjia / Beike …). Runs locally — the image is never uploaded')}</span></div>
    <button class="icon-btn" data-x="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
  </header>
  <div class="imp-body">
    <div class="imp-stage" id="impStage">
      <label class="imp-drop" id="impDrop">
        <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3"/></svg>
        <b>${tr('点击选择图片，或拖入 / 粘贴（Ctrl+V）', 'Click to choose an image, or drop / paste (Ctrl+V)')}</b>
        <span>${tr('PNG / JPG / WebP，建议长边 ≥ 800px，越清晰越准', 'PNG / JPG / WebP, ≥ 800px recommended')}</span>
        <input type="file" id="impFile" accept="image/*" hidden>
      </label>
      <canvas id="impCanvas" hidden></canvas>
      <div class="imp-legend" id="impLegend" hidden>
        <span><i style="background:#3b5bdb"></i>${tr('墙', 'Wall')}</span><span><i style="background:#15aabf"></i>${tr('窗', 'Window')}</span>
        <span><i style="background:#fd7e14"></i>${tr('门', 'Door')}</span><span><i style="background:#fab005"></i>${tr('门洞', 'Opening')}</span>
        <span><i style="background:repeating-linear-gradient(90deg,#3b5bdb 0 4px,transparent 4px 7px)"></i>${tr('补出的隔墙', 'Added wall')}</span><span><i style="background:#ae3ec9"></i>${tr('手画的墙', 'Drawn wall')}</span>
        <label><input type="checkbox" id="impOverlay" checked> ${tr('显示识别结果', 'Show result')}</label>
      </div>
      <div class="imp-pick" id="impPickHint" hidden></div>
      <div class="imp-tools" id="impTools" hidden>
        <button data-tool="pen" title="${tr('按住拖动画一道墙，松手后自动拉直', 'Drag to draw a wall — it is straightened automatically')}">
          <svg viewBox="0 0 24 24"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg><span>${tr('画墙', 'Draw wall')}</span></button>
        <button data-tool="eraser" title="${tr('按住拖动，擦掉经过的墙 / 门窗', 'Drag to erase walls / openings')}">
          <svg viewBox="0 0 24 24"><path d="M8 20h12M5 15l8-8 6 6-7 7H9z"/></svg><span>${tr('擦除', 'Erase')}</span></button>
        <i></i>
        <button data-edit="undo" title="${tr('撤销上一笔', 'Undo last stroke')}"><svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/></svg></button>
        <button data-edit="reset" title="${tr('清除所有手动修改', 'Clear all edits')}"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/></svg></button>
      </div>
    </div>
    <aside class="imp-side" id="impSide" hidden>
      <section id="impPlates" hidden></section>
      <section>
        <h4>${tr('① 识别参数', '① Detection')}</h4>
        <label class="imp-row">${tr('暗度阈值', 'Darkness')}<input type="range" id="impThr" min="60" max="200" step="1"><output id="impThrV"></output></label>
        <label class="imp-row">${tr('外墙厚度', 'Outer wall')}<input type="range" id="impT" min="3" max="40" step="1"><output id="impTV"></output></label>
        <label class="imp-row">${tr('内墙厚度', 'Inner wall')}<input type="range" id="impTm" min="2" max="40" step="1"><output id="impTmV"></output></label>
        <button class="btn ghost sm" data-x="auto">${tr('恢复自动', 'Auto')}</button>
      </section>
      <section>
        <h4>${tr('② 比例尺', '② Scale')}</h4>
        <div class="seg-mini" id="impMode">
          <button data-m="wall" class="on">${tr('自动估算', 'Auto')}</button><button data-m="line">${tr('两点测距', '2 points')}</button><button data-m="area">${tr('按面积', 'Area')}</button>
        </div>
        <div data-p="wall"><p class="muted" id="impAutoNote"></p>
          <label class="imp-row">${tr('门宽按', 'Door width')}<input type="number" id="impDoorMM" value="850" min="600" max="1200" step="10"><em>mm</em></label>
          <label class="imp-row">${tr('外墙厚按', 'Outer wall')}<input type="number" id="impWallMM" value="240" min="80" max="500" step="10"><em>mm</em></label></div>
        <div data-p="line" hidden><p class="muted">${tr('在左图上点两个点（例如某段尺寸标注的两端），再输入实际长度：', 'Click two points on the image (e.g. ends of a dimension), then enter the real length:')}</p>
          <label class="imp-row">${tr('实际长度', 'Length')}<input type="number" id="impLineMM" placeholder="3370" min="100" step="10"><em>mm</em></label>
          <button class="btn ghost sm" data-x="pick">${tr('重新点选', 'Pick again')}</button></div>
        <div data-p="area" hidden><label class="imp-row">${tr('套内面积', 'Net area')}<input type="number" id="impAreaM2" placeholder="88" min="5" step="0.1"><em>m²</em></label>
          <p class="muted">${tr('填房源信息里的套内面积（不是建筑面积）。识别漏掉的房间会让结果偏大。', 'Use the net (usable) area from the listing, not the gross area.')}</p></div>
        <div class="imp-kpi"><div><small>${tr('比例', 'Scale')}</small><b id="impScale">—</b></div><div><small>${tr('外框尺寸', 'Outline')}</small><b id="impSize">—</b></div><div><small>${tr('房间合计', 'Rooms total')}</small><b id="impArea">—</b></div></div>
      </section>
      <section class="imp-rooms">
        <h4>${tr('③ 识别结果', '③ Result')} <small id="impStats"></small></h4>
        <p class="muted imp-ocr" id="impOcr" hidden></p>
        <div id="impRooms"></div>
      </section>
      <section>
        <label class="imp-check"><input type="checkbox" id="impUnder"> ${tr('保留原图作为底图（对照修正时用，可在「图层」里随时开关）', 'Keep the image as an underlay for tracing (toggle in Layers)')}</label>
        <label class="imp-check"><input type="checkbox" id="impClear" checked> ${tr('清空现有家具', 'Remove existing furniture')}</label>
      </section>
      <footer class="imp-foot"><button class="btn ghost" data-x="close">${tr('取消', 'Cancel')}</button><button class="btn primary" data-x="apply">${tr('生成户型', 'Create plan')}</button></footer>
    </aside>
  </div>
</div>`;

export function openImport(file){
  if (!dlg){
    dlg = document.createElement('div'); dlg.className = 'modal'; dlg.id = 'importDlg';
    document.body.appendChild(dlg);
    dlg.addEventListener('pointerdown', e => { if (e.target === dlg) close(); });
    document.addEventListener('keydown', e => { if (dlg.classList.contains('show') && e.key === 'Escape'){ e.stopPropagation(); close(); } }, true);
    document.addEventListener('paste', e => {
      if (!dlg.classList.contains('show')) return;
      const f = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/')); if (f) loadFile(f);
    });
  }
  dlg.innerHTML = html(); S = null;
  dlg.classList.add('show');
  bind();
  if (file) loadFile(file);
}
function close(){ dlg?.classList.remove('show'); S = null; }

function bind(){
  const q = s => dlg.querySelector(s);
  dlg.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ({close, apply, auto:() => { S.autoScale = null; S.opt = {splits:S.opt.splits, splitDoors:S.opt.splitDoors, manual:S.opt.manual, erase:S.opt.erase}; run(true); }, pick:() => startPick()})[b.dataset.x]());
  q('#impFile').onchange = e => e.target.files[0] && loadFile(e.target.files[0]);
  const drop = q('#impStage');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f) loadFile(f); });
  const slider = (id, key) => q(id).oninput = e => { S.autoScale = null; S.opt[key] = +e.target.value; if (key === 'thickness' && S.opt.thinWall > S.opt.thickness) S.opt.thinWall = S.opt.thickness; schedule(); };
  slider('#impThr', 'threshold'); slider('#impT', 'thickness'); slider('#impTm', 'thinWall');
  q('#impMode').onclick = e => { const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return; S.mode = m; syncMode(); if (m === 'line' && !S.line) startPick(); updateScale(); };
  ['#impWallMM', '#impDoorMM', '#impLineMM', '#impAreaM2'].forEach(id => q(id).oninput = updateScale);
  q('#impOverlay').onchange = draw;
  const cv = q('#impCanvas');
  q('#impTools').querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(S.tool === b.dataset.tool ? null : b.dataset.tool));
  q('#impTools').querySelector('[data-edit=undo]').onclick = undoEdit;
  q('#impTools').querySelector('[data-edit=reset]').onclick = () => { if (!S) return; S.opt.manual = []; S.opt.erase = []; S.edits = []; run(false); };
  const toImg = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left)/r.width*cv.width, (e.clientY - r.top)/r.height*cv.height]; };
  cv.addEventListener('pointerdown', e => {
    if (!S?.tool || S.picking) return;
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    S.stroke = {tool:S.tool, pts:[toImg(e)], r:brush()};
    draw();
  });
  cv.addEventListener('pointermove', e => {
    if (S?.tool && !S.stroke){ S.hover = toImg(e); if (S.tool === 'eraser') draw(); }
    if (!S?.stroke) return;
    const p = toImg(e), last = S.stroke.pts[S.stroke.pts.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 2){ S.stroke.pts.push(p); draw(); }
  });
  const endStroke = () => { if (!S?.stroke) return; const st = S.stroke; S.stroke = null; commitStroke(st); };
  cv.addEventListener('pointerup', endStroke); cv.addEventListener('pointercancel', endStroke);
  cv.addEventListener('pointerleave', () => { if (S && !S.stroke){ S.hover = null; draw(); } });
  cv.addEventListener('click', e => {
    if (!S?.picking) return;
    const r = cv.getBoundingClientRect(), p = [(e.clientX - r.left)/r.width*cv.width, (e.clientY - r.top)/r.height*cv.height];
    S.picking.push(p);
    if (S.picking.length === 2){ S.line = S.picking; S.picking = null; q('#impPickHint').hidden = true; q('#impLineMM').focus(); updateScale(); }
    draw();
  });
}

/* ---------- 手动修正：画墙 / 擦除 ---------- */
const brush = () => Math.max(8, (S?.an?.T || 10)*1.2);           // 橡皮擦半径（像素）
function setTool(t){
  if (!S) return;
  S.tool = t; S.hover = null;
  const tb = dlg.querySelector('#impTools'), h = dlg.querySelector('#impPickHint'), cv = dlg.querySelector('#impCanvas');
  tb.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  cv.classList.toggle('drawing', !!t);
  h.hidden = !t;
  h.textContent = t === 'pen' ? tr('按住拖动画墙：沿着图上漏掉的隔断线画，松手后自动拉直（可以画 L 形）', 'Drag along a missing partition — it snaps to straight walls (L-shapes OK)')
    : t === 'eraser' ? tr('按住拖动擦除：经过的墙、门窗都会去掉（例如被当成墙的床、沙发边线）', 'Drag over walls / openings to remove them (e.g. furniture edges taken as walls)') : '';
  draw();
}
function commitStroke(st){
  if (st.tool === 'pen'){
    const add = strokeToWalls(S.an.rec, st.pts);
    if (!add.length){ draw(); return; }
    (S.opt.manual ||= []).push(...add); (S.edits ||= []).push({kind:'manual', n:add.length});
  } else {
    // 笔迹按间距取圆；太密的点合并
    const circles = [];
    for (const [x, y] of st.pts) if (!circles.length || Math.hypot(x - circles.at(-1).x, y - circles.at(-1).y) >= st.r*.5) circles.push({x, y, r:st.r});
    (S.opt.erase ||= []).push(...circles); (S.edits ||= []).push({kind:'erase', n:circles.length});
  }
  run(false);
}
function undoEdit(){
  const e = S?.edits?.pop(); if (!e) return;
  S.opt[e.kind].splice(-e.n, e.n); run(false);
}

async function loadFile(file){
  if (!file.type.startsWith('image/')) return toast(tr('请选择图片文件', 'Please choose an image file'));
  const url = URL.createObjectURL(file), im = new Image(); im.src = url;
  try { await im.decode(); } catch(e) { URL.revokeObjectURL(url); return toast(tr('图片无法读取', 'Could not read the image')); }
  const k = Math.min(1, MAX_SIDE/Math.max(im.naturalWidth, im.naturalHeight)), W = Math.round(im.naturalWidth*k), H = Math.round(im.naturalHeight*k);
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const g = base.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(im, 0, 0, W, H);
  URL.revokeObjectURL(url);
  S = {base, img:g.getImageData(0, 0, W, H), opt:{}, mode:'wall', line:null, picking:null, names:{}, an:null};
  S.full = {base, img:S.img};
  const q = s => dlg.querySelector(s);
  q('#impDrop').hidden = true; q('#impCanvas').hidden = false; q('#impSide').hidden = false; q('#impLegend').hidden = false; q('#impTools').hidden = false;
  const cv = q('#impCanvas'); cv.width = W; cv.height = H;
  run(true);
  // 一张图里画了好几层 → 让用户选一层，裁出来单独识别
  S.plates = floorPlates(S.an.rec);
  syncPlates();
  if (S.plates.length) return selectPlate(0);
  readText(S);
}
function syncPlates(){
  const box = dlg.querySelector('#impPlates'), n = S.plates?.length || 0;
  box.hidden = !n; if (!n) return;
  box.innerHTML = `<h4>${tr(`这张图里有 ${n} 层`, `${n} floors in this image`)}</h4>
    <div class="seg-mini">${S.plates.map((_, i) => `<button data-plate="${i}" class="${i === S.plate ? 'on' : ''}">${tr(`第 ${i + 1} 层`, `Floor ${i + 1}`)}</button>`).join('')}</div>
    <p class="muted">${tr('一次导入一层；选好后会只识别这一层（含它周围的尺寸标注）。', 'One floor at a time — only the selected floor (and its dimensions) is recognized.')}</p>`;
  box.querySelectorAll('[data-plate]').forEach(b => b.onclick = () => selectPlate(+b.dataset.plate));
}
/** 选第 i 层：按这一层的外框（四周留出尺寸标注的位置）裁图，重新识别 */
function selectPlate(i){
  const {base, img} = S.full, [x0, y0, x1, y1] = S.plates[i].bbox, m = Math.max(60, Math.max(x1 - x0, y1 - y0)*.18);
  const cx0 = Math.max(0, Math.floor(x0 - m)), cy0 = Math.max(0, Math.floor(y0 - m)), cx1 = Math.min(img.width, Math.ceil(x1 + m)), cy1 = Math.min(img.height, Math.ceil(y1 + m));
  // 留白区域里可能有相邻一层的边缘：只保留本层外框附近，其余涂白
  const W = cx1 - cx0, H = cy1 - cy0, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(base, cx0, cy0, W, H, 0, 0, W, H);
  S.plates.forEach((p, k) => { if (k === i) return; const [a, b, c, d] = p.bbox; g.fillRect(a - cx0 - 4, b - cy0 - 4, c - a + 8, d - b + 8); });
  Object.assign(S, {base:cv, img:g.getImageData(0, 0, W, H), plate:i, opt:{}, labels:null, names:{}, line:null, picking:null, edits:[], stroke:null, autoScale:null});
  const c = dlg.querySelector('#impCanvas'); c.width = W; c.height = H;
  syncPlates(); run(true); readText(S);
}
/** 读图中文字（房间名 / 面积标注）：补出漏掉的隔墙、给房间命名、按标注面积校准比例尺 */
async function readText(cur){
  const q = s => dlg.querySelector(s), note = q('#impOcr'), gen = cur.gen = (cur.gen || 0) + 1;
  note.hidden = false; note.textContent = tr('正在读取图中文字（房间名、面积）…', 'Reading labels in the image…');
  const {readLabels} = await import('./ocr.js');
  const inRoom = (x, y) => cur.an.rooms.some(r => pointInPoly([x, y], r.poly));
  const labels = await readLabels(cur.img, cur.an.rec.wallMask, inRoom, (i, n) => { if (S === cur && cur.gen === gen) note.textContent = tr(`正在读取图中文字 ${i + 1}/${n}…`, `Reading labels ${i + 1}/${n}…`); }, ocrHints(cur.an)).catch(e => (console.warn(e), null));
  if (S !== cur || cur.gen !== gen) return;                           // 期间换了图 / 换了一层
  if (!labels){ note.textContent = tr('文字识别不可用，房间名按颜色 / 面积推测，请核对。', 'Label reading unavailable — room names are guessed.'); return; }
  cur.labels = labels;
  labelRooms(cur.an, labels);
  const splits = findSplits(cur.an, cur.img);
  if (splits.length){ cur.opt.splits = splits; cur.opt.splitDoors = splits.doors; cur.an = analyze(cur.img, cur.opt); labelRooms(cur.an, labels); }
  cur.autoScale = null;
  const nNm = cur.an.rooms.filter(r => r.label?.name).length, nAr = cur.an.rooms.filter(r => r.label?.area).length;
  note.textContent = nNm || nAr
    ? tr(`已读出 ${nNm} 个房间名、${nAr} 个面积标注${splits.length ? `，补出 ${splits.length} 道隔墙` : ''}。`, `Read ${nNm} room names and ${nAr} area labels${splits.length ? `, added ${splits.length} wall(s)` : ''}.`)
    : tr('图中没有读到房间名 / 面积，房间名按颜色 / 面积推测，请核对。', 'No labels found — room names are guessed.');
  updateScale();
}

let tmr = 0;
function schedule(){ clearTimeout(tmr); tmr = setTimeout(() => run(false), 120); }
function run(resetSliders){
  if (!S) return;
  const t0 = performance.now();
  S.an = analyze(S.img, S.opt); S.names = {};
  if (S.labels) labelRooms(S.an, S.labels);
  S.ms = performance.now() - t0;
  const q = s => dlg.querySelector(s), rec = S.an.rec;
  if (resetSliders || S.opt.threshold === undefined){ q('#impThr').value = rec.threshold; }
  if (resetSliders || S.opt.thickness === undefined){ q('#impT').value = rec.thickness; }
  if (resetSliders || S.opt.thinWall === undefined){ q('#impTm').value = rec.thinWall; }
  q('#impThrV').textContent = rec.threshold; q('#impTV').textContent = rec.thickness + 'px'; q('#impTmV').textContent = rec.thinWall + 'px';
  updateScale();
}

function scale(){
  const q = s => dlg.querySelector(s), an = S.an;
  if (S.mode === 'line' && S.line){ const mm = +q('#impLineMM').value, d = Math.hypot(S.line[1][0] - S.line[0][0], S.line[1][1] - S.line[0][1]); if (mm > 0 && d > 2) return mm/d; }
  if (S.mode === 'area'){
    const A = +q('#impAreaM2').value*1e6;
    if (A > 0){ let s = 240/an.T; for (let k = 0; k < 3; k++){ const px = an.rooms.filter(r => r.area*s*s >= 1.5e6).reduce((a, r) => a + r.area, 0); if (px) s = Math.sqrt(A/px); } return s; }
  }
  // 自动：优先按图中的面积标注（最准）；其次按门宽中位数（住宅门宽几乎都在 800–900mm）；最后按外墙厚
  const note = q('#impAutoNote'), med = typicalDoorPx(an.rec), ref = med ? (+q('#impDoorMM').value || 850)/med : (+q('#impWallMM').value || 240)/an.T;
  if (S.labels){
    // 读完文字后算一次就锁定：之后手动画墙 / 擦墙会改变房间划分，不应该让比例尺跟着跳
    const c = S.autoScale ||= chooseScale(an, S.labels, ref);
    if (c.src !== 'ref'){
      note.textContent = c.src === 'labels' ? tr(`按图中 ${c.n} 个房间的面积标注校准${c.agree ? '（与尺寸标注一致）' : ''}。`, `Calibrated from ${c.n} area labels${c.agree ? ' (matches the dimensions)' : ''}.`)
        : tr(`按图中外圈尺寸标注校准（${c.n} 组数字一致）。`, `Calibrated from the dimension figures (${c.n} consistent).`);
      return c.s;
    }
  }
  if (med){
    note.textContent = tr(`按识别到的门宽估算（典型门洞 ${med.toFixed(0)}px）。建议再用「两点测距」量一段尺寸标注核对。`, `Estimated from detected doors (typical ${med.toFixed(0)}px). Verify with “2 points”.`);
    return (+q('#impDoorMM').value || 850)/med;
  }
  note.textContent = tr('门太少，按外墙厚估算（国内住宅外墙多为 200–240mm），误差较大，建议用「两点测距」。', 'Too few doors — estimated from the outer wall thickness; please verify with “2 points”.');
  return (+q('#impWallMM').value || 240)/an.T;
}
function syncMode(){
  dlg.querySelectorAll('#impMode [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === S.mode));
  dlg.querySelectorAll('[data-p]').forEach(p => p.hidden = p.dataset.p !== S.mode);
}
function startPick(){ S.picking = []; S.line = null; const h = dlg.querySelector('#impPickHint'); h.hidden = false; h.textContent = tr('在图上点两个点', 'Click two points on the image'); draw(); }

function updateScale(){
  if (!S?.an) return;
  const q = s => dlg.querySelector(s), s = scale();
  S.s = s; S.result = toPlan(S.an, s);
  const {plan} = S.result, b = plan.bounds, rooms = plan.rooms;
  const area = poly => Math.abs(poly.reduce((a, p, i) => { const q2 = poly[(i + 1) % poly.length]; return a + p[0]*q2[1] - q2[0]*p[1]; }, 0))/2e6;
  q('#impScale').textContent = `${s.toFixed(1)} mm/px`;
  q('#impSize').textContent = `${((b.w - 3700)/1000).toFixed(1)} × ${((b.h - 3500)/1000).toFixed(1)} m`;
  q('#impArea').textContent = `${rooms.reduce((a, r) => a + area(r.poly), 0).toFixed(1)} m²`;
  const cnt = k => S.an.rec.openings.filter(o => o.kind === k).length;
  q('#impStats').textContent = tr(`墙 ${plan.walls.length} · 门 ${cnt('door')} · 窗 ${cnt('window')} · ${S.ms.toFixed(0)}ms`, `${plan.walls.length} walls · ${cnt('door')} doors · ${cnt('window')} windows · ${S.ms.toFixed(0)}ms`);
  q('#impRooms').innerHTML = rooms.length ? rooms.map((r, i) => `<label class="imp-room"><i style="background:hsl(${HUES[i % HUES.length]},65%,62%)"></i>
      <input value="${esc(S.names[r.id] ?? r.name)}" data-rid="${r.id}"><small>${area(r.poly).toFixed(1)} m²</small></label>`).join('')
    : `<p class="muted">${tr('没有识别出封闭房间：试试调整暗度阈值或墙厚，或用「生成户型」后手动画墙。', 'No closed rooms found — adjust darkness / wall thickness, or create the plan and draw walls manually.')}</p>`;
  q('#impRooms').querySelectorAll('input').forEach(inp => inp.oninput = () => S.names[inp.dataset.rid] = inp.value.trim());
  draw();
}
const HUES = [210, 30, 140, 280, 0, 175, 55, 320, 245, 95, 15, 190];

function draw(){
  if (!S) return;
  const cv = dlg.querySelector('#impCanvas'), g = cv.getContext('2d'), an = S.an, s = S.s;
  g.drawImage(S.base, 0, 0);
  if (an && dlg.querySelector('#impOverlay').checked){
    g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(0, 0, cv.width, cv.height);
    const [bx, by] = an.rec.bbox;
    S.result.plan.rooms.forEach((r, i) => {
      g.beginPath(); r.poly.forEach(([x, y], k) => { const px = x/s + bx, py = y/s + by; k ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
      g.fillStyle = `hsla(${HUES[i % HUES.length]},65%,62%,.38)`; g.fill();
    });
    g.fillStyle = 'rgba(59,91,219,.88)'; an.rec.walls.forEach(w => g.fillRect(w.x0, w.y0, w.x1 - w.x0, w.y1 - w.y0));
    an.rec.openings.forEach(o => { const [x0, y0, x1, y1] = o.rect; g.fillStyle = {window:'rgba(21,170,191,.9)', door:'rgba(253,126,20,.9)', open:'rgba(250,176,5,.9)', wall:'rgba(59,91,219,.88)'}[o.kind]; g.fillRect(x0, y0, x1 - x0, y1 - y0); });
    const fs = Math.max(12, cv.width/70);
    g.font = `600 ${fs}px Inter,"PingFang SC",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    S.result.plan.rooms.forEach(r => {
      const x = r.at[0]/s + bx, y = r.at[1]/s + by, t = S.names[r.id] ?? r.name;
      g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeText(t, x, y); g.fillStyle = '#162032'; g.fillText(t, x, y);
    });
  }
  // 手画的墙（紫色）和正在画的一笔 / 橡皮擦
  if (an && dlg.querySelector('#impOverlay').checked){
    const live = r => !(S.opt.erase || []).some(c => brushHits(r, c));
    // 按文字自动补出的隔墙：蓝色虚线（也可以用橡皮擦掉）
    g.strokeStyle = 'rgba(59,91,219,.95)'; g.lineWidth = Math.max(2, an.T*.35); g.setLineDash([6, 4]);
    (S.opt.splits || []).filter(live).forEach(([x0, y0, x1, y1]) => { g.beginPath(); if (x1 - x0 >= y1 - y0){ g.moveTo(x0, (y0 + y1)/2); g.lineTo(x1, (y0 + y1)/2); } else { g.moveTo((x0 + x1)/2, y0); g.lineTo((x0 + x1)/2, y1); } g.stroke(); });
    g.setLineDash([]);
    g.fillStyle = 'rgba(174,62,201,.92)';
    (S.opt.manual || []).filter(live).forEach(([x0, y0, x1, y1]) => g.fillRect(x0, y0, x1 - x0, y1 - y0));
  }
  if (S.stroke){
    const P = S.stroke.pts;
    if (S.stroke.tool === 'pen'){
      g.strokeStyle = 'rgba(174,62,201,.9)'; g.lineWidth = Math.max(3, (an?.T || 10)*.45); g.lineCap = g.lineJoin = 'round';
      g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
    } else {
      g.fillStyle = 'rgba(232,89,12,.28)'; P.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, S.stroke.r, 0, 7); g.fill(); });
    }
  } else if (S.tool === 'eraser' && S.hover){
    g.strokeStyle = 'rgba(232,89,12,.9)'; g.lineWidth = 2; g.beginPath(); g.arc(S.hover[0], S.hover[1], brush(), 0, 7); g.stroke();
  }
  const pts = S.picking || S.line;
  if (pts?.length){
    g.strokeStyle = '#e8590c'; g.fillStyle = '#e8590c'; g.lineWidth = Math.max(2, cv.width/500);
    if (pts.length === 2){ g.beginPath(); g.moveTo(...pts[0]); g.lineTo(...pts[1]); g.stroke(); }
    pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, Math.max(4, cv.width/220), 0, 7); g.fill(); });
  }
}

async function apply(){
  if (!S?.result) return;
  const {plan, rooms} = structuredClone(S.result);
  if (!plan.walls.length) return toast(tr('没有识别出墙体，请调整参数', 'No walls detected — adjust the parameters'));
  Object.entries(S.names).forEach(([id, n]) => { if (n && rooms[id]){ rooms[id].name = n; const pr = plan.rooms.find(r => r.id === id); if (pr) pr.name = n; } });
  const keep = dlg.querySelector('#impUnder').checked, clear = dlg.querySelector('#impClear').checked;
  if (keep){
    const id = 'u' + Date.now().toString(36);
    setUnderlay(id, S.base.toDataURL('image/jpeg', .82)); plan.underlay.id = id;
  } else delete plan.underlay;
  Object.values(rooms).forEach(r => { if (!MATS[r.mat]) r.mat = 'tile800'; });
  const {is3D, setView} = await import('../main.js');
  if (is3D()) await setView('2d');
  ui.sel = null;
  mutate(() => {
    state.plan = plan; state.rooms = rooms; state.demolished = []; state.measures = [];
    if (clear) state.furniture = [];
  });
  ui.layers.underlay = keep;
  fitView();
  close();
  toast(tr(`已生成户型：${plan.rooms.length} 个房间，可用「墙体」工具修正（可撤销）`, `Plan created: ${plan.rooms.length} rooms — fix it with the Walls tool (undoable)`));
}
