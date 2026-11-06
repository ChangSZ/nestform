/* =====================================================================
 *  墙体编辑工具（W）：修正识别结果 / 改造户型
 *   - 点墙选中；拖动墙身沿垂直方向平移，拖两端手柄改长度（吸附 10mm 与其它墙面）
 *   - 空白处拖动 → 画新墙（自动横平竖直）
 *   - 点窗 / 门选中；Delete 删除；面板里可开门洞 / 开窗 / 翻转门的开向
 *   - 每次修改后自动重算房间（识别生成的户型；默认户型需在面板手动点「重算房间」）
 * ===================================================================== */
import {tr, nm} from '../i18n.js';
import {state, ui, view, snap, commit, P} from '../store.js';
import {extractRooms, pointInPoly} from '../import/rooms.js';
import {toggleWall} from '../actions.js';
import {remapDemolished} from '../demolish.js';
import {isArc, wallRects} from '../arcs.js';
import {WALL_MATS} from '../data.js';
import {roomEdges} from '../faces.js';
import {toast} from '../io.js';
import {placePartition, splitRoomsBy, partOf, recordPartition, partitionOf, deletePartition} from './partitions.js';

export const wallOpts = {part:'wall'};                     // 当前要画的隔断类型（见 partitions.js）
const isH = w => (w[2] - w[0]) >= (w[3] - w[1]);
const r10 = v => Math.round(v/10)*10;

/* ---------- 吸附：坐标靠近其它墙面时贴齐 ---------- */
function snapAxis(v, axis, skip){
  const tol = 8/view.s; let best = tol, out = r10(v);
  P().walls.forEach((w, i) => {
    if (i === skip) return;
    for (const e of axis === 'x' ? [w[0], w[2]] : [w[1], w[3]]) if (Math.abs(e - v) < best){ best = Math.abs(e - v); out = e; }
  });
  return out;
}

/** pointerdown（墙体工具）→ 返回 drag 对象（由 pointer.js 持有） */
export function wallDown(e, p, t, select){
  const h = t.closest('[data-handle]');
  if (h && ui.sel?.kind === 'wall' && h.dataset.handle.startsWith('wend')){
    return {kind:'wallEnd', i:ui.sel.i, end:+h.dataset.handle.slice(4), sx:e.clientX, sy:e.clientY, before:snap(), moved:false};
  }
  const wEl = t.closest('[data-wall]'), oEl = t.closest('[data-win],[data-door],[data-slide],[data-curtain],[data-slat]');
  if (oEl){
    const ds = oEl.dataset, kind = ds.win !== undefined ? 'win' : ds.door !== undefined ? 'door' : ds.slide !== undefined ? 'slide' : ds.curtain !== undefined ? 'curtain' : 'slat', i = +(ds.win ?? ds.door ?? ds.slide ?? ds.curtain ?? ds.slat);
    select({kind, i});
    if (['door', 'win', 'slide'].includes(kind)) return {kind:'wallOpMove', sel:{kind, i}, p0:p, sx:e.clientX, sy:e.clientY, before:snap(), moved:false};
    return null;
  }
  if (wEl){
    const i = +wEl.dataset.wall.slice(1), w = P().walls[i];
    select({kind:'wall', i, at:{x:p.x, y:p.y}});
    return {kind:'wallMove', i, sx:e.clientX, sy:e.clientY, p0:p, w0:w.slice(), before:snap(), moved:false};
  }
  select(null);
  const x = snapAxis(p.x, 'x'), y = snapAxis(p.y, 'y');
  return {kind:'wallDraw', a:{x, y}, b:{x, y}, sx:e.clientX, sy:e.clientY, before:snap(), moved:false};
}

/** 拖动中：直接改 state.plan（松手时统一记撤销） */
export function wallMove(d, p){
  const W = P().walls;
  if (d.kind === 'wallMove'){
    const w = W[d.i], h = isH(d.w0);
    if (h){ const dy = p.y - d.p0.y, th = d.w0[3] - d.w0[1]; const y0 = snapAxis(d.w0[1] + dy, 'y', d.i); w[1] = y0; w[3] = y0 + th; }
    else { const dx = p.x - d.p0.x, th = d.w0[2] - d.w0[0]; const x0 = snapAxis(d.w0[0] + dx, 'x', d.i); w[0] = x0; w[2] = x0 + th; }
  } else if (d.kind === 'wallEnd'){
    const w = W[d.i], h = isH(w), min = 100;
    if (h){ if (d.end === 0) w[0] = Math.min(snapAxis(p.x, 'x', d.i), w[2] - min); else w[2] = Math.max(snapAxis(p.x, 'x', d.i), w[0] + min); }
    else { if (d.end === 0) w[1] = Math.min(snapAxis(p.y, 'y', d.i), w[3] - min); else w[3] = Math.max(snapAxis(p.y, 'y', d.i), w[1] + min); }
  } else if (d.kind === 'wallDraw'){
    d.b = {x:snapAxis(p.x, 'x'), y:snapAxis(p.y, 'y')};
  } else if (d.kind === 'wallOpMove'){                                     // 每帧从拖动前的状态重放，避免累计误差
    const s0 = JSON.parse(d.before); state.plan = s0.plan; state.rooms = s0.rooms;
    const r = opRect(d.sel), h = r && (r[2] - r[0]) >= (r[3] - r[1]);
    if (r) d.applied = moveOpening(d.sel, h ? p.x - d.p0.x : p.y - d.p0.y);
  }
}
/** 正在画的墙（预览用） */
export function draftRect(d){
  if (!d || d.kind !== 'wallDraw') return null;
  const t = partOf(wallOpts.part).thick, {a, b} = d, h = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  return h ? [Math.min(a.x, b.x), a.y - t/2, Math.max(a.x, b.x), a.y + t/2] : [a.x - t/2, Math.min(a.y, b.y), a.x + t/2, Math.max(a.y, b.y)];
}

export function wallEnd(d, cancel, select){
  if (cancel){ if (d.moved) restore(d.before); return true; }
  if (d.kind === 'wallDraw'){
    const r = draftRect(d);
    const dh = Math.abs(d.b.x - d.a.x) >= Math.abs(d.b.y - d.a.y), L = dh ? Math.abs(d.b.x - d.a.x) : Math.abs(d.b.y - d.a.y);
    if (!r || !d.moved || L < 200) return false;                      // 只按沿线长度判断（不能把厚度算进去），单击不放置
    const kind = wallOpts.part, sel = placePartition(kind, r, cutOpening);
    let split = null;
    if (P().auto) afterEdit(); else if (partOf(kind).split) split = splitRoomsBy(r.map(r10));
    if (kind !== 'wall') recordPartition(kind, r.map(r10), split);       // 登记为一道隔断：之后可整体删除
    select(sel); commit(d.before); return true;
  }
  if (!d.moved) return false;
  afterEdit(); commit(d.before); return true;
}
function restore(json){ const s = JSON.parse(json); state.plan = s.plan; state.rooms = s.rooms; }

/* ---------- 删除 / 开洞 / 翻转 ---------- */
export function removeWall(i){
  P().walls.splice(i, 1); remapDemolished('wall', i);
}
export function deleteArch(sel){
  const pl = P(), part = partitionOf(sel);
  if (part){ deletePartition(part, remapDemolished); afterEdit(); return; }
  if (sel.kind === 'wall') removeWall(sel.i);
  else if (sel.kind === 'win'){ pl.wins.splice(sel.i, 1); remapDemolished('win', sel.i); }
  else if (sel.kind === 'door'){ pl.doors.splice(sel.i, 1); remapDemolished('door', sel.i); }
  else if (sel.kind === 'slide'){ pl.slides.splice(sel.i, 1); remapDemolished('slide', sel.i); }
  else if (sel.kind === 'curtain') pl.curtains.splice(sel.i, 1);
  else if (sel.kind === 'slat') pl.slats.splice(sel.i, 1);
  afterEdit();
}
/** 在墙上开洞：kind = 'door' 平开门 | 'arch' 拱形门洞 | 'slide' 推拉门 | 'win' 窗；at = 点击位置（缺省为墙中段） */
export function cutOpening(i, kind, len, at = null){
  const pl = P(), w = pl.walls[i]; if (!w || isArc(w)) return false;
  if (state.demolished.includes('w' + i)) return false;
  const h = isH(w), L = h ? w[2] - w[0] : w[3] - w[1], th = h ? w[3] - w[1] : w[2] - w[0], lo = h ? w[0] : w[1], hi = h ? w[2] : w[3];
  len = Math.min(len, L - 2*Math.min(th, 120)); if (len < 300) return false;
  const want = at ? (h ? at.x : at.y) : (lo + hi)/2, m = Math.min(th, 120);
  const c = r10(Math.max(lo + m + len/2, Math.min(hi - m - len/2, want))), g0 = c - len/2, g1 = c + len/2;
  const rect = h ? [g0, w[1], g1, w[3]] : [w[0], g0, w[2], g1];
  const a = h ? [w[0], w[1], g0, w[3], w[4]] : [w[0], w[1], w[2], g0, w[4]], b = h ? [g1, w[1], w[2], w[3], w[4]] : [w[0], g1, w[2], w[3], w[4]];
  pl.walls[i] = a; pl.walls.push(b);
  if (kind === 'win') pl.wins.push([...rect, .9]);
  else if (kind === 'slide') pl.slides.push({rect, v:!h});
  else pl.doors.push({name:kind === 'arch' ? '拱形门洞' : '门', rect, h:h ? [g0, rect[3]] : [rect[2], g0], c:h ? [1, 0] : [0, 1], o:h ? [0, 1] : [1, 0], len, ...(kind === 'arch' ? {style:'arch'} : {})});
  afterEdit(); return true;
}
/** 门的 4 种开法循环：铰点在两端 × 朝两侧开 */
export function flipDoor(i){
  const d = P().doors[i]; if (!d) return;
  const [x0, y0, x1, y1] = d.rect, h = (x1 - x0) >= (y1 - y0);
  const st = h ? [d.c[0] > 0, d.o[1] > 0] : [d.c[1] > 0, d.o[0] > 0];
  const k = ((st[0] ? 0 : 2) + (st[1] ? 0 : 1) + 1) % 4, fromStart = k < 2, pos = k % 2 === 0;
  const g = fromStart ? (h ? x0 : y0) : (h ? x1 : y1), t = pos ? (h ? y1 : x1) : (h ? y0 : x0), dir = fromStart ? 1 : -1, side = pos ? 1 : -1;
  d.h = h ? [g, t] : [t, g]; d.c = h ? [dir, 0] : [0, dir]; d.o = h ? [0, side] : [side, 0];
}

/* ---------- 门窗沿墙平移 ---------- */
const opRect = (sel, pl = P()) => sel.kind === 'door' ? pl.doors[sel.i]?.rect : sel.kind === 'win' ? pl.wins[sel.i] : sel.kind === 'slide' ? pl.slides[sel.i]?.rect : null;
/** 找出与洞口同一直线、首尾相接的元素（墙 / 窗 / 门 / 推拉门的矩形），用于平移时伸缩补齐 */
function neighbors(sel, r, h){
  const pl = P(), t0 = h ? r[1] : r[0], t1 = h ? r[3] : r[2], g0 = h ? r[0] : r[1], g1 = h ? r[2] : r[3], tol = 15;
  const all = [...pl.walls.map((w, i) => ({k:'wall', i, r:w})), ...pl.wins.map((w, i) => ({k:'win', i, r:w})), ...pl.doors.map((d, i) => ({k:'door', i, r:d.rect})), ...pl.slides.map((d, i) => ({k:'slide', i, r:d.rect}))]
    .filter(o => !(o.k === sel.kind && o.i === sel.i) && !(o.k === 'wall' && o.r[5]) && ((h ? o.r[1] : o.r[0]) < t1 - 5 && (h ? o.r[3] : o.r[2]) > t0 + 5));
  const at = (v, end) => all.find(o => Math.abs((end ? (h ? o.r[2] : o.r[3]) : (h ? o.r[0] : o.r[1])) - v) < tol && ((o.r[2] - o.r[0]) >= (o.r[3] - o.r[1])) === h);                    // 与洞口同方向
  return {before:at(g0, true), after:at(g1, false)};
}
/** 把门 / 窗 / 推拉门沿墙平移 delta（mm）；两侧必须都有相接的墙段才能移动 */
export function moveOpening(sel, delta){
  const r = opRect(sel); if (!r) return 0;
  const h = (r[2] - r[0]) >= (r[3] - r[1]), {before, after} = neighbors(sel, r, h);
  if (!before || !after) return 0;
  const lenOf = o => h ? o.r[2] - o.r[0] : o.r[3] - o.r[1], min = 100;
  delta = r10(Math.max(-(lenOf(before) - min), Math.min(lenOf(after) - min, delta)));
  if (!delta) return 0;
  const a = h ? 0 : 1;
  r[a] += delta; r[a + 2] += delta; before.r[a + 2] += delta; after.r[a] += delta;
  if (sel.kind === 'door'){ const d = P().doors[sel.i]; d.h[a] += delta; }
  return delta;
}
/** 洞口在一端靠墙、另一端接着另一个洞口（如「单开门 + 上窗下柜」）时：两者对调位置 */
export function swapOpening(sel){
  const r = opRect(sel); if (!r) return false;
  const h = (r[2] - r[0]) >= (r[3] - r[1]), {before, after} = neighbors(sel, r, h), o = after && after.k !== 'wall' ? after : before && before.k !== 'wall' ? before : null;
  if (!o) return false;
  const a = h ? 0 : 1, L1 = r[a + 2] - r[a], L2 = o.r[a + 2] - o.r[a], s0 = Math.min(r[a], o.r[a]);
  const first = r[a] < o.r[a];                                         // 当前洞口在前 → 换到后面
  if (first){ o.r[a] = s0; o.r[a + 2] = s0 + L2; r[a] = s0 + L2; r[a + 2] = s0 + L2 + L1; }
  else { r[a] = s0; r[a + 2] = s0 + L1; o.r[a] = s0 + L1; o.r[a + 2] = s0 + L1 + L2; }
  if (sel.kind === 'door'){ const d = P().doors[sel.i]; d.h[a] = d.c[a] > 0 ? r[a] : r[a + 2]; }   // 铰点跟随门洞
  return true;
}

/* ---------- 房间重算（按重叠继承名称 / 材料） ---------- */
export function afterEdit(){ if (P().auto) recomputeRooms(); }
export function recomputeRooms(){
  const pl = P(), dem = new Set(state.demolished);
  const rects = [...pl.walls.filter((w, i) => !dem.has('w' + i) && w[4] !== 'low').flatMap(wallRects), ...pl.wins.filter((w, i) => !dem.has('n' + i)).map(w => w.slice(0, 4)),
                 ...pl.doors.filter((d, i) => !dem.has('d' + i)).map(d => d.rect), ...pl.slides.filter((s, i) => !dem.has('s' + i)).map(s => s.rect), ...(pl.lintels || []).map(l => l[0]), ...(pl.seals || [])];
  const {rooms} = extractRooms(rects, {eps:1});
  const old = pl.rooms, taken = new Set(), out = [];
  let n = old.reduce((m, r) => Math.max(m, +String(r.id).replace(/\D/g, '') || 0), 0);
  for (const r of rooms.filter(r => r.area >= 1.5e6 && Math.min(r.bbox[2] - r.bbox[0], r.bbox[3] - r.bbox[1]) >= 600).sort((a, b) => b.area - a.area)){
    const [x0, y0, x1, y1] = r.bbox, votes = new Map();
    for (let gy = 0; gy < 12; gy++) for (let gx = 0; gx < 12; gx++){
      const pt = [x0 + (x1 - x0)*(gx + .5)/12, y0 + (y1 - y0)*(gy + .5)/12];
      if (!pointInPoly(pt, r.poly)) continue;
      const o = old.find(o => pointInPoly(pt, o.poly)); if (o) votes.set(o, (votes.get(o) || 0) + 1);
    }
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).find(o => !taken.has(o.id));
    const poly = r.poly.map(([x, y]) => [Math.round(x), Math.round(y)]), at = r.at.map(Math.round);
    if (best){
      taken.add(best.id);
      out.push({...best, poly, at, counted:Math.min(x1 - x0, y1 - y0) < 700 ? false : best.counted});
    } else {
      const id = 'r' + (++n), name = tr('房间', 'Room') + n;
      out.push({id, name, poly, at, mat:'tile800'}); state.rooms[id] = {name, mat:'tile800', wall:'paint_white'};
    }
  }
  pl.rooms = out; pl.auto = true;
  if (ui.sel?.kind === 'room' && !out.some(r => r.id === ui.sel.id)) ui.sel = null;
}

/* ---------- 面板 ---------- */
// 门窗沿墙平移：拖动 / 输入偏移 / ◀ ▶ 微调 / 与相邻洞口对调
const moveRow = () => `<div class="move-row"><span class="pop-label">${tr('沿墙位置', 'Position along wall')}</span>
  <div class="grp"><button class="btn" data-w="mvL" title="-100mm">◀</button><input type="number" id="oMove" value="0" step="50" title="${tr('输入偏移量（mm），回车生效', 'Offset in mm, press Enter')}"><button class="btn" data-w="mvR" title="+100mm">▶</button></div>
  <button class="btn sm" data-w="swap">${tr('换到另一端', 'Swap ends')}</button>
  <div class="muted" style="font-size:11.5px">${tr('也可以在墙体工具下直接按住拖动；两侧墙段会自动伸缩。', 'Or just drag it with the Walls tool; adjacent wall pieces stretch to fit.')}</div></div>`;
// 从三维里点到某面墙面时，面板里多一块「这面墙的材质」
const faceSection = f => {
  const r = P().rooms.find(r => r.id === f.room), e = r && roomEdges(r).find(e => e.key === f.key); if (!e) return '';
  const cur = state.rooms[f.room]?.faces?.[f.key] || '';
  return `<div class="face-pick"><div class="pop-label">${tr(`${state.rooms[f.room].name} · ${e.dir}墙面`, `${state.rooms[f.room].name} · ${e.dir} face`)}</div>
    <select id="faceMat"><option value="">${tr('跟随房间', 'Room default')}（${nm(WALL_MATS[state.rooms[f.room].wall]?.name || '')}）</option>${Object.entries(WALL_MATS).map(([k, m]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${nm(m.name)}</option>`).join('')}</select></div>`;
};
export const WALL_TYPES = () => ({e:tr('外墙', 'Exterior'), b:tr('承重墙', 'Load-bearing'), n:tr('非承重墙', 'Partition'), low:tr('矮墙', 'Low wall')});
export function archPanel(sel, esc){
  const part = partitionOf(sel);
  return (part ? `<section class="part-box"><h3>${tr('隔断', 'Partition')} <small>${partOf(part.kind).name}</small></h3>
    <div class="muted" style="font-size:12px">${tr('这是一道隔断的一部分。删除会移除整道隔断，并把被它分开的房间合回去。', 'This belongs to a partition. Deleting removes the whole partition and merges the rooms back.')}</div>
    <div class="actions"><button class="btn danger" data-w="delpart">${tr('删除整个隔断', 'Delete whole partition')}</button></div></section>` : '') + archPanelBody(sel, esc);
}
function archPanelBody(sel, esc){
  const pl = P();
  if (sel.kind === 'wall'){
    const w = pl.walls[sel.i], dem = state.demolished.includes('w' + sel.i), arc = isArc(w), h = isH(w), L = h ? w[2] - w[0] : w[3] - w[1], th = h ? w[3] - w[1] : w[2] - w[0];
    return `<section><h3>${tr('墙体', 'Wall')} <small>#${sel.i + 1}</small></h3>
      <div class="form">
        <label class="full">${tr('类型', 'Type')}<select id="wType">${Object.entries(WALL_TYPES()).map(([k, v]) => `<option value="${k}" ${k === w[4] ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label>${tr('长度', 'Length')} (mm)<input type="number" id="wLen" value="${L}" min="100" step="10"></label>
        <label>${tr('厚度', 'Thickness')} (mm)<input type="number" id="wTh" value="${th}" min="50" step="10"></label>
        <label>${h ? 'Y' : 'X'} (mm)<input type="number" id="wPos" value="${h ? w[1] : w[0]}" step="10"></label>
        <label>${h ? tr('起点 X', 'Start X') : tr('起点 Y', 'Start Y')} (mm)<input type="number" id="wStart" value="${h ? w[0] : w[1]}" step="10"></label>
        <label class="full">${tr('弧形：拱高（0 = 直墙，正负决定弯向）', 'Arc bulge (0 = straight; sign = direction)')} (mm)<input type="number" id="wBulge" value="${w[5] || 0}" step="50"></label>
      </div>
      <div class="muted" style="margin:6px 0 0;font-size:11.5px">${sel.at && !arc ? tr('门窗会开在你点击的位置附近。', 'Openings are cut near where you clicked.') : arc ? tr('弧形墙上暂不支持开门窗。', 'Openings are not supported on arc walls.') : ''}</div>
      ${sel.face ? faceSection(sel.face) : ''}
      <div class="actions">
        ${arc ? '' : `<button class="btn" data-w="door">${tr('平开门 900', 'Door 900')}</button><button class="btn" data-w="arch">${tr('拱形门洞 1200', 'Arch 1200')}</button>
        <button class="btn" data-w="slide">${tr('推拉门 1800', 'Sliding 1800')}</button><button class="btn" data-w="win">${tr('窗 1500', 'Window 1500')}</button>`}
        <button class="btn ${dem ? '' : 'danger'}" data-w="dem">${dem ? tr('恢复墙体', 'Restore wall') : tr('标记拆除', 'Mark for demolition')}</button>
        <button class="btn danger" data-w="del">${tr('删除墙体', 'Delete wall')}</button>
      </div>
      <div class="muted" style="margin-top:8px;font-size:11.5px">${dem ? tr('已标记拆除：平面图显示为虚线，3D 中不显示，计入拆除长度。', 'Marked for demolition: dashed in plan, hidden in 3D, counted in demolition length.')
        : tr('「标记拆除」用于改造方案（可恢复）；「删除」用于修正识别错误。承重墙 / 外墙不可拆。', '“Mark for demolition” is for renovation (restorable); “Delete” fixes recognition errors. Bearing / exterior walls cannot be demolished.')}
      </div></section>
      ${roomsSection()}`;
  }
  if (sel.kind === 'win'){
    const r = pl.wins[sel.i], h = (r[2] - r[0]) >= (r[3] - r[1]);
    return `<section><h3>${tr('窗', 'Window')}</h3><div class="form">
        <label>${tr('宽度', 'Width')} (mm)<input type="number" id="oLen" value="${h ? r[2] - r[0] : r[3] - r[1]}" min="300" step="10"></label>
        <label>${tr('窗台高', 'Sill')} (m)<input type="number" id="oSill" value="${r[4] ?? .9}" min="0" max="2" step=".05"></label></div>
      ${moveRow()}
      <div class="actions"><button class="btn danger" data-w="del">${tr('删除窗', 'Delete window')}</button></div></section>${roomsSection()}`;
  }
  if (sel.kind === 'door'){
    const d = pl.doors[sel.i];
    return `<section><h3>${tr('门', 'Door')} <small>${esc(nm(d.name || ''))}</small></h3><div class="form">
        <label class="full">${tr('门宽', 'Width')} (mm)<input type="number" id="oLen" value="${d.len}" min="500" step="10"></label></div>
      ${moveRow()}
      <div class="actions">${d.style === 'arch' ? '' : `<button class="btn" data-w="flip">${tr('翻转开向', 'Flip swing')}</button>`}
        <button class="btn" data-w="archtoggle">${d.style === 'arch' ? tr('改回平开门', 'Make swing door') : tr('改成拱形门洞', 'Make archway')}</button>
        <label class="imp-check"><input type="checkbox" id="oEntry" ${d.entry ? 'checked' : ''}> ${tr('入户门', 'Front door')}</label>
        <button class="btn danger" data-w="del">${tr('删除门', 'Delete door')}</button></div></section>${roomsSection()}`;
  }
  if (['slide', 'curtain', 'slat'].includes(sel.kind)){
    const label = {slide:tr('推拉门', 'Sliding door'), curtain:tr('帘子', 'Curtain'), slat:tr('木格栅', 'Slat screen')}[sel.kind];
    const it = sel.kind === 'slide' ? pl.slides[sel.i] : sel.kind === 'curtain' ? pl.curtains[sel.i] : pl.slats[sel.i]; if (!it) return '';
    const [x0, y0, x1, y1] = it.rect, L = Math.max(x1 - x0, y1 - y0);
    return `<section><h3>${label} <small>${L} mm</small></h3>
      ${sel.kind === 'slide' ? moveRow() : ''}
      ${it.color ? `<div class="form"><label class="full">${tr('颜色', 'Color')}<input type="color" id="oColor" value="${it.color}"></label></div>` : ''}
      <div class="muted" style="font-size:12px;margin-top:6px">${sel.kind === 'curtain' ? tr('3D 中点击帘子可拉开 / 合上。', 'Click the curtain in 3D to open / close it.') : sel.kind === 'slide' ? tr('3D 中点击门扇可开关。', 'Click a panel in 3D to slide it.') : tr('木格栅透光不封闭，不会拆分房间。', 'Slat screens let light through and do not split rooms.')}</div>
      <div class="actions"><button class="btn danger" data-w="del">${tr('删除', 'Delete')}</button></div></section>`;
  }
  return '';
}
const roomsSection = () => `<section class="muted" style="font-size:12px">${P().auto
  ? tr('修改墙体 / 门窗后房间会自动重算，名称和地面材料按位置继承。', 'Rooms are recomputed after each edit; names and flooring are kept by position.')
  : tr('默认户型的房间是手工划分的，改墙后不会自动重算。', 'Rooms of the default plan are hand-drawn and are not recomputed automatically.')}
  <div class="actions"><button class="btn" data-w="rooms">${tr('按墙体重算房间', 'Recompute rooms')}</button></div></section>`;

export function bindArchPanel(sel, mutate, select){
  const $p = s => document.querySelector('#panel ' + s);
  const upd = fn => mutate(() => { fn(); afterEdit(); });
  const num = (id, fn) => { const el = $p(id); if (el) el.onchange = e => { const v = parseFloat(e.target.value); if (!isNaN(v)) upd(() => fn(v)); }; };
  const pl = P();
  if (sel.kind === 'wall'){
    const w = () => pl.walls[sel.i];
    $p('#wType').onchange = e => mutate(() => { w()[4] = e.target.value; });
    num('#wLen', v => { const x = w(); v = Math.max(100, r10(v)); if (isH(x)) x[2] = x[0] + v; else x[3] = x[1] + v; });
    num('#wTh', v => { const x = w(); v = Math.max(50, r10(v)); if (isH(x)){ const c = (x[1] + x[3])/2; x[1] = r10(c - v/2); x[3] = x[1] + v; } else { const c = (x[0] + x[2])/2; x[0] = r10(c - v/2); x[2] = x[0] + v; } });
    num('#wPos', v => { const x = w(); v = r10(v); if (isH(x)){ const t = x[3] - x[1]; x[1] = v; x[3] = v + t; } else { const t = x[2] - x[0]; x[0] = v; x[2] = v + t; } });
    num('#wBulge', v => { const x = w(); if (Math.abs(v) < 10) x.length = 5; else { const L = isH(x) ? x[2] - x[0] : x[3] - x[1]; x[5] = Math.max(-L/2, Math.min(L/2, r10(v))); } });
    const fm = $p('#faceMat'); if (fm) fm.onchange = () => mutate(() => { const st = state.rooms[sel.face.room], f = st.faces ||= {}; if (fm.value) f[sel.face.key] = fm.value; else delete f[sel.face.key]; });
    num('#wStart', v => { const x = w(); v = r10(v); if (isH(x)){ const L = x[2] - x[0]; x[0] = v; x[2] = v + L; } else { const L = x[3] - x[1]; x[1] = v; x[3] = v + L; } });
  }
  if (sel.kind === 'win'){
    const r = () => pl.wins[sel.i];
    num('#oLen', v => { const x = r(), h = (x[2] - x[0]) >= (x[3] - x[1]), c = h ? (x[0] + x[2])/2 : (x[1] + x[3])/2; v = Math.max(300, r10(v)); if (h){ x[0] = r10(c - v/2); x[2] = x[0] + v; } else { x[1] = r10(c - v/2); x[3] = x[1] + v; } });
    num('#oSill', v => { r()[4] = Math.max(0, Math.min(2, v)); });
  }
  if (sel.kind === 'door'){
    const d = () => pl.doors[sel.i];
    num('#oLen', v => { d().len = Math.max(500, r10(v)); });
    const en = $p('#oEntry'); if (en) en.onchange = e => mutate(() => { pl.doors.forEach((x, k) => x.entry = k === sel.i && e.target.checked); });
  }
  const mv = $p('#oMove'); if (mv) mv.onchange = () => { const v = +mv.value; if (!v) return; let m = 0; mutate(() => { m = moveOpening(sel, v); afterEdit(); }); if (!m) toast(tr('移动不了：两侧需要有可伸缩的墙段', 'Cannot move: needs wall pieces on both sides')); };
  const oc = $p('#oColor'); if (oc) oc.onchange = () => mutate(() => { const it = sel.kind === 'curtain' ? pl.curtains[sel.i] : pl.slats[sel.i]; if (it) it.color = oc.value; });
  document.querySelectorAll('#panel [data-w]').forEach(b => b.onclick = () => {
    const a = b.dataset.w;
    if (a === 'del' || a === 'delpart'){ const s = sel, part = partitionOf(s); select(null); mutate(() => deleteArch(s)); if (part) toast(tr(`已删除隔断「${partOf(part.kind).name}」，房间已合并`, 'Partition removed, rooms merged')); }
    else if (['door', 'win', 'arch', 'slide'].includes(a)){
      if (pl.walls[sel.i]?.[4] === 'b') return toast(tr('承重墙不能开洞（黑色）', 'Load-bearing walls cannot be cut'));
      let ok = false; mutate(() => { ok = cutOpening(sel.i, a, {door:900, win:1500, arch:1200, slide:1800}[a], sel.at); });
      if (!ok) toast(tr('这面墙太短，开不下', 'This wall is too short for that opening'));
    }
    else if (a === 'archtoggle') mutate(() => { const d = pl.doors[sel.i]; if (d.style === 'arch') delete d.style; else d.style = 'arch'; });
    else if (a === 'flip') mutate(() => flipDoor(sel.i));
    else if (a === 'mvL' || a === 'mvR'){ let m = 0; mutate(() => { m = moveOpening(sel, a === 'mvL' ? -100 : 100); afterEdit(); }); if (!m) toast(tr('这一侧没有可伸缩的墙段了', 'No wall left to stretch on that side')); }
    else if (a === 'swap'){ let ok = false; mutate(() => { ok = swapOpening(sel); afterEdit(); }); if (!ok) toast(tr('两侧都是墙，直接拖动或用 ◀ ▶ 调整位置', 'Both sides are walls — drag or use ◀ ▶ instead')); }
    else if (a === 'dem') toggleWall('w' + sel.i);
    else if (a === 'rooms') mutate(() => recomputeRooms());
  });
}
