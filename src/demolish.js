/* =====================================================================
 *  拆除：标记拆除一面墙时，连同同一直线上首尾相接的整道墙（各墙段 + 中间的门 / 窗 / 推拉门）一起拆除。
 *  state.demolished 存元素编号：w = 墙、d = 门、n = 窗、s = 推拉门（如 'w12'、'd3'）
 *  承重墙 / 外墙是边界，不会被连带拆除。
 * ===================================================================== */
import {state, P} from './store.js';

export const PREFIX = {wall:'w', door:'d', win:'n', slide:'s'};
export const isDem = (kind, i) => state.demolished.includes(PREFIX[kind] + i);

const isH = r => (r[2] - r[0]) >= (r[3] - r[1]);
const lenOf = r => isH(r) ? r[2] - r[0] : r[3] - r[1];

/** 从墙 i 出发，沿直线收集整道墙：{items:[{kind, i, r}], len, doors, wins, slides} */
export function wallChain(i){
  const pl = P(), w0 = pl.walls[i]; if (!w0) return null;
  const h = isH(w0), tol = 15;
  const pool = [
    ...pl.walls.map((r, k) => ({kind:'wall', i:k, r})).filter(o => !o.r[5] && (o.r[4] === 'n' || o.r[4] === 'low')),
    ...pl.doors.map((d, k) => ({kind:'door', i:k, r:d.rect})),
    ...pl.wins.map((r, k) => ({kind:'win', i:k, r})),
    ...pl.slides.map((s, k) => ({kind:'slide', i:k, r:s.rect})),
  ].filter(o => isH(o.r) === h);
  const t = r => h ? [r[1], r[3]] : [r[0], r[2]], g = r => h ? [r[0], r[2]] : [r[1], r[3]];
  const sameBand = (a, b) => { const [a0, a1] = t(a), [b0, b1] = t(b); return Math.min(a1, b1) - Math.max(a0, b0) >= Math.min(a1 - a0, b1 - b0)*.5; };
  const touch = (a, b) => { const [a0, a1] = g(a), [b0, b1] = g(b); return Math.abs(a1 - b0) < tol || Math.abs(b1 - a0) < tol; };
  const start = pool.find(o => o.kind === 'wall' && o.i === i) || {kind:'wall', i, r:w0};
  const seen = new Set([start]), q = [start];
  while (q.length){
    const cur = q.shift();
    for (const o of pool) if (!seen.has(o) && sameBand(cur.r, o.r) && touch(cur.r, o.r)){ seen.add(o); q.push(o); }
  }
  const items = [...seen];
  return {items, len:items.reduce((a, o) => a + lenOf(o.r), 0), doors:items.filter(o => o.kind === 'door').length,
          wins:items.filter(o => o.kind === 'win').length, slides:items.filter(o => o.kind === 'slide').length};
}

/**
 * 拆除用的「一面墙」：从墙 i 出发沿直线收集，但遇到 T 形交接（别的墙垂直接到这条线上）就停 ——
 * 交接处是两面墙的分界。跨过交接点的墙段会在交接处切开（直接修改 plan，需在 mutate 中调用）。
 */
export function wallRun(i){
  const pl = P(), w0 = pl.walls[i]; if (!w0) return null;
  const h = isH(w0), a = h ? 0 : 1, b = h ? 1 : 0, tol = 15;
  const t0 = w0[b], t1 = w0[b + 2], s0 = w0[a], s1 = w0[a + 2];
  // 交接：方向垂直、贴着这条线两侧任一面的墙 → 沿线方向的区间
  const J = pl.walls.filter((w, k) => k !== i && !state.demolished.includes('w' + k) && isH(w) !== h && w[b + 2] >= t0 - tol && w[b] <= t1 + tol).map(w => [w[a], w[a + 2]]);
  const hi = Math.min(Infinity, ...J.filter(([j0]) => j0 >= s1 - tol).map(([j0]) => j0));
  const lo = Math.max(-Infinity, ...J.filter(([, j1]) => j1 <= s0 + tol).map(([, j1]) => j1));
  const ch = wallChain(i);
  const items = [];
  for (const o of ch.items){
    const g0 = o.r[a], g1 = o.r[a + 2];
    if (g1 <= lo + tol || g0 >= hi - tol){ if (!(o.kind === 'wall' && o.i === i)) continue; }
    if (o.kind === 'wall' && o.i !== i && (g0 < lo - tol || g1 > hi + tol)){         // 跨过交接点 → 在交接处切开
      const cut = g1 > hi + tol ? hi : lo, w = pl.walls[o.i];
      const near = [...w], far = [...w];
      if (cut === hi){ near[a + 2] = cut; far[a] = cut; } else { near[a] = cut; far[a + 2] = cut; }
      if (Math.abs(near[a + 2] - near[a]) < 50) continue;
      pl.walls[o.i] = near; pl.walls.push(far);
      items.push({kind:'wall', i:o.i, r:near}); continue;
    }
    items.push(o);
  }
  return {items, len:items.reduce((s, o) => s + lenOf(o.r), 0), doors:items.filter(o => o.kind === 'door').length,
          wins:items.filter(o => o.kind === 'win').length, slides:items.filter(o => o.kind === 'slide').length};
}

/** 拆除总长（m）：墙 + 门窗洞口 */
export function demolishedLength(){
  const pl = P(), get = id => ({w:pl.walls, d:pl.doors.map(d => d.rect), n:pl.wins, s:pl.slides.map(s => s.rect)})[id[0]]?.[+id.slice(1)];
  return state.demolished.reduce((a, id) => { const r = get(id); return a + (r ? lenOf(r) : 0); }, 0)/1000;
}

/** 删除元素后，把 state.demolished 里同类、编号在其后的项前移一位 */
export function remapDemolished(kind, i){
  const p = PREFIX[kind];
  state.demolished = state.demolished.filter(id => id !== p + i).map(id => { if (id[0] !== p) return id; const k = +id.slice(1); return k > i ? p + (k - 1) : id; });
}
