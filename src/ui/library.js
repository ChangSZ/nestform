import {tr, nm} from '../i18n.js';
import {LIB, MATS, WALL_MATS} from '../data.js';
import {texURL} from '../materials.js';
import {matPrice, fmtUnit} from '../pricing.js';
import {pointInPoly} from '../import/rooms.js';
import {faceAt} from '../faces.js';
import {PARTS, partOf, partIcon} from '../plan2d/partitions.js';
import {wallOpts} from '../plan2d/walledit.js';
import {renderSel} from '../plan2d/render.js';
import {TAP, narrow, $, svg, state, ui, view, ext, mutate, P} from '../store.js';
import {bbox} from '../geom.js';
import {furnSVG} from '../plan2d/symbols.js';
import {esc, drawer, closeDrawers} from '../ui/panel.js';
import {addItem, setTool} from '../actions.js';
import {toMM} from '../plan2d/viewport.js';
import {toast} from '../io.js';
import {is3D} from '../main.js';

/* ======================= 素材面板：地面 / 墙面 / 家具家电 ======================= */
// 材质分类排在最前（三列色票），家具两列卡片；顶部分类标签可快速跳转，滚动时自动高亮
const matCats = () => [
  {key:'floor', cat:tr('地面', 'Floors'), items:Object.entries(MATS)},
  {key:'wall', cat:tr('墙面', 'Walls'), items:Object.entries(WALL_MATS).filter(([, m]) => m.group !== 'paper')},
  {key:'paper', cat:tr('墙纸', 'Wallpaper'), items:Object.entries(WALL_MATS).filter(([, m]) => m.group === 'paper'), attr:'wall'},
];
export function buildLib(){
  const cur = ui.sel?.kind === 'room' ? state.rooms[ui.sel.id] : null;
  const mats = matCats().map(c => `<section class="lib-cat matcat" data-cat="${c.key}"><h4>${c.cat}<em>${c.items.length}</em></h4><div class="lib-grid">${c.items.map(([k, m]) =>
    `<div class="item ${cur && (c.key === 'floor' ? cur.mat : cur.wall) === k ? 'cur' : ''}" data-${c.attr || c.key}="${k}" data-q="${esc((m.name + ' ' + nm(m.name) + ' ' + k).toLowerCase())}"
       title="${tr('点击应用到选中的房间，或拖到某个房间上', 'Click to apply to the selected room, or drag onto a room')}">
      <i class="tex" style="background-image:url(${texURL(k)})"></i><b>${esc(nm(m.name))}</b><small>${fmtUnit(matPrice(k))}</small></div>`).join('')}</div></section>`).join('');
  const parts = `<section class="lib-cat matcat" data-cat="part"><h4>${tr('隔断', 'Partitions')}<em>${PARTS().length}</em></h4><div class="lib-grid">${PARTS().map(p =>
    `<div class="item part ${wallOpts.part === p.key && ui.tool === 'wall' ? 'cur' : ''}" data-part="${p.key}" data-q="${esc((p.name + ' 隔断 partition ' + p.key).toLowerCase())}" title="${tr('点选后，在平面图上拖一条线放置', 'Pick, then drag a line on the plan')}">${partIcon(p.key)}<b>${esc(p.name)}</b><small>${p.split ? tr('分隔房间', 'Splits room') : tr('软隔断', 'Soft divider')}</small></div>`).join('')}</div></section>`;
  const furn = LIB.map((c,ci) => `<section class="lib-cat" data-cat="f${ci}"><h4>${nm(c.cat)}<em>${c.items.length}</em></h4><div class="lib-grid">${c.items.map((it,ii) => {
    const [t,n,w,d,col] = it, pad = Math.max(w,d)*.08;
    return `<div class="item" data-key="${ci}:${ii}" data-q="${esc((n + ' ' + nm(n) + ' ' + t).toLowerCase())}" title="${tr('点击添加，或拖到平面图 / 3D 地面上的指定位置', 'Click to add, or drag onto the plan / 3D floor')}">
      <svg viewBox="${-w/2-pad} ${-d/2-pad} ${w+2*pad} ${d+2*pad}">${furnSVG(t,w,d,col,it[5])}</svg><b>${esc(nm(n))}</b><small>${w}×${d}</small></div>`;
  }).join('')}</div></section>`).join('');
  $('#lib').innerHTML = mats + parts + furn + `<div class="lib-empty">${tr('没有匹配的素材', 'No matching items')}</div>`;
  // 分类标签
  const cats = [...matCats().map(c => [c.key, c.cat, c.items.length]), ['part', tr('隔断', 'Partitions'), PARTS().length], ['sep'], ...LIB.map((c, ci) => ['f' + ci, nm(c.cat), c.items.length])];
  $('#libCats').innerHTML = cats.map(([k, n]) => k === 'sep' ? '<span class="sep"></span>' : `<button data-jump="${k}">${esc(n)}</button>`).join('');
  $('#libCats').querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const sec = $(`#lib [data-cat="${b.dataset.jump}"]`); if (!sec) return;
    spyLock = performance.now() + 900;                                   // 平滑滚动期间不做滚动联动
    $('#libCats').querySelectorAll('[data-jump]').forEach(x => x.classList.toggle('on', x === b));
    $('#lib').scrollTo({top:sec.offsetTop - $('#lib').offsetTop, behavior:'smooth'});
  });
  filterLib(); syncCatChip();
  document.querySelectorAll('#lib .item[data-part]').forEach(el => el.addEventListener('click', () => armPart(el.dataset.part)));
  document.querySelectorAll('#lib .item:not([data-part])').forEach(el => el.addEventListener('pointerdown', e => {
    if (e.button) return;
    const mat = el.dataset.floor ? {kind:'floor', key:el.dataset.floor} : el.dataset.wall ? {kind:'wall', key:el.dataset.wall} : null;
    libDrag = {el, id:e.pointerId, sx:e.clientX, sy:e.clientY, it:mat ? null : itemOf(el), mat, ghost:null};
  }));
}
// 滚动时高亮当前分类
let spyLock = 0;
function syncCatChip(){
  if (performance.now() < spyLock) return;
  const lib = $('#lib'), y = lib.scrollTop + lib.offsetTop + 30;
  let on = null; lib.querySelectorAll('.lib-cat:not([hidden])').forEach(sec => { if (sec.offsetTop <= y) on = sec.dataset.cat; });
  $('#libCats').querySelectorAll('[data-jump]').forEach(b => b.classList.toggle('on', b.dataset.jump === on));
}
$('#lib').addEventListener('scroll', () => requestAnimationFrame(syncCatChip), {passive:true});

/** 选定隔断类型 → 切到平面图的墙体工具，等用户拖线放置 */
export async function armPart(key){
  wallOpts.part = key;
  const {is3D, setView} = await import('../main.js');
  if (is3D()) await setView('2d');
  setTool('wall'); syncPartCur();
  toast(tr(`在平面图上拖一条线放置「${partOf(key).name}」，端点会吸附到墙面`, `Drag a line on the plan to place: ${partOf(key).name}`));
}
export function syncPartCur(){ document.querySelectorAll('#lib [data-part]').forEach(el => el.classList.toggle('cur', ui.tool === 'wall' && el.dataset.part === wallOpts.part)); }
export const itemOf = el => { const [ci, ii] = el.dataset.key.split(':').map(Number); return LIB[ci].items[ii]; };

/** 把材质应用到房间（可撤销） */
export function applyMat(mat, roomId, face = null){
  const r = P().rooms.find(r => r.id === roomId);
  if (!r) return toast(tr('请先在平面图上点选一个房间，或把材质直接拖到房间上', 'Select a room first, or drag the material onto a room'));
  const m = mat.kind === 'floor' ? MATS[mat.key] : WALL_MATS[mat.key], st = state.rooms[roomId];
  if (mat.kind === 'wall' && face){                                   // 只刷这一面
    mutate(() => { (st.faces ||= {})[face.key] = mat.key; });
    syncLibCur();
    return toast(tr(`${st.name} ${face.edge.dir}墙：换成「${m.name}」`, `${nm(st.name)} ${face.edge.dir} wall → ${nm(m.name)}`));
  }
  mutate(() => { if (mat.kind === 'floor') st.mat = mat.key; else { st.wall = mat.key; st.faces = {}; } });   // 整间刷：清掉单面设置
  syncLibCur();
  toast(tr(`${st.name}：${mat.kind === 'floor' ? '地面' : '整间墙面'}换成「${m.name}」`, `${nm(st.name)}: ${mat.kind === 'floor' ? 'floor' : 'all walls'} → ${nm(m.name)}`));
}
/** 选中房间时，高亮它当前使用的地面 / 墙面材质卡片 */
export function syncLibCur(){
  const cur = ui.sel?.kind === 'room' ? state.rooms[ui.sel.id] : null;
  document.querySelectorAll('#lib [data-floor]').forEach(el => el.classList.toggle('cur', !!cur && cur.mat === el.dataset.floor));
  document.querySelectorAll('#lib [data-wall]').forEach(el => el.classList.toggle('cur', !!cur && cur.wall === el.dataset.wall));
}
const roomAt = p => p && P().rooms.find(r => r.counted !== false && pointInPoly([p.x, p.y], r.poly)) || p && P().rooms.find(r => pointInPoly([p.x, p.y], r.poly));

// 拖放：用 pointer 事件实现（iPad 上 HTML5 拖放不可靠）。列表竖向滚动（touch-action:pan-y），横向拖出才开始拖放。
export let libDrag = null;
// 屏幕坐标 → 户型坐标（mm）。2D 取平面图坐标，3D 取射线与地面的交点；s = 该处每 mm 的屏幕像素数
export function dropPoint(x, y){
  const r = $('#stage').getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  if (document.elementFromPoint(x, y)?.closest('.dock,.inspector,.island,.rail,.zoom,#fab,#walkOverlay,#joy,#walkExit,.modal')) return null;
  if (is3D()) return ext.View3D?.groundAt(x, y) || null;
  const p = toMM({clientX:x, clientY:y}); return {x:p.x, y:p.y, s:view.s};
}
let dropRoom = null;
const markDrop = id => { if (id === dropRoom) return; document.querySelectorAll('#gRooms .room.drop').forEach(el => el.classList.remove('drop')); dropRoom = id; if (id) $(`#gRooms [data-room="${id}"]`)?.classList.add('drop'); };
addEventListener('pointermove', e => {
  if (!libDrag || e.pointerId !== libDrag.id) return;
  const {it, mat} = libDrag;
  if (!libDrag.ghost){
    if (Math.hypot(e.clientX-libDrag.sx, e.clientY-libDrag.sy) < TAP) return;
    const g = libDrag.ghost = document.createElement('div'); g.id = 'ghost';
    if (mat){ g.className = 'swatch'; g.style.backgroundImage = `url(${texURL(mat.key)})`; }
    else g.innerHTML = `<svg viewBox="${-it[2]/2} ${-it[3]/2} ${it[2]} ${it[3]}">${furnSVG(it[0],it[2],it[3],it[4],it[5])}</svg>`;
    document.body.appendChild(g); libDrag.el.classList.add('dragging');
  }
  const g = libDrag.ghost, dp = dropPoint(e.clientX, e.clientY);
  if (mat){
    Object.assign(g.style, {width:'58px', height:'58px', left:e.clientX+'px', top:e.clientY+'px'});
    // 墙面材质：靠近某面墙 → 只刷这面（橙色高亮）；落在房间中间 → 整间
    const f = mat.kind === 'wall' && dp ? faceAt(dp, is3D() ? 600 : Math.max(300, 22/view.s)) : null;
    libDrag.face = f; ui.hoverFace = f ? {room:f.room.id, key:f.key} : null; renderSel();
    markDrop(f ? null : roomAt(dp)?.id || null);
  } else {
    // 幽灵图按落点处的比例显示真实大小（3D 中近大远小）
    const s = Math.max(dp?.s || (is3D() ? .05 : view.s), .02);
    Object.assign(g.style, {width:Math.max(28, it[2]*s)+'px', height:Math.max(20, it[3]*s)+'px', left:e.clientX+'px', top:e.clientY+'px'});
  }
  const lib = $('aside.lib'), lr = lib.getBoundingClientRect();
  if (narrow() && lib.classList.contains('open') && e.clientX > lr.right) drawer(null);   // 拖出抽屉后自动收起
});
export function endLibDrag(e, ok){
  if (!libDrag || e.pointerId !== libDrag.id) return;
  const d = libDrag; libDrag = null; markDrop(null); if (ui.hoverFace){ ui.hoverFace = null; renderSel(); }
  d.el.classList.remove('dragging');
  if (d.ghost){
    d.ghost.remove();
    if (!ok) return;
    const p = dropPoint(e.clientX, e.clientY);
    if (d.mat){ if (p) applyMat(d.mat, d.face?.room.id || roomAt(p)?.id, d.face); return; }
    if (p) addItem(d.it, p.x, p.y);
    else if (is3D() && e.clientX > $('aside.lib').getBoundingClientRect().right) toast(tr('请拖到地面上', 'Drop it on the floor'));
    return;
  }
  if (!ok) return;
  if (d.mat){ applyMat(d.mat, ui.sel?.kind === 'room' ? ui.sel.id : null); return; }
  // 轻点：放到选中房间中心，否则放到画面中心（3D 取屏幕中心对应的地面位置）
  let p = null;
  if (ui.sel?.kind === 'room'){ const b = bbox(P().rooms.find(r => r.id===ui.sel.id).poly); p = {x:(b[0]+b[2])/2, y:(b[1]+b[3])/2}; }
  else if (is3D()){ const r = $('#stage').getBoundingClientRect(); p = ext.View3D.groundAt(r.left + r.width/2, r.top + r.height/2); }
  if (!p) p = {x:view.x0 + svg.clientWidth/2/view.s, y:view.y0 + svg.clientHeight/2/view.s};
  addItem(d.it, p.x, p.y);
  closeDrawers();
}
addEventListener('pointerup', e => endLibDrag(e, true));
addEventListener('pointercancel', e => endLibDrag(e, false));


/* 家具库搜索（新增）：按中 / 英文名称或类型过滤，空分类自动隐藏 */
export function filterLib(){
  const q = ($('#libSearch')?.value || '').trim().toLowerCase();
  let any = false;
  document.querySelectorAll('#lib .lib-cat').forEach(cat => {
    let n = 0;
    cat.querySelectorAll('.item').forEach(el => { const ok = !q || el.dataset.q.includes(q); el.hidden = !ok; n += ok; });
    cat.hidden = !n; any ||= n > 0;
  });
  $('#lib').classList.toggle('no-match', !any);
}
$('#libSearch')?.addEventListener('input', filterLib);
$('#libSearch')?.addEventListener('keydown', e => { if (e.key === 'Escape'){ e.target.value = ''; filterLib(); e.target.blur(); } });
