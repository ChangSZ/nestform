import {archPanel, bindArchPanel, cutOpening, flipDoor} from '../plan2d/walledit.js';
import {tr, nm} from '../i18n.js';
import {MATS, WALL_MATS} from '../data.js';
import {texURL} from '../materials.js';
import {matPrice, furnPrice, fmtRange, fmtUnit, sourcesOf, PRICE_DATE} from '../pricing.js';
import {syncLibCur} from './library.js';
import {roomFaces} from '../faces.js';
import {demolishedLength} from '../demolish.js';
import {sharedLen, mergeRooms} from '../plan2d/partitions.js';
import {renderSel} from '../plan2d/render.js';
import {COARSE, narrow, $, state, ui, mutate, getF, ext, P} from '../store.js';
import {area, perim, bbox, fmt, norm} from '../geom.js';
import {select, rotateSel, deleteSel, duplicateSel, toggleWall} from '../actions.js';
import {toast} from '../io.js';
import {is3D} from '../main.js';

/* ======================= 右侧面板 ======================= */
const hM = () => (P().height || 2800)/1000;      // 层高（m）
export const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

export function renderPanel(){
  renderFab(); syncLibCur();
  const p = $('#panel');
  if (ui.sel?.kind === 'furn'){ const f = getF(ui.sel.id); if (f){ p.innerHTML = furnPanel(f); bindFurnPanel(f); return; } }
  if (ui.sel?.kind === 'room'){ p.innerHTML = roomPanel(P().rooms.find(r => r.id === ui.sel.id)); bindRoomPanel(); return; }
  if (['wall', 'win', 'door', 'slide', 'curtain', 'slat'].includes(ui.sel?.kind)){ const sel = ui.sel; p.innerHTML = archPanel(sel, esc) + `<section><div class="actions"><button class="btn" id="back">${tr('← 返回总览','← Back to overview')}</button></div></section>`; bindArchPanel(sel, mutate, select); $('#back').onclick = () => select(null); return; }
  p.innerHTML = overviewPanel(); bindOverview();
}

export function overviewPanel(){
  const rows = P().rooms.map(r => {
    const st = state.rooms[r.id];
    return `<tr class="click" data-room="${r.id}"><td><span class="sw" style="background:${MATS[st.mat].sw}"></span>${esc(nm(st.name))}${r.counted===false?' <span class="muted">*</span>':''}</td>
      <td class="r">${fmt(area(r.poly))} m²</td></tr>`;
  }).join('');
  const tot = P().rooms.filter(r => r.counted !== false).reduce((a,r) => a + area(r.poly), 0);
  const byMat = {};
  P().rooms.forEach(r => { const m = state.rooms[r.id].mat; byMat[m] = (byMat[m]||0) + area(r.poly); });
  // 预算：全部按市场参考价区间（见 src/pricing.js）
  const used = [], B = {floor:[0, 0], wall:[0, 0], furn:[0, 0]};
  const row = (sw, name, qty, p, mul, bucket) => { if (!p) return `<tr><td>${sw}${name}</td><td class="r">${qty}</td><td class="r muted">—</td></tr>`;
    const lo = p.low*mul, hi = p.high*mul; B[bucket][0] += lo; B[bucket][1] += hi; used.push(...p.items);
    return `<tr><td>${sw}${name}</td><td class="r">${qty}</td><td class="r">${fmtRange(lo, hi)}</td></tr>`; };
  const matRows = Object.entries(byMat).map(([m,a]) => row(`<span class="sw" style="background:url(${texURL(m)}) center/cover"></span>`, nm(MATS[m].name), `${fmt(a,1)} m²`, matPrice(m), a*1.05, 'floor')).join('');
  const byWall = {};
  P().rooms.filter(r => r.counted !== false).forEach(r => roomFaces(r).forEach(f => byWall[f.mat] = (byWall[f.mat]||0) + f.len/1000*hM()));   // 按面汇总
  const wallRows = Object.entries(byWall).map(([w,a]) => row(`<span class="sw" style="background:url(${texURL(w)}) center/cover"></span>`, nm(WALL_MATS[w]?.name || w), `${fmt(a,1)} m²`, matPrice(w), a*1.05, 'wall')).join('');
  const furnRows = state.furniture.map(f => ({f, p:furnPrice(f, P().height || 2800)})).filter(x => x.p)
    .map(({f, p}) => row('', esc(nm(f.name)), `${fmt(p.qty, p.qty < 10 && p.unit !== tr('件', 'pc') ? 2 : 0)} ${p.unit}`, {low:p.low, high:p.high, items:p.items}, 1, 'furn')).join('');
  const total = [B.floor[0] + B.wall[0] + B.furn[0], B.floor[1] + B.wall[1] + B.furn[1]];
  const srcs = sourcesOf(used);
  const demLen = demolishedLength();
  return `
  <section class="plan-set"><h3>${tr('户型设置','Plan settings')}</h3>
    <div class="form">
      <label>${tr('层高','Ceiling height')} (mm)<input type="number" id="pHeight" value="${P().height || 2800}" min="2200" max="4200" step="50"></label>
      <label>${tr('指北方向','North')} (°)<input type="number" id="pNorth" value="${P().north || 0}" min="0" max="359" step="15"></label>
    </div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">${tr('层高影响 3D 墙高、窗洞和墙面面积；指北方向影响指北针和「东 / 南 / 西 / 北墙」标注。','Height drives 3D walls, windows and wall areas; north drives the compass and face labels.')}</div></section>
  <section><h3>${tr('房间面积','Room Areas')} <small>${tr('点击查看 / 更换地面','Click to view / change flooring')}</small></h3>
    <table>${rows}</table>
    <div class="total"><span>${tr('套内使用面积','Net floor area')}</span><b>${fmt(tot)} m²</b></div>
    <div class="muted" style="font-size:11px;margin-top:4px">${P().rooms.some(r => r.counted === false) ? tr('* 飘窗不计入使用面积；面积按墙体内净尺寸计算','* Bay windows are excluded; areas use net inner wall dimensions') : tr('* 面积按墙体内净尺寸计算','* Areas use net inner wall dimensions')}</div></section>
  <section class="budget"><h3>${tr('预算估算','Budget estimate')} <small>${tr(`市场参考价 · ${PRICE_DATE}`, `Market reference · ${PRICE_DATE}`)}</small></h3>
    <div class="total big-total"><span>${tr('合计（地面 + 墙面 + 定制柜 / 家电）','Total (floors + walls + cabinets / appliances)')}</span><b>${fmtRange(...total)}</b></div>
    <div class="muted" style="font-size:11.5px;margin-top:6px">${tr('区间为主流品牌中档产品的市场价（低–高），材料不含人工的已叠加铺贴 / 施工费；不含水电、吊顶、拆改等基础工程。','Ranges are mid-market prices (low–high), with labor added where materials exclude it; plumbing, ceilings and demolition not included.')}</div></section>
  <section><h3>${tr('地面','Floors')} <small>${tr('含 5% 损耗','incl. 5% waste')}</small></h3>
    <table class="cost">${matRows}</table>
    <div class="total"><span>${tr('地面小计','Floors')}</span><b>${fmtRange(...B.floor)}</b></div></section>
  <section><h3>${tr('墙面','Walls')} <small>${tr(`层高 ${hM()}m，未扣门窗`,`${hM()}m ceiling, openings not deducted`)}</small></h3>
    <table class="cost">${wallRows}</table>
    <div class="total"><span>${tr('墙面小计','Walls')}</span><b>${fmtRange(...B.wall)}</b></div></section>
  <section><h3>${tr('定制柜 · 橱柜 · 家电','Cabinets · kitchen · appliances')} <small>${tr('柜体按投影面积','cabinets by projected area')}</small></h3>
    <table class="cost">${furnRows || `<tr><td class="muted">${tr('暂无可计价的定制柜 / 家电','No priced cabinets or appliances yet')}</td></tr>`}</table>
    <div class="total"><span>${tr('小计','Subtotal')}</span><b>${fmtRange(...B.furn)}</b></div></section>
  <section><details class="srcs"><summary>${tr(`价格来源（${srcs.length} 项参考）`, `Price sources (${srcs.length})`)}</summary>
    ${srcs.map(it => `<div class="src"><b>${esc(it.name_zh)}</b> <span class="muted">¥${it.low}–${it.high} / ${{m2:'m²', m2_projection:tr('m² 投影','m² proj.'), linear_m:tr('延米','lin. m'), piece:tr('件','pc')}[it.unit] || it.unit}${it.brands?.length ? ' · ' + esc(it.brands.join(' / ')) : ''}</span>
      ${it.notes ? `<div class="muted">${esc(it.notes)}</div>` : ''}<div>${(it.sources || []).slice(0, 3).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`).join('')}</div></div>`).join('')}
    <div class="muted" style="margin-top:8px">${tr('完整价目与口径说明：data/prices/SOURCES.md。品牌门店常有活动价、面积门槛和增项，实际以报价为准。','Full list and caveats: data/prices/SOURCES.md. Store promotions, thresholds and extras vary — get a real quote.')}</div></details></section>
  <section><h3>${tr('方案统计','Plan Stats')}</h3>
    <div class="stats"><div><small>${tr('家具数量','Furniture')}</small><span class="big">${state.furniture.length}</span></div>
      <div><small>${tr('拆除墙体','Walls removed')}</small><span class="big">${fmt(demLen,1)}</span> m</div></div>
    <div class="actions"><button class="btn" id="clearMeasure">${tr('清除测量','Clear measures')} (${state.measures.length})</button>
      <button class="btn danger" id="clearFurn">${tr('清空布置','Clear layout')}</button></div></section>
  ${COARSE ? tr(`<section><h3>触屏操作</h3><div class="kbd">
    <kbd>单指拖动</kbd><span>空白处平移画面</span><kbd>双指</kbd><span>捏合缩放、拖动平移</span>
    <kbd>素材坞</kbd><span>点一下放到画面中央，或按住向上拖到指定位置；材质拖到房间上即应用</span>
    <kbd>点家具</kbd><span>选中后拖动移动；拖顶部圆点旋转、右下方块改尺寸</span>
    <kbd>工具条</kbd><span>选中后底部可旋转 / 复制 / 删除</span>
    <kbd>测量</kbd><span>按住拖出一条线，或依次点两点</span>
    <kbd>VR 看房</kbd><span>左下摇杆移动，拖动屏幕转向，点门开关</span>
  </div></section>`, `<section><h3>Touch Controls</h3><div class="kbd">
    <kbd>1-finger drag</kbd><span>Pan on empty space</span><kbd>2 fingers</kbd><span>Pinch to zoom, drag to pan</span>
    <kbd>Library</kbd><span>Tap to place at center, or hold and drag right to a spot</span>
    <kbd>Tap item</kbd><span>Drag to move; top dot rotates, bottom-right square resizes</span>
    <kbd>Toolbar</kbd><span>Bottom bar can rotate / duplicate / delete</span>
    <kbd>Measure</kbd><span>Hold and drag a line, or tap two points</span>
    <kbd>VR tour</kbd><span>Joystick moves, drag to look, tap doors to open</span>
  </div></section>`) : ''}
  ${tr(`<section><h3>键盘快捷键</h3><div class="kbd">
    <kbd>拖拽</kbd><span>从底部素材坞拖入家具 / 材质</span><kbd>V</kbd><span>选择 / 移动</span><kbd>M</kbd><span>测量（Shift 水平/垂直）</span>
    <kbd>W / X</kbd><span>墙体：画墙、开门开窗、标记拆除（黑色承重墙不可拆）</span><kbd>R</kbd><span>旋转 90°（Shift 反向）</span><kbd>方向键</kbd><span>微调 10mm（Shift 100mm）</span>
    <kbd>⌘/Ctrl D</kbd><span>复制</span><kbd>Delete</kbd><span>删除</span><kbd>⌘/Ctrl Z</kbd><span>撤销</span><kbd>T</kbd><span>切换 2D / 3D</span><kbd>F</kbd><span>适应窗口</span><kbd>Esc</kbd><span>取消选择</span>
  </div></section>`, `<section><h3>Keyboard Shortcuts</h3><div class="kbd">
    <kbd>Drag</kbd><span>Drag furniture onto the plan</span><kbd>V</kbd><span>Select / move</span><kbd>M</kbd><span>Measure (Shift: horizontal/vertical)</span>
    <kbd>W / X</kbd><span>Walls: draw, cut doors / windows, demolish (black = bearing)</span><kbd>R</kbd><span>Rotate 90° (Shift reverses)</span><kbd>Arrows</kbd><span>Nudge 10mm (Shift 100mm)</span>
    <kbd>⌘/Ctrl D</kbd><span>Duplicate</span><kbd>Delete</kbd><span>Delete</span><kbd>⌘/Ctrl Z</kbd><span>Undo</span><kbd>T</kbd><span>Toggle 2D / 3D</span><kbd>F</kbd><span>Fit to window</span><kbd>Esc</kbd><span>Deselect</span>
  </div></section>`)}`;
}
export function bindOverview(){
  $('#pHeight').onchange = e => { const v = Math.round(+e.target.value/10)*10; if (v >= 2000 && v <= 5000) mutate(() => P().height = v); };
  $('#pNorth').onchange = e => { const v = ((Math.round(+e.target.value) % 360) + 360) % 360; mutate(() => P().north = v); };
  document.querySelectorAll('#panel tr[data-room]').forEach(tr => tr.onclick = () => { select({kind:'room', id:tr.dataset.room}); if (is3D()) ext.View3D.flyToRoom(tr.dataset.room); });
  $('#clearMeasure').onclick = () => state.measures.length && mutate(() => state.measures = []);
  $('#clearFurn').onclick = clearLayout;
}

// 底部浮动工具条：触屏没有键盘，旋转 / 复制 / 删除都放在这里
export function renderFab(){
  const fab = $('#fab'), f = ui.sel?.kind === 'furn' && getF(ui.sel.id), r = ui.sel?.kind === 'room' && P().rooms.find(r => r.id === ui.sel.id);
  const arch = ['wall', 'win', 'door', 'slide', 'curtain', 'slat'].includes(ui.sel?.kind) && ui.sel;
  if (arch){
    const label = {wall:tr('墙体','Wall'), win:tr('窗','Window'), door:tr('门','Door'), slide:tr('推拉门','Sliding door'), curtain:tr('帘子','Curtain'), slat:tr('木格栅','Slat screen')}[arch.kind];
    fab.innerHTML = `<span class="name">${label}</span>${arch.kind === 'wall' ? `<button class="btn" data-a="wdoor">${tr('开门洞','Add door')}</button><button class="btn" data-a="wwin">${tr('开窗','Add window')}</button><button class="btn" data-a="wdem">${state.demolished.includes('w' + arch.i) ? tr('恢复','Restore') : tr('拆除','Demolish')}</button>` : ''}
      ${arch.kind === 'door' ? `<button class="btn" data-a="wflip">${tr('翻转开向','Flip')}</button>` : ''}<button class="btn danger" data-a="del">${tr('删除','Delete')}</button><span class="sep"></span>
      <button class="btn narrow-only" data-a="prop">${tr('属性','Properties')}</button><button class="btn" data-a="done">${tr('完成','Done')}</button>`;
    fab.classList.add('show');
    fab.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({
      wdoor:() => P().walls[arch.i]?.[4] === 'b' ? toast(tr('承重墙不能开洞（黑色）','Load-bearing walls cannot be cut')) : mutate(() => cutOpening(arch.i, 'door', 900, arch.at)),
      wwin:() => P().walls[arch.i]?.[4] === 'b' ? toast(tr('承重墙不能开洞（黑色）','Load-bearing walls cannot be cut')) : mutate(() => cutOpening(arch.i, 'win', 1500, arch.at)),
      wflip:() => mutate(() => flipDoor(arch.i)), wdem:() => toggleWall('w' + arch.i), del:deleteSel, prop:() => drawer('panel', true), done:() => { select(null); closeDrawers(); },
    })[b.dataset.a]());
    return;
  }
  if (!f && !r){ fab.classList.remove('show'); return; }
  fab.innerHTML = f
    ? `<span class="name">${esc(nm(f.name))}</span><button class="icon-btn" data-a="rotL" title="${tr('逆时针 90°','Rotate left')}"><svg><use href="#i-rotl"/></svg></button><button class="btn" data-a="rotR"><svg><use href="#i-rotr"/></svg>${tr('旋转','Rotate')}</button>
       <button class="btn" data-a="dup">${tr('复制','Duplicate')}</button><button class="btn danger" data-a="del">${tr('删除','Delete')}</button><span class="sep"></span>
       <button class="btn narrow-only" data-a="prop">${tr('属性','Properties')}</button><button class="btn" data-a="done">${tr('完成','Done')}</button>`
    : `<span class="name">${esc(nm(state.rooms[r.id].name))}</span><button class="btn narrow-only" data-a="prop">${tr('地面 / 属性','Floor / Properties')}</button><button class="btn" data-a="done">${tr('完成','Done')}</button>`;
  fab.classList.add('show');
  fab.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({
    rotL:() => rotateSel(-90), rotR:() => rotateSel(90), dup:duplicateSel, del:deleteSel,
    prop:() => drawer('panel', true), done:() => { select(null); closeDrawers(); },
  })[b.dataset.a]());
}

export function clearLayout(){
  const n = state.furniture.length;
  if (!n) return toast(tr('当前没有布置任何家具', 'There is no furniture to clear'));
  if (!confirm(tr(`确定清空全部 ${n} 件家具 / 家电吗？\n墙体、地面材料和测量线会保留，可点「撤销」恢复。`, `Remove all ${n} furniture / appliance items?\nWalls, flooring and measurements are kept. You can Undo this.`))) return;
  ui.sel = null; mutate(() => state.furniture = []);
  toast(tr('已清空布置，可点「撤销」恢复', 'Layout cleared — Undo to restore'));
}

/* 侧栏开合：which = 'lib' | 'panel' | null，open 不传则切换。
 * 宽屏：侧栏在布局中收起 / 展开（记住选择）；窄屏：侧栏是浮层抽屉，一次只开一个，which = null 表示全部关闭 */
export const PANES = 'nestform-panes';
export const panes = (() => { try { return JSON.parse(localStorage.getItem(PANES)) || {}; } catch(e) { return {}; } })();
export function drawer(which, open){
  const app = $('.app'), els = {lib:$('aside.lib'), panel:$('aside.right')}, n = narrow();
  if (n){
    Object.entries(els).forEach(([k, el]) => el.classList.toggle('open', k === which && (open ?? !el.classList.contains('open'))));
  } else {
    Object.values(els).forEach(el => el.classList.remove('open'));
    if (which){
      const k = which === 'lib' ? 'hideLib' : 'hidePanel';
      panes[k] = open === undefined ? !panes[k] : !open;
      try { localStorage.setItem(PANES, JSON.stringify(panes)); } catch(e) {}
    }
  }
  app.classList.toggle('hide-lib', !!panes.hideLib); app.classList.toggle('hide-panel', !!panes.hidePanel);
  syncPaneBtns();
}
export function syncPaneBtns(){
  const els = {lib:$('aside.lib'), panel:$('aside.right')}, n = narrow();
  const vis = k => n ? els[k].classList.contains('open') : !panes[k === 'lib' ? 'hideLib' : 'hidePanel'];
  $('#tgLib').classList.toggle('on', vis('lib')); $('#tgPanel').classList.toggle('on', vis('panel'));
  $('#tgLib').title = vis('lib') ? tr('收起素材坞 ( [ )', 'Hide dock ( [ )') : tr('展开素材坞 ( [ )', 'Show dock ( [ )');
  $('#tgPanel').title = vis('panel') ? tr('收起检查器 ( ] )', 'Hide inspector ( ] )') : tr('展开检查器 ( ] )', 'Show inspector ( ] )');
  $('#stage').classList.toggle('drawer-panel', n && vis('panel'));   // 属性抽屉盖住画面时让出底部工具条
}
export function closeDrawers(){ if (narrow()) drawer(null); }

export function roomPanel(r){
  const faces = roomFaces(r);
  const st = state.rooms[r.id], a = area(r.poly), [x0,y0,x1,y1] = bbox(r.poly), inside = state.furniture.filter(f => f.cx>x0&&f.cx<x1&&f.cy>y0&&f.cy<y1);
  const mats = Object.entries(MATS).map(([k,m]) => `<button class="mat ${k===st.mat?'on':''}" data-mat="${k}"><i style="background:url(${texURL(k)}) center/cover"></i><span>${nm(m.name)}<small>${fmtUnit(matPrice(k))}/m²</small></span></button>`).join('');
  return `<section><h3>${tr('房间','Room')}</h3>
    <div class="form"><label class="full">${tr('名称','Name')}<input id="rName" value="${esc(nm(st.name))}"></label></div>
    <div class="stats" style="margin-top:10px">
      <div><small>${tr('使用面积','Floor area')}</small><span class="big">${fmt(a)}</span> m²</div>
      <div><small>${tr('周长','Perimeter')}</small><span class="big">${fmt(perim(r.poly),1)}</span> m</div>
      <div><small>${tr('开间','Width')}</small><span class="big">${x1-x0}</span> mm</div>
      <div><small>${tr('进深','Depth')}</small><span class="big">${y1-y0}</span> mm</div></div>
    <div class="muted">${tr(`墙面面积（层高 ${hM()}m，未扣门窗）约 ${fmt(perim(r.poly)*hM(),1)} m²`, `Wall area (${hM()}m ceiling, openings not deducted) ≈ ${fmt(perim(r.poly)*hM(),1)} m²`)}</div></section>
  <section><h3>${tr('地面材料','Flooring')}</h3><div class="mats">${mats}</div>
    <div class="total"><span>${tr('地面估价','Flooring cost')}</span><b>${(p => p ? fmtRange(p.low*a*1.05, p.high*a*1.05) : '—')(matPrice(st.mat))}</b></div></section>
  <section><h3>${tr('墙面','Walls')} <small>${tr('逐面设置；也可把墙面 / 墙纸素材拖到某面墙附近','Set per face, or drop a wall material near a face')}</small></h3>
    <table class="faces">${faces.map(f => `<tr class="${ui.face === f.edge.key ? 'on' : ''}" data-face="${f.edge.key}"><td><b>${f.edge.dir}${tr('墙','')}</b> <span class="muted">${fmt(f.len/1000,2)} m</span></td>
      <td class="r"><select data-fmat="${f.edge.key}"><option value="">${tr('跟随房间','Room default')}</option>${Object.entries(WALL_MATS).map(([k,m]) => `<option value="${k}" ${st.faces?.[f.edge.key] === k ? 'selected' : ''}>${nm(m.name)}</option>`).join('')}</select></td></tr>`).join('') || `<tr><td class="muted">${tr('没有贴墙的边','No wall faces')}</td></tr>`}</table>
    <div class="pop-label" style="padding:10px 0 6px">${tr('房间默认墙面','Room default')}</div><div class="mats">${Object.entries(WALL_MATS).map(([k,m]) => `<button class="mat ${k===st.wall?'on':''}" data-wall="${k}"><i style="background:url(${texURL(k)}) center/cover"></i><span>${nm(m.name)}<small>${fmtUnit(matPrice(k))}/m²</small></span></button>`).join('')}</div>
    <div class="total"><span>${tr(`墙面 ${fmt(faces.reduce((a,f) => a + f.len, 0)/1000*hM(),1)} m² 估价`,`Walls ${fmt(faces.reduce((a,f) => a + f.len, 0)/1000*hM(),1)} m²`)}</span><b>${fmtRange(...faces.reduce(([lo, hi], f) => { const p = matPrice(f.mat), A = f.len/1000*hM()*1.05; return p ? [lo + p.low*A, hi + p.high*A] : [lo, hi]; }, [0, 0]))}</b></div></section>
  <section><h3>${tr('房间内家具','Furniture in room')} <small>${tr(`${inside.length} 件`, `${inside.length} items`)}</small></h3>
    <table>${inside.map(f => `<tr class="click" data-fid="${f.id}"><td>${esc(nm(f.name))}</td><td class="r muted">${f.w}×${f.d}</td></tr>`).join('') || `<tr><td class="muted">${tr('暂无','None')}</td></tr>`}</table>
    <div class="actions"><button class="btn" id="back">${tr('← 返回总览','← Back to overview')}</button></div></section>
  ${(nb => nb.length ? `<section><h3>${tr('合并房间','Merge rooms')} <small>${tr('去掉两间之间的分界，合成一间','Remove the boundary between two rooms')}</small></h3>
    <div class="actions">${nb.map(o => `<button class="btn" data-merge="${o.id}">${tr('并入','Merge')} ${esc(nm(state.rooms[o.id]?.name || o.name))}</button>`).join('')}</div></section>` : '')(P().rooms.filter(o => o.id !== r.id && o.counted !== false && sharedLen(r, o) > 300))}`;
}
export function bindRoomPanel(){
  const id = ui.sel.id;
  $('#rName').onchange = e => mutate(() => state.rooms[id].name = e.target.value.trim() || state.rooms[id].name);
  document.querySelectorAll('#panel [data-mat]').forEach(b => b.onclick = () => mutate(() => state.rooms[id].mat = b.dataset.mat));
  document.querySelectorAll('#panel [data-wall]').forEach(b => b.onclick = () => mutate(() => state.rooms[id].wall = b.dataset.wall));
  document.querySelectorAll('#panel [data-merge]').forEach(b => b.onclick = () => {
    const other = state.rooms[b.dataset.merge]?.name; let ok = false;
    mutate(() => { ok = mergeRooms(id, b.dataset.merge); });
    toast(ok ? tr(`已把「${other}」并入「${state.rooms[id].name}」`, `Merged ${other} into ${state.rooms[id].name}`) : tr('合并失败：两个房间不相邻', 'Merge failed: rooms are not adjacent'));
  });
  document.querySelectorAll('#panel [data-fmat]').forEach(sel => sel.onchange = () => mutate(() => {
    const f = state.rooms[id].faces ||= {}; if (sel.value) f[sel.dataset.fmat] = sel.value; else delete f[sel.dataset.fmat];
  }));
  // 悬停 / 点击某面墙 → 平面图与三维中高亮
  document.querySelectorAll('#panel tr[data-face]').forEach(tr => { tr.onmouseenter = () => { ui.hoverFace = {room:id, key:tr.dataset.face}; renderSel(); }; tr.onmouseleave = () => { ui.hoverFace = null; renderSel(); }; });
  document.querySelectorAll('#panel tr[data-fid]').forEach(tr => tr.onclick = () => select({kind:'furn', id:tr.dataset.fid}));
  $('#back').onclick = () => select(null);
}

// 定制柜参数
const DOORS = () => ({flat:tr('平开门','Doors'), glass:tr('玻璃门','Glass'), open:tr('开放格','Open shelves')});
function cabSection(f){
  const p = f.cab, num = (id, lab, v, step = 10, min = 0) => `<label>${lab}<input type="number" id="${id}" value="${v}" min="${min}" step="${step}"></label>`;
  const chk = (id, lab, v) => `<label class="imp-check"><input type="checkbox" id="${id}" ${v ? 'checked' : ''}> ${lab}</label>`;
  let s = num('cH', tr('高度 mm（0 = 顶天）','Height mm (0 = to ceiling)'), p.h || 0, 50);
  if (f.type === 'customcab') s += num('cMount', tr('离地 mm','Off floor mm'), p.mount || 0, 50) + num('cCols', tr('列数','Columns'), p.cols || 1, 1, 1) + num('cRows', tr('层数','Rows'), p.rows || 1, 1, 1);
  if (f.type === 'tvwall') s += num('cTvw', tr('电视位宽 mm','TV niche mm'), p.tvw || 1600, 50, 600);
  if (f.type === 'laundrycab') s += num('cSlots', tr('洗衣机位','Washer bays'), p.slots || 1, 1, 1);
  if (f.type !== 'laundrycab') s += `<label class="full">${tr('门板','Fronts')}<select id="cDoor">${Object.entries(DOORS()).map(([k, v]) => `<option value="${k}" ${k === (p.door || 'flat') ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`;
  let c = '';
  if (f.type === 'laundrycab') c = chk('cStack', tr('洗衣机 + 烘干机上下叠放','Stack washer + dryer'), p.stack) + chk('cSink', tr('带水槽台面','With sink counter'), p.sink);
  if (f.type === 'customcab') c = chk('cNiche', tr('中空格（0.9–1.3m 留空放钥匙 / 摆件）','Open niche at 0.9–1.3 m'), p.niche);
  return `<div class="pop-label" style="padding:12px 0 6px">${tr('定制参数','Custom options')}</div><div class="form">${s}</div><div style="margin-top:6px">${c}</div>`;
}
function bindCab(f){
  const upd = fn => mutate(() => { const g = getF(f.id); if (g?.cab) fn(g.cab); });
  const num = (id, key, lo, hi) => { const el = $(id); if (el) el.onchange = e => { const v = Math.round(+e.target.value); if (!isNaN(v)) upd(c => c[key] = Math.max(lo, Math.min(hi, v))); }; };
  num('#cH', 'h', 0, 5000); num('#cMount', 'mount', 0, 3000); num('#cCols', 'cols', 1, 12); num('#cRows', 'rows', 1, 12); num('#cTvw', 'tvw', 600, 4000); num('#cSlots', 'slots', 1, 2);
  const sel = $('#cDoor'); if (sel) sel.onchange = () => upd(c => c.door = sel.value);
  [['#cStack', 'stack'], ['#cSink', 'sink'], ['#cNiche', 'niche']].forEach(([id, k]) => { const el = $(id); if (el) el.onchange = () => upd(c => c[k] = el.checked); });
}
export function furnPanel(f){
  return `<section><h3>${tr('家具属性','Furniture')}</h3>
    <div class="form">
      <label class="full">${tr('名称','Name')}<input id="fName" value="${esc(nm(f.name))}"></label>
      <label>${tr('宽','Width')} (mm)<input type="number" id="fW" value="${f.w}" min="50" step="10"></label>
      <label>${tr('深','Depth')} (mm)<input type="number" id="fD" value="${f.d}" min="50" step="10"></label>
      <label>${tr('中心','Center')} X (mm)<input type="number" id="fX" value="${Math.round(f.cx)}" step="10"></label>
      <label>${tr('中心','Center')} Y (mm)<input type="number" id="fY" value="${Math.round(f.cy)}" step="10"></label>
      <label>${tr('旋转','Rotation')} (°)<input type="number" id="fR" value="${f.rot}" step="15"></label>
      <label>${tr('颜色','Color')}<input type="color" id="fC" value="${f.color}"></label>
    </div>
    <div class="muted" style="margin-top:8px">${tr('占地面积','Footprint')} ${fmt(f.w*f.d/1e6)} m²</div>
    ${f.cab ? cabSection(f) : ''}
    ${(p => p ? `<div class="total"><span>${tr('参考价','Reference price')}<small class="muted"> ${p.qty} ${p.unit}</small></span><b>${fmtRange(p.low, p.high)}</b></div><div class="muted" style="font-size:11px;margin-top:4px">${esc(p.note)} · ${esc(p.items.map(i => (i.brands || []).slice(0, 3).join(' / ')).filter(Boolean).join('；'))}</div>` : '')(furnPrice(f, P().height || 2800))}
    <div class="actions">
      <button class="btn" id="aRot">${tr('旋转 90°','Rotate 90°')}</button><button class="btn" id="aDup">${tr('复制','Duplicate')}</button>
      <button class="btn" id="aTop">${tr('置于顶层','Bring to front')}</button><button class="btn" id="aBot">${tr('置于底层','Send to back')}</button>
      <button class="btn danger" id="aDel">${tr('删除','Delete')}</button><button class="btn" id="back">${tr('← 返回','← Back')}</button>
    </div></section>
  <section class="muted" style="font-size:12px">${tr('拖动家具移动；拖动上方圆点旋转；拖动右下角方块调整尺寸。开启「贴墙吸附」后靠近墙面会自动贴齐。', 'Drag to move; drag the top dot to rotate; drag the bottom-right square to resize. With "Wall snap" on, items snap flush to nearby walls.')}</section>`;
}
export function bindFurnPanel(f){
  if (f.cab) bindCab(f);
  const upd = (fn) => mutate(() => { const g = getF(f.id); if (g) fn(g); });
  const num = (id, fn) => $(id).onchange = e => { const v = parseFloat(e.target.value); if (!isNaN(v)) upd(g => fn(g, v)); };
  $('#fName').onchange = e => upd(g => g.name = e.target.value.trim() || g.name);
  num('#fW', (g,v) => g.w = Math.max(50, Math.round(v)));
  num('#fD', (g,v) => g.d = Math.max(50, Math.round(v)));
  num('#fX', (g,v) => g.cx = v); num('#fY', (g,v) => g.cy = v); num('#fR', (g,v) => g.rot = norm(v));
  $('#fC').onchange = e => upd(g => g.color = e.target.value);
  $('#aRot').onclick = () => rotateSel(90);
  $('#aDup').onclick = duplicateSel;
  $('#aDel').onclick = deleteSel;
  $('#aTop').onclick = () => mutate(() => { const i = state.furniture.findIndex(g => g.id===f.id); state.furniture.push(...state.furniture.splice(i,1)); });
  $('#aBot').onclick = () => mutate(() => { const i = state.furniture.findIndex(g => g.id===f.id); state.furniture.unshift(...state.furniture.splice(i,1)); });
  $('#back').onclick = () => select(null);
}

