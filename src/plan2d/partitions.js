/* =====================================================================
 *  隔断：在房间里拖一条线放置。
 *  由已有的建筑元素组合而成（墙 / 门 / 推拉门 / 窗），另有两种软隔断：帘子、木格栅。
 *  「实体」隔断会把所在房间一分为二（原房间保留名称与材质）。
 * ===================================================================== */
import {tr} from '../i18n.js';
import {state, P} from '../store.js';
import {extractRooms, pointInPoly, unionOutline} from '../import/rooms.js';

/** 隔断类型：key / 名称 / 厚度 mm / 是否分隔房间 / 2D 预览色 */
export const PARTS = () => [
  {key:'wall',     name:tr('普通墙', 'Wall'),                     thick:120, split:true,  color:'#a3adbb'},
  {key:'walldoor', name:tr('墙 + 门', 'Wall + door'),             thick:100, split:true,  color:'#a3adbb'},
  {key:'slide',    name:tr('推拉门隔断', 'Sliding doors'),          thick:100, split:true,  color:'#9cc3e6'},
  {key:'glass',    name:tr('玻璃隔断', 'Glass partition'),          thick:80,  split:true,  color:'#9cc3e6'},
  {key:'combo',    name:tr('门 + 上窗下柜', 'Door + glass over cabinet'), thick:350, split:true, color:'#d8c4a6'},
  {key:'lowwall',  name:tr('半高墙', 'Half-height wall'),         thick:120, split:false, color:'#dfe4eb'},
  {key:'curtain',  name:tr('帘子', 'Curtain'),                   thick:80,  split:false, color:'#d9cbb8'},
  {key:'slats',    name:tr('木格栅', 'Wood slat screen'),          thick:60,  split:false, color:'#b08458'},
];
export const partOf = key => PARTS().find(p => p.key === key) || PARTS()[0];

const r10 = v => Math.round(v/10)*10;

/** 放置隔断（rect 为沿线的矩形，mm）；cut(i, kind, len, at) 由墙体工具传入 */
export function placePartition(kind, r, cut){
  const pl = P(), h = (r[2] - r[0]) >= (r[3] - r[1]), L = h ? r[2] - r[0] : r[3] - r[1];
  r = r.map(r10);
  let sel = null;
  if (kind === 'wall' || kind === 'lowwall'){ pl.walls.push([...r, kind === 'lowwall' ? 'low' : 'n']); sel = {kind:'wall', i:pl.walls.length - 1}; }
  else if (kind === 'walldoor'){ pl.walls.push([...r, 'n']); cut(pl.walls.length - 1, 'door', Math.min(900, L - 240)); sel = {kind:'door', i:pl.doors.length - 1}; }
  else if (kind === 'slide'){ pl.slides.push({rect:r, v:!h}); }
  else if (kind === 'glass'){ pl.wins.push([...r, .02, {full:true}]); sel = {kind:'win', i:pl.wins.length - 1}; }
  else if (kind === 'combo'){                                          // 起点一侧是门，其余是「下柜 + 上玻璃」
    const dw = Math.min(900, L*.45), g = h ? r[0] + dw : r[1] + dw;
    const dr = h ? [r[0], r[1], g, r[3]] : [r[0], r[1], r[2], g], rest = h ? [g, r[1], r[2], r[3]] : [r[0], g, r[2], r[3]];
    pl.doors.push({name:'门', rect:dr, h:h ? [r[0], r[3]] : [r[2], r[1]], c:h ? [1, 0] : [0, 1], o:h ? [0, 1] : [1, 0], len:dw});
    pl.wins.push([...rest, .9, {low:'cabinet', head:'ceil'}]); sel = {kind:'win', i:pl.wins.length - 1};
  }
  else if (kind === 'curtain'){ (pl.curtains ||= []).push({rect:r, color:'#d9cbb8'}); sel = {kind:'curtain', i:pl.curtains.length - 1}; }
  else if (kind === 'slats'){ (pl.slats ||= []).push({rect:r, color:'#b08458'}); sel = {kind:'slat', i:pl.slats.length - 1}; }
  return sel;
}

/** 把被隔断线贯穿的房间一分为二：较大一块保留原 id / 名称 / 材质，其余为「原名 2」 */
export function splitRoomsBy(r){
  const pl = P(), out = [], log = [];
  let n = 0;
  for (const room of pl.rooms){
    const c = [(r[0] + r[2])/2, (r[1] + r[3])/2];
    if (room.counted === false || !pointInPoly(c, room.poly)){ out.push(room); continue; }
    // 房间轮廓的每条边 → 2mm 的细阻挡条，再加上隔断本身，求被围出的区域
    const edges = room.poly.map((p, i) => { const q = room.poly[(i + 1) % room.poly.length]; return [Math.min(p[0], q[0]) - 1, Math.min(p[1], q[1]) - 1, Math.max(p[0], q[0]) + 1, Math.max(p[1], q[1]) + 1]; });
    const pieces = extractRooms([...edges, r], {eps:.5}).rooms.filter(x => x.area >= 1.2e6).sort((a, b) => b.area - a.area);
    if (pieces.length < 2){ out.push(room); continue; }
    const st = state.rooms[room.id], rec = {id:room.id, poly:room.poly, at:room.at, added:[]}; log.push(rec);
    pieces.forEach((pc, k) => {
      const poly = pc.poly.map(p => p.map(Math.round)), at = pc.at.map(Math.round);
      if (!k){ out.push({...room, poly, at}); return; }
      const id = room.id + '_' + Date.now().toString(36) + (++n), name = (st?.name || room.name) + (k + 1);
      out.push({id, name, poly, at, mat:room.mat}); state.rooms[id] = {name, mat:st?.mat || room.mat, wall:st?.wall || 'paint_white'}; rec.added.push(id);
    });
  }
  pl.rooms = out;
  return log;
}

/** 素材面板里的隔断卡片缩略图（简笔） */
export function partIcon(key){
  const S = 'stroke="#334155" stroke-width="2" fill="none"';
  const g = {
    wall:     `<rect x="6" y="24" width="68" height="8" fill="#a3adbb"/>`,
    walldoor: `<rect x="6" y="24" width="22" height="8" fill="#a3adbb"/><rect x="52" y="24" width="22" height="8" fill="#a3adbb"/><path d="M28 32V10" ${S}/><path d="M28 10A22 22 0 0 1 50 32" ${S} stroke-dasharray="3 2"/>`,
    slide:    `<rect x="6" y="22" width="40" height="5" fill="#fff" ${S}/><rect x="34" y="29" width="40" height="5" fill="#fff" ${S}/>`,
    glass:    `<rect x="6" y="24" width="68" height="8" fill="#eef6ff" stroke="#2f7fe0" stroke-width="2"/><path d="M6 28H74" stroke="#2f7fe0" stroke-width="1.5"/>`,
    combo:    `<rect x="30" y="18" width="44" height="20" fill="#d8c4a6" ${S}/><path d="M30 28H74" stroke="#2f7fe0" stroke-width="2"/><path d="M6 38V16" ${S}/><path d="M6 16A22 22 0 0 1 28 38" ${S} stroke-dasharray="3 2"/>`,
    lowwall:  `<rect x="6" y="24" width="68" height="8" fill="#dfe4eb" ${S}/>`,
    curtain:  `<path d="M6 28Q11 20 16 28T26 28T36 28T46 28T56 28T66 28T76 28" stroke="#b5946a" stroke-width="3" fill="none"/>`,
    slats:    Array.from({length:9}, (_, i) => `<rect x="${7 + i*7.6}" y="22" width="4" height="12" fill="#b08458"/>`).join(''),
  }[key] || '';
  return `<svg viewBox="0 0 80 56"><rect width="80" height="56" rx="6" fill="#e6ebf1"/>${g}</svg>`;
}

/* ---------- 隔断记录 / 整体删除 ---------- */
/** 放置后登记：类型、范围、拆分了哪些房间（删除时用来把房间合回去） */
export function recordPartition(kind, rect, split){
  (P().partitions ||= []).push({pid:'p' + Date.now().toString(36), kind, rect:rect.map(Math.round), split:split || []});
}
const inside = (r, R, tol = 20) => r[0] >= R[0] - tol && r[1] >= R[1] - tol && r[2] <= R[2] + tol && r[3] <= R[3] + tol;
const rectOf = (pl, sel) => ({wall:pl.walls[sel.i], win:pl.wins[sel.i], door:pl.doors[sel.i]?.rect, slide:pl.slides[sel.i]?.rect, curtain:pl.curtains?.[sel.i]?.rect, slat:pl.slats?.[sel.i]?.rect})[sel.kind];
/** 选中的元素属于哪道隔断 */
export function partitionOf(sel){
  const pl = P(), r = sel && rectOf(pl, sel); if (!r) return null;
  return (pl.partitions || []).find(p => inside(r, p.rect)) || null;
}
/** 删除整道隔断：移除范围内的全部元素，并把被它拆开的房间合回原样 */
export function deletePartition(part, remap){
  const pl = P(), R = part.rect;
  const drop = (arr, kind, get) => { for (let i = arr.length - 1; i >= 0; i--) if (inside(get(arr[i]), R)){ arr.splice(i, 1); remap?.(kind, i); } };
  drop(pl.walls, 'wall', w => w); drop(pl.wins, 'win', w => w); drop(pl.doors, 'door', d => d.rect); drop(pl.slides, 'slide', s => s.rect);
  if (pl.curtains) drop(pl.curtains, 'curtain', c => c.rect);
  if (pl.slats) drop(pl.slats, 'slat', c => c.rect);
  for (const rec of part.split || []){
    const room = pl.rooms.find(x => x.id === rec.id);
    if (room){ room.poly = rec.poly; room.at = rec.at; }
    pl.rooms = pl.rooms.filter(x => !rec.added.includes(x.id)); rec.added.forEach(id => delete state.rooms[id]);
  }
  pl.partitions = pl.partitions.filter(p => p !== part);
}

/* ---------- 合并相邻房间（两个房间共用一条边） ---------- */
const edgesOf = poly => poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return p[0] === q[0] ? {v:true, c:p[0], a:Math.min(p[1], q[1]), b:Math.max(p[1], q[1])} : {v:false, c:p[1], a:Math.min(p[0], q[0]), b:Math.max(p[0], q[0])}; });
/** 两个房间之间「相对的边」：平行、相对、间距 ≤ 400mm（中间可能隔着一道墙 / 隔断）→ [{len, bridge}] */
export function facing(A, B){
  const out = [];
  for (const e of edgesOf(A.poly)) for (const f of edgesOf(B.poly)){
    if (e.v !== f.v || Math.abs(e.c - f.c) > 400) continue;
    const a = Math.max(e.a, f.a), b = Math.min(e.b, f.b); if (b - a < 1) continue;
    const c0 = Math.min(e.c, f.c), c1 = Math.max(e.c, f.c), bridge = e.v ? [c0, a, c1, b] : [a, c0, b, c1];
    // 中间还隔着未拆除的墙 → 不算相邻（只有隔断删掉 / 墙拆掉后才能合并）
    const blocked = P().walls.some((w, k) => !state.demolished.includes('w' + k) && w[4] !== 'low' && Math.min(w[2], bridge[2]) - Math.max(w[0], bridge[0]) > 5 && Math.min(w[3], bridge[3]) - Math.max(w[1], bridge[1]) > 5);
    if (!blocked) out.push({len:b - a, bridge});
  }
  return out;
}
/** 两个房间相邻的长度（mm） */
export const sharedLen = (A, B) => facing(A, B).reduce((s, f) => s + f.len, 0);
/** 把房间 B 并入 A：两者轮廓 + 中间的缝（原墙 / 隔断位置）合成一个轮廓 */
export function mergeRooms(aId, bId){
  const pl = P(), A = pl.rooms.find(r => r.id === aId), B = pl.rooms.find(r => r.id === bId); if (!A || !B) return false;
  const F = facing(A, B); if (!F.length) return false;
  const poly = unionOutline([A.poly, B.poly], F.map(f => f.bridge)); if (poly.length < 4) return false;
  A.poly = poly.map(p => p.map(Math.round));
  const bb = A.poly.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const c = [Math.round((bb[0] + bb[2])/2), Math.round((bb[1] + bb[3])/2)];
  A.at = pointInPoly(c, A.poly) ? c : A.at;
  pl.rooms = pl.rooms.filter(r => r !== B); delete state.rooms[bId];
  for (const p of pl.partitions || []) for (const rec of p.split || []) rec.added = rec.added.filter(id => id !== bId);
  return true;
}
