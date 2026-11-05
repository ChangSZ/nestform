/* =====================================================================
 *  墙面分面：每个房间轮廓的每条边 = 一面墙。
 *  - 只有「紧贴未拆除墙体」的边段才算墙面（门窗洞口、开放边自动跳过）
 *  - 每面墙可单独指定材质：state.rooms[id].faces[key]，未指定则跟随房间的 wall
 *  - key = 边中点坐标（取整到 10mm），房间轮廓不变时稳定
 *  2D 色带、3D 饰面、造价估算、拖放刷墙都基于这里
 * ===================================================================== */
import {tr} from './i18n.js';
import {state, P} from './store.js';
import {pointInPoly} from './import/rooms.js';

const r10 = v => Math.round(v/10)*10;
const inR = (r, x, y) => x > r[0] && x < r[2] && y > r[1] && y < r[3];

/** 方位角（度，0 = 北，顺时针）→ 东 / 南 / 西 / 北 */
export const bearingLabel = deg => { const d = ((deg % 360) + 405) % 360; return [tr('北', 'N'), tr('东', 'E'), tr('南', 'S'), tr('西', 'W')][Math.floor(d/90)]; };

/** 房间的各条边：a→b、长度、外法线 n（指向墙内）、朝向标签、key */
export function roomEdges(r){
  const poly = r.poly; let a2 = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; a2 += p[0]*q[1] - q[0]*p[1]; });
  const ccw = a2 > 0;
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ux = (q[0] - p[0])/(L || 1), uy = (q[1] - p[1])/(L || 1), nx = ccw ? uy : -uy, ny = ccw ? -ux : ux;
    const dir = bearingLabel(Math.atan2(nx, -ny)*180/Math.PI - (P().north || 0));          // 外法线方位角（相对指北）
    return {i, a:p, b:q, len:L, ux, uy, nx, ny, dir, key:`${r10((p[0] + q[0])/2)},${r10((p[1] + q[1])/2)}`};
  });
}

/** 墙面段：沿边 50mm 采样，向外 40mm 探测是否是墙 → [{edge, t0, t1}]（t 为沿边距离 mm） */
export function wallRuns(r){
  const dem = new Set(state.demolished), pl = P();
  const walls = pl.walls.filter((w, i) => !dem.has('w' + i) && w[4] !== 'low' && !w[5]).map(w => w.slice(0, 4));
  const gaps = [...pl.doors.map(d => d.rect), ...pl.slides.map(s => s.rect), ...pl.wins.map(w => w.slice(0, 4))];
  const STEP = 50, OFF = 40, out = [];
  for (const e of roomEdges(r)){
    if (e.len < 1) continue;
    let run = null;
    const push = end => { if (run !== null && end - run >= 60) out.push({edge:e, t0:run, t1:end}); run = null; };
    for (let t = STEP/2; t < e.len; t += STEP){
      const x = e.a[0] + e.ux*t + e.nx*OFF, y = e.a[1] + e.uy*t + e.ny*OFF;
      const ok = walls.some(w => inR(w, x, y)) && !gaps.some(g => inR(g, x, y));
      if (ok && run === null) run = t - STEP/2; else if (!ok && run !== null) push(t - STEP/2);
    }
    push(e.len);
  }
  return out;
}

/** 某面墙的材质 */
export const faceMat = (rid, key) => state.rooms[rid]?.faces?.[key] || state.rooms[rid]?.wall || 'paint_white';

/** 每个房间的墙面汇总：按边聚合长度 → [{edge, len, mat}] */
export function roomFaces(r){
  const m = new Map();
  for (const run of wallRuns(r)){ const k = run.edge.key, o = m.get(k) || {edge:run.edge, len:0}; o.len += run.t1 - run.t0; m.set(k, o); }
  return [...m.values()].map(o => ({...o, mat:faceMat(r.id, o.edge.key)}));
}

/** 点（mm）附近的墙面：点须在房间内，且距某条墙面边 < tol → {room, key, edge} */
export function faceAt(p, tol = 450){
  let best = null;
  for (const r of P().rooms){
    if (r.counted === false || !pointInPoly([p.x, p.y], r.poly)) continue;
    for (const run of wallRuns(r)){
      const e = run.edge, t = (p.x - e.a[0])*e.ux + (p.y - e.a[1])*e.uy;
      if (t < run.t0 - 100 || t > run.t1 + 100) continue;
      const d = Math.abs((p.x - e.a[0])*e.nx + (p.y - e.a[1])*e.ny);
      if (d < tol && (!best || d < best.d)) best = {room:r, key:e.key, edge:e, d};
    }
  }
  return best;
}
