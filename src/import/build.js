/* =====================================================================
 *  识别结果（像素）→ 户型方案 plan（毫米）
 * ===================================================================== */
import {recognize, sampleColor} from './recognize.js';
import {extractRooms, pointInPoly, unionOutline} from './rooms.js';

/**
 * 孤立墙：和主墙体网络（外墙 + 内墙 + 门窗洞口）不连通、且整组落在外框以内的墙
 * → 多半是家具的深色描边（沙发、床、柜子），去掉，免得把房间切碎、在 3D 里立起一堵墙
 */
function dropIsolated(rec){
  const T = rec.thickness, tol = Math.max(2, T*.4);
  // 连通性看墙、窗、灰墙填充和门弧清晰的门：识别时补出来的普通缝 / 不确定的门可能把家具描边和外墙误连在一起
  const R = [...rec.walls.map(w => ({r:[w.x0, w.y0, w.x1, w.y1], w})),
    ...rec.openings.filter(o => o.kind === 'window' || o.kind === 'wall' || (o.kind === 'door' && o.doorScore >= .8)).map(o => ({r:o.rect, win:o.kind === 'window'}))];
  if (R.length < 4) return rec;
  const touch = (a, c, t = tol) => a[0] <= c[2] + t && c[0] <= a[2] + t && a[1] <= c[3] + t && c[1] <= a[3] + t;
  const par = R.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (touch(R[i].r, R[j].r)) par[f(i)] = f(j);
  const groups = {}; R.forEach((o, i) => (groups[f(i)] ||= []).push(o));
  const G = Object.values(groups).sort((a, b) => b.length - a.length), main = G[0];
  const mb = main.reduce((b, {r}) => [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const drop = new Set();
  for (const g of G.slice(1)){
    if (g.some(o => o.win)) continue;                                   // 带窗的是真墙
    const len = g.reduce((a, {r}) => a + Math.max(r[2] - r[0], r[3] - r[1]), 0);
    if (len > (mb[2] - mb[0] + mb[3] - mb[1])*.35) continue;             // 太长的不像家具
    if (g.every(({r}) => r[0] > mb[0] + T && r[1] > mb[1] + T && r[2] < mb[2] - T && r[3] < mb[3] - T)) g.forEach(o => o.w && drop.add(o.w));
  }
  if (!drop.size) return rec;
  const keep = rec.walls.filter(w => !drop.has(w)), gone = [...drop].map(w => [w.x0, w.y0, w.x1, w.y1]), kept = keep.map(w => [w.x0, w.y0, w.x1, w.y1]);
  // 夹在被删墙段之间的填充 / 门：只挨着被删的墙、不挨着保留的墙 → 一起删
  const openings = rec.openings.filter(o => o.kind === 'window' || !gone.some(g => touch(o.rect, g)) || kept.filter(k => touch(o.rect, k)).length >= 2);
  return {...rec, walls:keep, openings};
}

/** 橡皮擦笔迹（圆）是否碰到矩形 */
export const brushHits = (r, {x, y, r:rad}) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3])) <= rad;
/** 用户在导入对话框里擦掉的墙 / 门窗（opt.erase：橡皮擦经过的圆，像素） */
function applyEdits(rec, opt){
  const E = opt.erase || []; if (!E.length) return rec;
  // 墙只切掉笔刷经过的那一截（识别时同一直线上的墙段常被合成一整根，整根删会把整面墙都删没）
  const walls = [];
  for (const w of rec.walls){
    const horiz = (w.x1 - w.x0) >= (w.y1 - w.y0), a0 = horiz ? w.x0 : w.y0, a1 = horiz ? w.x1 : w.y1;
    const cuts = E.filter(c => brushHits([w.x0, w.y0, w.x1, w.y1], c)).map(c => {
      const off = horiz ? Math.max(w.y0 - c.y, 0, c.y - w.y1) : Math.max(w.x0 - c.x, 0, c.x - w.x1), h = Math.sqrt(Math.max(0, c.r*c.r - off*off)), m = horiz ? c.x : c.y;
      return [m - h, m + h];
    }).sort((p, q) => p[0] - q[0]);
    let t = a0;
    for (const [c0, c1] of cuts){ if (c0 > t + 2) walls.push(horiz ? {...w, x0:t, x1:Math.min(c0, a1)} : {...w, y0:t, y1:Math.min(c0, a1)}); t = Math.max(t, c1); }
    if (a1 > t + 2) walls.push(horiz ? {...w, x0:t, x1:a1} : {...w, y0:t, y1:a1});
  }
  return {...rec, walls, openings:rec.openings.filter(o => !E.some(c => brushHits(o.rect, c)))};
}

/**
 * 手画的一笔 → 若干段直墙：先把笔迹简化成折线（Douglas–Peucker），每段取水平或竖直，太短的丢掉
 * @param pts  笔迹点（像素）
 */
export function strokeToWalls(rec, pts){
  if (pts.length < 2) return [];
  const T = rec.thickness, eps = Math.max(6, T*1.2);
  const simplify = (P) => {
    if (P.length < 3) return P;
    const [a, b] = [P[0], P[P.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let iMax = 0, dMax = 0;
    for (let i = 1; i < P.length - 1; i++){ const d = Math.abs((b[0] - a[0])*(a[1] - P[i][1]) - (a[0] - P[i][0])*(b[1] - a[1]))/L; if (d > dMax){ dMax = d; iMax = i; } }
    return dMax > eps ? [...simplify(P.slice(0, iMax + 1)).slice(0, -1), ...simplify(P.slice(iMax))] : [a, b];
  };
  const S = simplify(pts), out = [];
  for (let i = 0; i + 1 < S.length; i++) if (Math.hypot(S[i + 1][0] - S[i][0], S[i + 1][1] - S[i][1]) >= T*2) out.push(manualWall(rec, S[i], S[i + 1]));
  return out;
}
/**
 * 手动补墙：用户在图上点的两点 → 水平或竖直（取变化大的方向）的细墙矩形；两端在 2 个墙厚内吸附到已有的墙并插进去半个墙厚，保证封死
 * @param rec  recognize() 结果（用 walls 和 thickness）
 */
export function manualWall(rec, [ax, ay], [bx, by]){
  const T = rec.thickness, horiz = Math.abs(bx - ax) >= Math.abs(by - ay), c = horiz ? (ay + by)/2 : (ax + bx)/2;
  let t0 = horiz ? Math.min(ax, bx) : Math.min(ay, by), t1 = horiz ? Math.max(ax, bx) : Math.max(ay, by);
  const inWall = t => rec.walls.some(w => horiz ? t >= w.x0 - 1 && t <= w.x1 + 1 && c >= w.y0 - 1 && c <= w.y1 + 1 : c >= w.x0 - 1 && c <= w.x1 + 1 && t >= w.y0 - 1 && t <= w.y1 + 1);
  for (let k = 0; k < T*2 && !inWall(t0); k++) t0--;
  for (let k = 0; k < T*2 && !inWall(t1); k++) t1++;
  t0 -= T*.5; t1 += T*.5;
  const th = Math.max(3, T*.45);
  return horiz ? [t0, c - th/2, t1, c + th/2] : [c - th/2, t0, c + th/2, t1];
}

/**
 * 飘窗框：很多户型图的飘窗只用细线在外墙窗外画一个框，围不成区域。
 * 从每个洞口往室外方向找：1–5.5 个墙厚以内有一条与洞口平行、覆盖 ≥ 70% 的细线（外缘），两端也有侧边细线 → 飘窗框。
 * 返回框的三条边（细矩形，像素），加进分区阻挡后飘窗就成了一个独立区域，交给 toPlan 的飘窗判定。
 */
function bayFrames(rec, img){
  const {W, H, thickness:T, softMask:soft} = rec, out = [], d8 = img.data;
  const white = (x, y) => { const p = ((y|0)*W + (x|0))*4; return .299*d8[p] + .587*d8[p + 1] + .114*d8[p + 2] > 228; };
  const inWall = (x, y) => rec.walls.some(w => x >= w.x0 - 1 && x <= w.x1 + 1 && y >= w.y0 - 1 && y <= w.y1 + 1);
  const ink = (x, y) => x >= 0 && y >= 0 && x < W && y < H && soft[(y|0)*W + (x|0)];
  for (const o of rec.openings){
    const [x0, y0, x1, y1] = o.rect, horiz = o.horiz, len = horiz ? x1 - x0 : y1 - y0;
    if (len < T*2.5) continue;
    // 哪一侧是室外：从洞口中心往两侧走，不碰墙一直走到图片边缘的那一侧
    const cx = (x0 + x1)/2, cy = (y0 + y1)/2;
    const blockAt = (x, y) => inWall(x, y) || rec.openings.some(p => p !== o && x >= p.rect[0] - 1 && x <= p.rect[2] + 1 && y >= p.rect[1] - 1 && y <= p.rect[3] + 1);
    const escapes = dir => { for (let d = T; ; d += 2){ const x = horiz ? cx : cx + dir*d, y = horiz ? cy + dir*d : cy; if (x < 0 || y < 0 || x >= W || y >= H) return true; if (blockAt(x, y)) return false; } };
    const outs = [-1, 1].filter(escapes); if (outs.length !== 1) continue;
    const dir = outs[0], face = horiz ? (dir < 0 ? y0 : y1) : (dir < 0 ? x0 : x1), a0 = horiz ? x0 : y0, a1 = horiz ? x1 : y1;
    const cover = (c, s0, s1, along) => { let n = 0, m = 0; for (let t = s0; t <= s1; t++, m++) if ([-1, 0, 1].some(e => along ? ink(horiz ? t : c + e, horiz ? c + e : t) : ink(horiz ? c + e : t, horiz ? t : c + e))) n++; return m ? n/m : 0; };
    let depth = 0;
    for (let d = Math.round(T); d <= T*5.5; d++) if (cover(face + dir*d, a0 + 3, a1 - 3, true) >= .7){ depth = d; break; }
    if (!depth) continue;
    // 飘窗框常画成双线（窗框 + 玻璃）：再往外 1 个墙厚内还有平行线，取最外那条
    for (let d = depth + 2; d <= depth + T; d++) if (cover(face + dir*d, a0 + 3, a1 - 3, true) >= .7) depth = d;
    const fFar = face + dir*depth, lo = Math.min(face, fFar), hi = Math.max(face, fFar);
    // 侧边：在洞口两端 ±1.5 个墙厚内找（飘窗框常比洞口宽一点）；取覆盖最好的位置作为框边
    const side = (a, sgn) => { let best = {v:0, a}; for (let e = -Math.ceil(T*1.5); e <= T*1.5; e++){ const v = cover(a + sgn*e, lo + 2, hi - 2, false); if (v > best.v + .02) best = {v, a:a + sgn*e}; } return best; };
    const s0 = side(a0, -1), s1 = side(a1, 1);
    if (s0.v < .5 || s1.v < .5) continue;
    const b0 = Math.min(s0.a, a0), b1 = Math.max(s1.a, a1), t = 1.5;     // 边线厚度（像素）
    // 框里基本是空白（窗台）；房间里是地板纹理 / 家具 —— 落在房间里的「框」不算
    let wn = 0, wm = 0;
    for (let u = b0 + 3; u < b1 - 3; u += 2) for (let v = lo + 3; v < hi - 3; v += 2){ wm++; if (horiz ? white(u, v) : white(v, u)) wn++; }
    if (!wm || wn/wm < .6) continue;                                   // 样图实测：真飘窗 0.61–0.82，落在房间里的 0–0.26
    const inner = horiz ? [cx, (dir < 0 ? y1 : y0) - dir*T] : [(dir < 0 ? x1 : x0) - dir*T, cy];    // 洞口内侧一点（房间里）
    out.push({center:horiz ? [(b0 + b1)/2, (lo + hi)/2] : [(lo + hi)/2, (b0 + b1)/2], inner,
      lines:horiz ? [[b0, fFar - t, b1, fFar + t], [b0 - t, lo, b0 + t, hi], [b1 - t, lo, b1 + t, hi]]
                  : [[fFar - t, b0, fFar + t, b1], [lo, b0 - t, hi, b0 + t], [lo, b1 - t, hi, b1 + t]]});
  }
  return out;
}

/** 识别 + 房间分割（像素空间），参数变化时重跑这一步 */
export function analyze(img, opt = {}){
  const rec = applyEdits(dropIsolated(recognize(img, opt)), opt), {W, H, thickness:T} = rec;
  // 像素级“室外”：细线（窗线 / 斜墙 / 门弧）膨胀 1px + 墙 + 已识别洞口，一起作为阻挡，从图片边缘泛洪
  const block = new Uint8Array(W*H);
  // 细线膨胀 R 像素：门扇、门弧、窗线之间常有 1–3px 的缝，不封住的话「室外」会从门口漏进房间（如对开入户门）
  const soft = rec.softMask, SR = opt.seal ?? 1;
  for (let i = 0; i < W*H; i++) if (rec.wallMask[i]) block[i] = 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++){
    if (!soft[y*W + x]) continue;
    for (let dy = -SR; dy <= SR; dy++) for (let dx = -SR; dx <= SR; dx++){ const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && dx*dx + dy*dy <= SR*SR) block[yy*W + xx] = 1; }
  }
  const extra = [...(opt.splits || []), ...(opt.manual || [])].filter(r => !(opt.erase || []).some(c => brushHits(r, c)));   // 自动补出的 + 手画的隔墙（被擦掉的除外）
  const rects = [...rec.walls.map(w => [w.x0, w.y0, w.x1, w.y1]), ...rec.openings.map(o => o.rect), ...extra, ...(opt.bayLines || [])];
  for (const [x0, y0, x1, y1] of rects) for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) block.fill(1, y*W + Math.max(0, Math.floor(x0)), y*W + Math.min(W, Math.ceil(x1)));
  const out = new Uint8Array(W*H), st = [];
  const seed = i => { if (!block[i] && !out[i]){ out[i] = 1; st.push(i); } };
  for (let x = 0; x < W; x++){ seed(x); seed((H-1)*W + x); }
  for (let y = 0; y < H; y++){ seed(y*W); seed(y*W + W - 1); }
  while (st.length){
    const i = st.pop(), x = i % W;
    if (x > 0) seed(i - 1); if (x < W - 1) seed(i + 1); if (i >= W) seed(i - W); if (i < (H-1)*W) seed(i + W);
  }
  // 单元格中心附近 3×3 多数为室外才算室外（抗噪）
  const outsideAt = (x, y) => {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
      const px = Math.round(x) + dx*2, py = Math.round(y) + dy*2;
      if (px < 0 || py < 0 || px >= W || py >= H || out[py*W + px]) n++;
    }
    return n >= 5;
  };
  const {rooms, seals} = extractRooms(rects, {eps:.5, outside:outsideAt});
  // 细线画的飘窗框（只用来围出区域，不当墙）：框和洞口内侧在同一个区域里的不加（那只是房间内部的细线）；
  // 有新框就带着它们从头再分一次（室外泛洪也要被框挡住）
  if (!opt.bayLines){
    const frames = bayFrames(rec, img).filter(f => !rooms.some(r => pointInPoly(f.center, r.poly) && pointInPoly(f.inner, r.poly)));
    if (frames.length) return analyze(img, {...opt, bayLines:frames.flatMap(f => f.lines)});
  }
  // 真房间四周大多是墙 / 门窗；营销图里的实心色块四周几乎没有墙 → 边界贴墙比例 < 35% 的丢弃
  const R = Math.max(2, T*.6);
  const nearBlock = (x, y) => rects.some(([x0, y0, x1, y1]) => x > x0 - R && x < x1 + R && y > y0 - R && y < y1 + R);
  const wallFrac = r => {
    let n = 0, k = 0;
    r.poly.forEach((p, i) => { const q = r.poly[(i + 1) % r.poly.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), m = Math.max(2, Math.round(L/(T*2)));
      for (let j = 0; j < m; j++){ const t = (j + .5)/m; n++; k += nearBlock(p[0] + (q[0] - p[0])*t, p[1] + (q[1] - p[1])*t); } });
    return n ? k/n : 0;
  };
  const kept = rooms.filter(r => wallFrac(r) >= .35);
  kept.forEach(r => r.color = sampleColor(img, r.poly));
  const splitDoors = (opt.splitDoors || []).filter(r => !(opt.erase || []).some(c => brushHits(r, c)));
  return {rec, rooms:kept, seals, outsideAt, T, outMask:out, splits:extra, splitDoors};
}

/**
 * 读文字的辅助信息（传给 ocr.js readLabels）：
 *  sep      墙体掩码 + 浅色实心隔墙（kind:'wall' 的洞口）+ 补出的隔墙 —— 文字行不跨过它们合并（两间房挨着的字）
 *  regions  小房间内部框（面积不到所有房间 6%、长宽比 ≤ 3）：逐行没读到名字时整块再认一次（如储物间里的单字「储」）
 */
export function ocrHints(an){
  const {W, H} = an.rec, T = an.T, sep = new Uint8Array(an.rec.wallMask);
  for (const [x0, y0, x1, y1] of [...an.rec.openings.filter(o => o.kind === 'wall').map(o => o.rect), ...(an.splits || [])])
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) sep.fill(1, y*W + Math.max(0, Math.floor(x0)), y*W + Math.min(W, Math.ceil(x1)));
  const tot = an.rooms.reduce((a, r) => a + r.area, 0);
  const regions = an.rooms.filter(r => r.area < tot*.06).map(r => { const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]); return [Math.min(...xs) + T*.3, Math.min(...ys) + T*.3, Math.max(...xs) - T*.3, Math.max(...ys) - T*.3]; })
    .filter(([x0, y0, x1, y1]) => Math.min(x1 - x0, y1 - y0) >= T*1.5 && Math.max(x1 - x0, y1 - y0) <= Math.min(x1 - x0, y1 - y0)*3);
  return {sep, regions};
}

const r10 = v => Math.round(v/10)*10;
const cen = b => [(b[0] + b[2])/2, (b[1] + b[3])/2];

/**
 * 房间标注配对：营销户型图里房间名下方紧挨着面积（「厨房 / 4.3㎡」）。成对的才算可靠标注。
 * → [{name, area, box, h}]（area 可能为空：只有名字、且名字是完整词典词时也收，作为弱标注）
 */
/** 各类房间面积的合理上限（m²）：超出多半是 OCR 读错（如「2.5㎡」读成 125） */
const MAX_AREA = [[/卫|浴|厕/, 15], [/厨/, 25], [/阳台|露台/, 40], [/过道|走廊|玄关|门厅/, 25], [/储|衣帽/, 15], [/飘窗/, 5], [/./, 90]];
const saneArea = (name, a) => a > 0 && a <= (MAX_AREA.find(([re]) => re.test(name || ''))?.[1] ?? 90);
export function pairLabels(labels){
  const names = labels.filter(l => l.name && !l.area), areas = labels.filter(l => l.area && !l.name), used = new Set(), out = [];
  labels.filter(l => l.name && l.area && saneArea(l.name, l.area)).forEach(l => out.push({name:l.name, area:l.area, box:l.box, h:l.h, strong:true}));   // 一块里同时读出名字和面积
  for (const n of names){
    const [nx, ny] = cen(n.box), w = n.box[2] - n.box[0];
    let best = null, bd = Infinity;
    for (const a of areas){
      if (used.has(a)) continue;
      const [ax, ay] = cen(a.box), dy = ay - ny, dx = Math.abs(ax - nx);
      const below = dy > 0 && dy < n.h*3 && dx < Math.max(w, a.box[2] - a.box[0])*.9;          // 正下方
      const right = Math.abs(dy) < n.h*.7 && a.box[0] > n.box[2] - 2 && a.box[0] - n.box[2] < n.h*2;   // 同一行右侧
      const d = Math.hypot(dx, dy); if ((below || right) && d < bd){ bd = d; best = a; }
    }
    if (best && saneArea(n.name, best.area)){ used.add(best); out.push({name:n.name, area:best.area, box:n.box, h:n.h, strong:true}); }
    else if (n.full) out.push({name:n.name, area:null, box:n.box, h:n.h, strong:false});
  }
  return out;
}
/** 把 OCR 读到的文字分配给房间 → an.rooms[i].label = {name, area}；r.pairs = 房间里的可靠标注 */
export function labelRooms(an, labels){
  const P = pairLabels(labels || []);
  for (const r of an.rooms){
    const inside = P.filter(l => pointInPoly(cen(l.box), r.poly)), strong = inside.filter(l => l.strong);
    // 一间里有多个标注（如主卧里的衣帽间）→ 取面积最大的那组；没有成对的才用单独的房间名
    // 只有名字没面积时：取离房间中心最近的那个（合并成一片的区域里，中心那个名字最能代表它）
    const c = r.at || cen(r.poly.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]));
    const dc = l => Math.hypot(cen(l.box)[0] - c[0], cen(l.box)[1] - c[1]);
    const pick = strong.sort((a, b) => b.area - a.area)[0] || inside.sort((a, b) => dc(a) - dc(b))[0];
    r.label = pick ? {name:pick.name, area:pick.area} : null;
    r.pairs = strong;
    // 用来找漏掉隔墙的标注：可靠的成对标注；没有的话用互不相同的完整房间名
    const weak = inside.filter(l => !l.strong).filter((l, i, a) => a.findIndex(m => m.name === l.name) === i);
    r.splitBy = strong.length >= 2 ? strong : weak.length >= 2 ? weak : [];
  }
  return an;
}
/**
 * 一个识别出的房间里有两个房间名（如「厨房」「阳台」挤在一起）→ 中间那道细墙没被识别出来：
 * 在两个名字之间找一条最「黑」的竖线 / 横线，作为补充隔墙返回（像素矩形）
 */
export function findSplits(an, img){
  const out = Object.assign([], {doors:[]}), W = img.width, H = img.height, d = img.data, T = an.T;
  const L = (x, y) => { x = Math.max(0, Math.min(W - 1, x|0)); y = Math.max(0, Math.min(H - 1, y|0)); const p = (y*W + x)*4; return .299*d[p] + .587*d[p + 1] + .114*d[p + 2]; };
  // 线上的像素：够暗，或比两侧（垂直于线的方向 ±4px）的地面暗 20 以上 —— 浅灰隔断线在不同颜色的地板上都能认出来
  const ink = (vert, c, t) => { const [x, y] = vert ? [c, t] : [t, c], v = L(x, y); if (v < 150) return true;
    const [a, b] = vert ? [L(x - 4, y), L(x + 4, y)] : [L(x, y - 4), L(x, y + 4)]; return v <= Math.min(a, b) - 20; };
  const walls = an.rec.walls.map(w => [w.x0, w.y0, w.x1, w.y1]);
  const inWall = (x, y) => walls.some(w => x >= w[0] - 1 && x <= w[2] + 1 && y >= w[1] - 1 && y <= w[3] + 1);
  for (const r of an.rooms){
    const Ls = r.splitBy || []; if (Ls.length < 2) continue;
    const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    for (let i = 0; i < Ls.length; i++) for (let j = i + 1; j < Ls.length; j++){
      const [a, b] = [Ls[i], Ls[j]], [ax, ay] = cen(a.box), [bx, by] = cen(b.box), vert = Math.abs(bx - ax) >= Math.abs(by - ay);
      const [p, q] = vert ? (ax < bx ? [a, b] : [b, a]) : (ay < by ? [a, b] : [b, a]);
      const lo = Math.round(vert ? p.box[2] : p.box[3]) + 2, hi = Math.round(vert ? q.box[0] : q.box[1]) - 2;
      const s0 = Math.round(vert ? bb[1] : bb[0]), s1 = Math.round(vert ? bb[3] : bb[2]);
      const mid = vert ? (ay + by)/2 : (ax + bx)/2;                   // 两个名字在线方向上的中点：分隔线应经过这一段
      // 候选线：①足够暗（< 150）、沿整个区域宽度覆盖 ≥ 45% 的列；②比两侧暗的浅灰细线，两头都接墙
      const cands = [];
      {
        const dk = (x, y) => L(x, y) < 150;
        let bc = -1, bv = 0;
        for (let c = lo; c <= hi; c++){
          let n = 0; for (let t = s0; t < s1; t++) if ([-1, 0, 1].some(e => vert ? dk(c + e, t) : dk(t, c + e))) n++;
          const v = n/Math.max(1, s1 - s0); if (v > bv){ bv = v; bc = c; }
        }
        if (bc >= 0 && bv >= .45){
          // 线的长度按房间在这条线上的实际范围（从两个名字中间往两头走到出房间为止），不按外接框 —— 不规则的房间里外接框会伸进隔壁
          const inR = t => [-1, 0, 1].some(e => pointInPoly(vert ? [bc + e, t] : [t, bc + e], r.poly));
          let ta = Math.round(mid), tb = ta;
          // 短暂出房间（≤ 2 倍墙厚，如门垛、凹口）再回来的不算到头
          const walk = (t, dir) => { let last = t; for (let u = t + dir, out = 0; u >= s0 - 2 && u <= s1 + 2 && out <= T*2; u += dir){ if (inR(u)){ last = u; out = 0; } else out++; } return last; };
          if (inR(ta)){ ta = walk(ta, -1); tb = walk(tb, 1); }
          else { ta = (vert ? bb[1] : bb[0]) + T*.5; tb = (vert ? bb[3] : bb[2]) - T*.5; }
          cands.push({c:bc, t0:ta - T*.5, t1:tb + T*.5, n:bv*(s1 - s0), old:true});
        }
      }
      const wallAt = (c, t) => vert ? inWall(c, t) : inWall(t, c);
      const nearWall = (c, t, dir) => { for (let k = 0; k <= T*1.5; k++) if (wallAt(c, t + dir*k)) return t + dir*k; return null; };
      for (let c = lo; c <= hi; c++){
        const runs = []; let cur = null, gap = 0;
        for (let t = s0; t <= s1; t++){
          if (wallAt(c, t)){ cur = null; gap = 0; continue; }
          if ([-1, 0, 1].some(e => ink(vert, c + e, t))){ if (cur && gap <= T*6){ cur.e = t; cur.n++; } else { cur = {b:t, e:t, n:1}; runs.push(cur); } gap = 0; }
          else gap++;
        }
        const run = runs.find(u => u.b <= mid + T*2 && u.e >= mid - T*2); if (!run) continue;
        const len = run.e - run.b, cov = run.n/Math.max(1, len + 1);
        const w0 = nearWall(c, run.b, -1), w1 = nearWall(c, run.e, 1);
        if (w0 == null || w1 == null || len < T*4 || cov < .55) continue;
        let hug = 0; for (let t = run.b; t <= run.e; t += 2) if (wallAt(c - T, t) || wallAt(c + T, t)) hug++;
        if (hug/Math.max(1, (run.e - run.b)/2) > .3) continue;
        cands.push({c, t0:w0 - T*.5, t1:w1 + T*.5, n:run.n});
      }
      if (!cands.length) continue;
      // 优先①（深色线，旧规则，已在样图上验证过）；没有再取墨迹最多的②
      // （试过按两个房间的面积标注比例来挑线，但 OCR 读错一个面积数字就会把正确的线否掉，弊大于利）
      const best = cands.find(u => u.old) || cands.sort((u, v) => v.n - u.n)[0];
      const t0 = best.t0, t1 = best.t1;
      const th = Math.max(2, T*.35);
      out.push(vert ? [best.c - th/2, t0, best.c + th/2, t1] : [t0, best.c - th/2, t1, best.c + th/2]);
      // 门洞：线上「墙体粗段」之间夹着的一段门宽（2.5–9 个墙厚）的细段 / 空白 —— 关着的门扇只是一根细线
      const thick = t => { let n = 0; for (let e = -Math.ceil(T); e <= T; e++){ const [x, y] = vert ? [best.c + e, t] : [t, best.c + e]; if (L(x, y) < 150) n++; } return n >= Math.max(4, T*.4); };
      const seg = []; let cur0 = null;
      for (let t = Math.round(t0); t <= t1; t++){ const k = thick(t) || wallAt(best.c, t); if (k && cur0 == null) cur0 = t; if ((!k || t === Math.round(t1)) && cur0 != null){ seg.push([cur0, t]); cur0 = null; } }
      for (let i = 0; i + 1 < seg.length; i++){
        const g0 = seg[i][1], g1 = seg[i + 1][0], len = g1 - g0;
        if (len >= T*2.5 && len <= T*9) out.doors.push(vert ? [best.c - th/2, g0, best.c + th/2, g1] : [g0, best.c - th/2, g1, best.c + th/2]);
      }
    }
  }
  return out;
}
/**
 * 按外圈尺寸标注求比例尺：同一条尺寸链上相邻两个数字的中心距 = (段1 + 段2)/2 →
 * 每对相邻数字给出一个独立估计（不依赖外框是否准确；读错的数字只会产生一个离群值）。
 * → {s, n}（n = 彼此一致的估计个数）或 0
 */
export function scaleFromDims(an, labels){
  const [x0, y0, x1, y1] = an.rec.bbox, est = [];
  const one = (labels || []).filter(l => l.nums?.length === 1), cx = l => (l.box[0] + l.box[2])/2, cy = l => (l.box[1] + l.box[3])/2;
  const chain = (L, pos) => { L.sort((a, b) => pos(a) - pos(b)); for (let i = 0; i + 1 < L.length; i++){ const d = pos(L[i + 1]) - pos(L[i]); if (d > 4) est.push((L[i].nums[0] + L[i + 1].nums[0])/2/d); } };
  const rows = (L, key) => { const g = []; for (const l of L){ const k = key(l), r = g.find(r => Math.abs(r.k - k) < l.h); r ? r.L.push(l) : g.push({k, L:[l]}); } return g.map(r => r.L); };
  rows(one.filter(l => l.box[3] < y0 || l.box[1] > y1), cy).forEach(L => chain(L, cx));            // 上 / 下（可能有两排）
  rows(one.filter(l => l.box[2] < x0 || l.box[0] > x1), cx).forEach(L => chain(L, cy));            // 左 / 右（竖排数字通常读不出）
  let best = [];
  for (const e of est){ const c = est.filter(v => Math.abs(v/e - 1) <= .06); if (c.length > best.length) best = c; }
  if (!best.length) return 0;
  const m = best.sort((a, b) => a - b)[best.length >> 1];
  return {s:m, n:best.length};
}
/**
 * 综合选比例尺（可靠程度从高到低）：
 *  1. ≥3 间房的面积标注彼此一致 → 用面积标注
 *  2. 面积标注（2 间）与尺寸标注相差 ≤ 10% → 用面积标注
 *  3. 尺寸标注有 ≥3 个一致的估计 → 用尺寸标注
 *  4. 只有 2 间面积标注、且与门宽 / 墙厚估算相差不到 1.6 倍 → 用面积标注
 *  5. 门宽 / 墙厚估算
 * → {s, src:'labels'|'dims'|'ref', n, agree}
 */
export function chooseScale(an, labels, ref){
  const L = scaleFromLabels(an), D = scaleFromDims(an, labels), wallRef = 240/an.T;
  const near = (a, b) => b && a/b < 1.6 && b/a < 1.6;
  const agree = L && D && Math.abs(L.s/D.s - 1) <= .1;
  if (L && L.n >= 3) return {...L, src:'labels', agree};
  if (L && agree) return {...L, src:'labels', agree};
  if (D && D.n >= 3) return {...D, src:'dims'};
  if (L && (near(L.s, ref) || near(L.s, wallRef))) return {...L, src:'labels'};   // 门宽估算本身也可能不准，与墙厚估算之一吻合即可
  return {s:ref, src:'ref', n:0};
}
/** 按图中面积标注求比例尺：只用「一间一组」的可靠标注，取彼此一致（±10%）的最大一组 → {s, n} 或 0 */
export function scaleFromLabels(an){
  const P = an.rooms.filter(r => r.pairs?.length === 1 && r.area > 0).map(r => ({A:r.pairs[0].area*1e6, px:r.area, s:Math.sqrt(r.pairs[0].area*1e6/r.area)}));
  let best = [];
  for (const p of P){ const c = P.filter(q => Math.abs(q.s/p.s - 1) <= .1); if (c.length > best.length) best = c; }
  if (best.length < 2) return 0;
  return {s:Math.sqrt(best.reduce((a, p) => a + p.A, 0)/best.reduce((a, p) => a + p.px, 0)), n:best.length};
}
/**
 * 按面积标注合并碎片：标了面积的房间明显偏小（> 15%），而相邻的无名碎片与它之间只隔着窗线 / 门洞线（不是墙、不是门），
 * 合并后面积更接近标注 → 合并。用来修正「家具 / 门扇线条被当成隔断」把一间切成两块的情况。
 * → {rooms, bridges}（像素坐标；bridges 是被抹掉的分隔区域，其中的洞口不再生成）
 */
function mergeByLabels(an, s){
  const T = an.T, rooms = an.rooms.map(r => ({...r})), bridges = [], gone = new Set();
  const bb = r => { const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const hard = [...an.rec.walls.map(w => [w.x0, w.y0, w.x1, w.y1]), ...an.rec.openings.filter(o => o.kind === 'wall' || o.kind === 'door').map(o => o.rect), ...an.splits];
  const ov = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))*Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const bridge = (A, B) => {
    const a = bb(A), b = bb(B), G = T*2.2;
    for (const [lo, hi, p0, p1, horiz] of [[a[2], b[0], 1, 3, true], [b[2], a[0], 1, 3, true], [a[3], b[1], 0, 2, false], [b[3], a[1], 0, 2, false]]){
      const g = hi - lo; if (g < -1 || g > G) continue;
      const o0 = Math.max(a[p0], b[p0]), o1 = Math.min(a[p1], b[p1]); if (o1 - o0 < Math.min(a[p1] - a[p0], b[p1] - b[p0])*.5) continue;
      const r = horiz ? [Math.min(lo, hi), o0, Math.max(lo, hi), o1] : [o0, Math.min(lo, hi), o1, Math.max(lo, hi)];
      const ra = Math.max(1, (r[2] - r[0])*(r[3] - r[1]));
      if (hard.some(h => ov(h, r) > ra*.3)) return null;               // 中间是墙或门 → 不合并
      return r;
    }
    return null;
  };
  const err = (px, A) => Math.abs(px*s*s - A)/A;
  for (const L of rooms){
    const A = L.label?.area*1e6; if (!A || gone.has(L)) continue;
    const e0 = err(L.area, A); if (e0 <= .15) continue;
    const save = {poly:L.poly, area:L.area}, used = [];
    let e = e0;
    for (let k = 0; k < 2; k++){
      let best = null;
      for (const R of rooms){
        if (R === L || gone.has(R) || used.includes(R) || R.label?.name) continue;
        const br = bridge(L, R); if (!br) continue;
        const px = L.area + R.area + (br[2] - br[0])*(br[3] - br[1]), ne = err(px, A);
        if (ne < e - .05 && (!best || ne < best.ne)) best = {R, br, px, ne};
      }
      if (!best) break;
      L.poly = unionOutline([L.poly, best.R.poly], [best.br]); L.area = best.px; e = best.ne; used.push({R:best.R, br:best.br});
    }
    if (used.length && (e < .15 || (e0 - e >= .2 && e < .35))){ used.forEach(u => { gone.add(u.R); bridges.push(u.br); }); }   // 明显更接近标注也算
    else Object.assign(L, save);
  }
  return {rooms:rooms.filter(r => !gone.has(r)), bridges};
}

/** 房间类型猜测：面积 + 形状 + 填充颜色（木纹 → 卧室，灰色瓷砖 → 厨卫） */
function nameRooms(rooms, wins, walls = []){
  const by = [...rooms].sort((a, b) => b.area - a.area), names = new Map();
  const colorKind = c => {
    if (!c || c[4] > .55) return 'none';                            // 无填色（线稿图）
    const [r, g, b] = c, L = .299*r + .587*g + .114*b, ch = Math.max(r, g, b) - Math.min(r, g, b);
    if (r - b > 28 && r >= g && L < 222) return 'wood';            // 木地板（卧室）
    if (r >= g && g >= b && r - b >= 12 && L >= 222) return 'cream';   // 浅米黄（阳台 / 客厅地砖）
    if (ch < 18 && L < 238) return 'gray';                          // 灰色瓷砖（厨卫）
    if (L >= 232 && ch < 20) return 'none';                        // 线稿：房间无填色，只能按面积猜
    return 'other';
  };
  const near = (r, w, t) => w[0] <= r.bbox[2] + t && w[2] >= r.bbox[0] - t && w[1] <= r.bbox[3] + t && w[3] >= r.bbox[1] - t;
  const touchesWin = r => wins.some(w => near(r, w, 300));
  // 阳台总是贴着外墙 / 窗：和客厅同色地砖的过道、门厅不会被当成阳台
  const outer = r => wins.some(w => near(r, w, 150)) || walls.some(w => w[4] === 'e' && near(r, w, 150));
  const living = by[0]; if (living) names.set(living, living.area >= 25e6 ? '客餐厅' : '客厅');
  let kitchen = null;
  for (const r of by.slice(1)){
    const w = r.bbox[2] - r.bbox[0], h = r.bbox[3] - r.bbox[1], sh = Math.min(w, h), lg = Math.max(w, h), k = colorKind(r.color), A = r.area/1e6;
    let n;
    if (A < 1.6 || (A < 3.2 && k !== 'gray' && k !== 'cream')) n = '储物间';
    else if ((k === 'cream' && sh < 2200 && A < 8 && outer(r)) || (sh < 2000 && touchesWin(r) && k !== 'wood' && k !== 'gray' && A < 8 && lg/sh >= 1.8)) n = '阳台';
    else if ((sh < 1300 && lg/sh >= 2.2) || (k === 'cream' && A < 6 && !outer(r))) n = '过道';   // 细长的，或和客厅同色地砖、不靠外墙的小空间
    else if (k === 'gray' || (k === 'none' && A < 6.5 && A >= 2.5)){
      if (!kitchen && A >= 4.5 && sh >= 1500){ n = '厨房'; kitchen = r; } else n = '卫生间';
    }
    else if (k === 'wood' || A >= 7) n = '卧室';
    else if (!kitchen && A >= 3.5){ n = '厨房'; kitchen = r; }
    else n = '房间';
    names.set(r, n);
  }
  // 编号：卧室 → 主卧 / 次卧 / 次卧2；其余同名追加序号
  const count = {}, bed = by.filter(r => names.get(r) === '卧室');
  bed.forEach((r, i) => names.set(r, i === 0 ? '主卧' : i === 1 ? '次卧' : '次卧' + i));
  for (const r of by){ const n = names.get(r); if (['主卧', '次卧'].includes(n) || /^次卧\d/.test(n)) continue; count[n] = (count[n] || 0) + 1; if (count[n] > 1) names.set(r, n + count[n]); }
  return names;
}
/** 用图中读到的房间名覆盖猜测结果；多个「卧室」按面积改成主卧 / 次卧，其余重名追加序号 */
function ocrNames(rooms, names){
  const got = rooms.filter(r => r.label?.name); if (!got.length) return;
  got.forEach(r => names.set(r, r.label.name));
  const beds = got.filter(r => r.label.name === '卧室').sort((a, b) => b.area - a.area);
  if (beds.length > 1) beds.forEach((r, i) => names.set(r, i === 0 ? '主卧' : i === 1 ? '次卧' : '次卧' + i));
  const seen = {};
  [...rooms].sort((a, b) => (b.label?.name ? 1 : 0) - (a.label?.name ? 1 : 0) || b.area - a.area).forEach(r => {
    const n = names.get(r).replace(/\d+$/, ''); seen[n] = (seen[n] || 0) + 1; names.set(r, seen[n] > 1 ? n + seen[n] : n);
  });
}
const MAT_OF = n => /卧|书房|儿童|老人/.test(n) ? 'wood' : /卫/.test(n) ? 'antislip' : /厨房/.test(n) ? 'tile600' : /阳台|露台|洗衣/.test(n) ? 'antislip' : 'tile800';

/**
 * @param an     analyze() 结果
 * @param mmPerPx 比例尺
 * @returns {plan, rooms(state.rooms 默认值)}
 */
export function toPlan(an, mmPerPx){
  const {rec} = an, s = mmPerPx, [bx0, by0] = rec.bbox;
  const X = x => r10((x - bx0)*s), Y = y => r10((y - by0)*s);
  const R4 = ([x0, y0, x1, y1]) => [X(x0), Y(y0), X(x1), Y(y1)];

  // 墙：外侧采样点落在室外 → 外墙
  const T = an.T;
  const walls = rec.walls.map(w => {
    const probe = [];
    for (const t of [.25, .5, .75]){
      if (w.horiz){ const x = w.x0 + (w.x1 - w.x0)*t; probe.push([x, w.y0 - T*.9], [x, w.y1 + T*.9]); }
      else { const y = w.y0 + (w.y1 - w.y0)*t; probe.push([w.x0 - T*.9, y], [w.x1 + T*.9, y]); }
    }
    const ext = probe.some(([x, y]) => an.outsideAt(x, y));
    return [...R4([w.x0, w.y0, w.x1, w.y1]), ext ? 'e' : 'n'];
  }).filter(w => w[2] > w[0] && w[3] > w[1]);

  const {rooms:pxRooms, bridges} = mergeByLabels(an, s);
  const inBridge = q => { const c = cen(q); return bridges.some(b => c[0] >= b[0] - 2 && c[0] <= b[2] + 2 && c[1] >= b[1] - 2 && c[1] <= b[3] + 2); };
  // 自动补出 / 手动画的隔墙也是真墙（不只是用来分房间）
  const splitDoors = (an.splitDoors || []).map(R4);
  for (const r of an.splits || []){
    const w = R4(r); if (w[2] <= w[0] || w[3] <= w[1]) continue;
    const horiz = w[2] - w[0] >= w[3] - w[1], gaps = splitDoors.filter(d => d[0] < w[2] && d[2] > w[0] && d[1] < w[3] && d[3] > w[1]).sort((p, q) => horiz ? p[0] - q[0] : p[1] - q[1]);
    let a = horiz ? w[0] : w[1];
    for (const d of gaps){ const b = horiz ? d[0] : d[1]; if (b - a > 20) walls.push(horiz ? [a, w[1], b, w[3], 'n'] : [w[0], a, w[2], b, 'n']); a = horiz ? d[2] : d[3]; }
    const e = horiz ? w[2] : w[3]; if (e - a > 20) walls.push(horiz ? [a, w[1], e, w[3], 'n'] : [w[0], a, w[2], e, 'n']);
  }
  const wins = [], doors = [], lintels = [];
  for (const d of splitDoors){                                         // 补出隔墙上的门
    const horiz = d[2] - d[0] >= d[3] - d[1], len = horiz ? d[2] - d[0] : d[3] - d[1];
    doors.push({name:'门', rect:d, h:horiz ? [d[0], d[3]] : [d[2], d[1]], c:horiz ? [1, 0] : [0, 1], o:horiz ? [0, 1] : [1, 0], len});
  }
  // 没有窗线、像素上也不在外墙上的「窗」：两侧都是正常大小的房间（不是飘窗 / 阳台）→ 其实是两间之间的开敞口（如过道接客厅）
  const roomAt = (x, y) => pxRooms.find(r => pointInPoly([x, y], r.poly));
  const bigRoom = r => { if (!r || /阳台|露台|花园|飘窗/.test(r.label?.name || '')) return false; const xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
    return Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))*s > 700 && r.area*s*s > 1e6; };
  const sidesOf = o => { const [x0, y0, x1, y1] = o.rect, d = T*1.5; return (o.horiz ? [[(x0 + x1)/2, y0 - d], [(x0 + x1)/2, y1 + d]] : [[x0 - d, (y0 + y1)/2], [x1 + d, (y0 + y1)/2]]).map(p => roomAt(...p)); };
  const passage = o => { if (o.kind !== 'window' || o.lines || o.exterior) return false; const [ra, rb] = sidesOf(o); return ra !== rb && bigRoom(ra) && bigRoom(rb); };
  for (const o of rec.openings){
    if (inBridge(o.rect)) continue;                                   // 合并房间时抹掉的分隔线
    if (passage(o)){ const r = R4(o.rect); if (r[2] > r[0] && r[3] > r[1]) lintels.push([r, 2.1]); continue; }
    const r = R4(o.rect); if (r[2] <= r[0] || r[3] <= r[1]) continue;
    if (o.kind === 'wall'){ walls.push([...r, 'n']); continue; }
    if (o.kind === 'window'){ wins.push([...r, .9]); continue; }
    if (o.kind === 'open'){ lintels.push([r, 2.1]); continue; }
    const len = o.horiz ? r[2] - r[0] : r[3] - r[1], dir = o.hingeAtStart ? 1 : -1;
    // 尺寸校验：住宅平开门很少超过 1.3m —— 外墙上这么宽的「门」其实是窗（凸窗框常被误判成门弧），室内的是开敞门洞
    if (o.exterior && len > 1300){ wins.push([...r, .9]); continue; }
    if (!o.exterior && len > 1600){ lintels.push([r, 2.1]); continue; }
    const g = o.hingeAtStart ? (o.horiz ? r[0] : r[1]) : (o.horiz ? r[2] : r[3]), t = o.side < 0 ? (o.horiz ? r[1] : r[0]) : (o.horiz ? r[3] : r[2]);
    doors.push({name:'门', rect:r, h:o.horiz ? [g, t] : [t, g], c:o.horiz ? [dir, 0] : [0, dir], o:o.horiz ? [0, o.side] : [o.side, 0], len, exterior:o.exterior});
  }

  const rooms = pxRooms.map(r => {
    const poly = r.poly.map(([x, y]) => [X(x), Y(y)]);
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    return {poly, area:r.area*s*s, bbox:[Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], at:[r10((r.at[0] - bx0)*s), r10((r.at[1] - by0)*s)], color:r.color, label:r.label};
  });
  // 飘窗：贴着窗、进深 0.25–1m 的浅区域（图里没标别的名字）→ 不计面积的飘窗台；房间与飘窗之间的窗改成带过梁的洞口，飘窗外侧三边是玻璃
  const touchW = (bx, w, t = 80) => w[0] <= bx[2] + t && bx[0] <= w[2] + t && w[1] <= bx[3] + t && bx[1] <= w[3] + t;
  for (const r of rooms){
    const [x0, y0, x1, y1] = r.bbox, sw = x1 - x0, sh = y1 - y0, d = Math.min(sw, sh), L = Math.max(sw, sh);
    if ((r.label?.name && r.label.name !== '飘窗') || d < 350 || d > 1000 || L < 900 || L > 4000 || r.area < .6e6)continue;
    const vert = sh > sw;                                              // 飘窗沿竖向 → 内侧窗是竖向的
    // 内侧洞口：窗，或很宽的「门」/ 门洞（飘窗洞口常有 1.5–2.5m，识别时会被当成门或门洞）
    const fits = w => touchW(r.bbox, w) && (vert ? (w[3] - w[1]) > (w[2] - w[0]) && (w[3] - w[1]) >= L*.5 : (w[2] - w[0]) > (w[3] - w[1]) && (w[2] - w[0]) >= L*.5);
    const cand = [...wins.map(w => ({r:w, from:'win'})), ...doors.map(d => ({r:d.rect, d, from:'door'})), ...lintels.map(l => ({r:l[0], l, from:'lintel'}))].find(o => fits(o.r));
    const inner = cand?.r;
    if (!inner && r.label?.name !== '飘窗')continue;
    // 真飘窗凸出在外墙外：内侧窗另一边是房间，远端外侧什么都没有（室外）
    if (inner){
      const side0 = vert ? ((inner[0] + inner[2])/2 < (x0 + x1)/2 ? 'L' : 'R') : ((inner[1] + inner[3])/2 < (y0 + y1)/2 ? 'T' : 'B');
      const far = {L:[x1 + 300, (y0 + y1)/2], R:[x0 - 300, (y0 + y1)/2], T:[(x0 + x1)/2, y1 + 300], B:[(x0 + x1)/2, y0 - 300]}[side0];
      const near = {L:[inner[0] - 300, (y0 + y1)/2], R:[inner[2] + 300, (y0 + y1)/2], T:[(x0 + x1)/2, inner[1] - 300], B:[(x0 + x1)/2, inner[3] + 300]}[side0];
      const inRoom = p => rooms.some(o => o !== r && pointInPoly(p, o.poly)), inWall = p => walls.some(w => p[0] >= w[0] && p[0] <= w[2] && p[1] >= w[1] && p[1] <= w[3]);
      const host = rooms.find(o => o !== r && pointInPoly(near, o.poly));
      if (!host) continue;
      // 内侧是阳台：这一条是阳台本身凸出外墙的部分（外墙线的延长线被误认成了窗）→ 并回阳台，去掉中间那道「窗」
      if (host && /阳台|露台/.test(host.label?.name || '')){
        if (cand.from === 'win') wins.splice(wins.indexOf(inner), 1);
        else if (cand.from === 'door') doors.splice(doors.indexOf(cand.d), 1);
        else lintels.splice(lintels.indexOf(cand.l), 1);
        const ir = inner.slice(0, 4), poly = unionOutline([host.poly, r.poly], [ir]).map(p => p.map(Math.round));
        if (poly.length >= 4){
          host.poly = poly; host.area += r.area + (ir[2] - ir[0])*(ir[3] - ir[1]);
          const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); host.bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
          r.mergedAway = true;
          // 阳台最外侧那条只有窗框细线 → 补一排窗
          const g = 60, outerWin = {L:[x1 - g, y0, x1, y1], R:[x0, y0, x0 + g, y1], T:[x0, y1 - g, x1, y1], B:[x0, y0, x1, y0 + g]}[side0];
          wins.push([...outerWin.map(r10), .9]);
        }
        continue;
      }
      // 真飘窗凸出在外墙外：远端外侧什么都没有（室外）；两端不能伸进宿主房间（挨着阳台等别的空间没关系）
      const ends = vert ? [[(x0 + x1)/2, y0 - 300], [(x0 + x1)/2, y1 + 300]] : [[x0 - 300, (y0 + y1)/2], [x1 + 300, (y0 + y1)/2]];
      if (inRoom(far) || inWall(far) || ends.some(p => pointInPoly(p, host.poly))) continue;
      // 飘窗的外缘只有细窗框；外缘紧贴着粗墙的是房间被误切下来的一截，不是飘窗
      const rimAt = d => ({L:[x1 + d, (y0 + y1)/2], R:[x0 - d, (y0 + y1)/2], T:[(x0 + x1)/2, y1 + d], B:[(x0 + x1)/2, y0 - d]})[side0];
      if (inWall(rimAt(40)) || inWall(rimAt(150))) continue;
      // 飘窗开在卧室 / 客厅这类房间外：内侧是厨卫、过道的不算
      if (/卫|厨|过道|玄关|门厅|储/.test(host?.label?.name || '')) continue;
      r.host = host;
    }
    r.bay = true;
    if (inner){
      if (cand.from === 'win') wins.splice(wins.indexOf(inner), 1);
      else if (cand.from === 'door') doors.splice(doors.indexOf(cand.d), 1);
      else lintels.splice(lintels.indexOf(cand.l), 1);
      lintels.push([inner.slice(0, 4), 2.3]);
      const side = vert ? ((inner[0] + inner[2])/2 < (x0 + x1)/2 ? 'L' : 'R') : ((inner[1] + inner[3])/2 < (y0 + y1)/2 ? 'T' : 'B'), g = 60;
      const outer = {L:[[x1 - g, y0, x1, y1], [x0, y0, x1, y0 + g], [x0, y1 - g, x1, y1]], R:[[x0, y0, x0 + g, y1], [x0, y0, x1, y0 + g], [x0, y1 - g, x1, y1]],
                     T:[[x0, y1 - g, x1, y1], [x0, y0, x0 + g, y1], [x1 - g, y0, x1, y1]], B:[[x0, y0, x1, y0 + g], [x0, y0, x0 + g, y1], [x1 - g, y0, x1, y1]]}[side];
      outer.forEach(w => wins.push([...w.map(r10), .45]));
    }
  }
  rooms.splice(0, rooms.length, ...rooms.filter(r => !r.mergedAway).filter(r => { const sh = Math.min(r.bbox[2] - r.bbox[0], r.bbox[3] - r.bbox[1]);   // 去掉碎片 / 窄缝；图里标了名字的小空间（小阳台等）放宽
    return r.bay || (r.label?.name ? r.area >= .4e6 && sh >= 450 : r.area >= 1.5e6 && sh >= 600); }));
  const bays = rooms.filter(r => r.bay), main = rooms.filter(r => !r.bay);
  const names = nameRooms(main, wins, walls);
  ocrNames(main, names);
  bays.forEach((r, i) => names.set(r, r.host && names.get(r.host) ? names.get(r.host) + '飘窗' : bays.length > 1 ? '飘窗' + (i + 1) : '飘窗'));   // 卧室飘窗 / 客厅飘窗
  const planRooms = rooms.map((r, i) => ({id:'r' + (i + 1), name:names.get(r), poly:r.poly, mat:r.bay ? 'marble' : MAT_OF(names.get(r)), at:r.at, ...(r.bay ? {counted:false} : {})}));

  // 入户门：外墙上的门里，离最大房间最近的那扇
  const living = planRooms.length ? planRooms.reduce((a, b) => (area(b.poly) > area(a.poly) ? b : a)) : null;
  const ext = doors.filter(d => d.exterior);
  let entry = null;
  if (ext.length && living){ const [lx, ly] = living.at; entry = ext.reduce((a, b) => dist(mid(b.rect), [lx, ly]) < dist(mid(a.rect), [lx, ly]) ? b : a); entry.entry = true; entry.name = '入户门'; }
  doors.forEach(d => delete d.exterior);
  // 入户门里侧的小房间（没读到名字时）→ 玄关
  if (entry){
    const [cx, cy] = mid(entry.rect), dx = entry.o[0]*400, dy = entry.o[1]*400;
    for (const sgn of [1, -1]){
      const pr = planRooms.find(r => pointInPoly([cx + dx*sgn, cy + dy*sgn], r.poly));
      if (pr && pr !== living && !rooms[planRooms.indexOf(pr)].label?.name && area(pr.poly) < 6e6){ pr.name = '玄关'; pr.mat = MAT_OF('玄关'); break; }
    }
  }

  // 范围 / 尺寸链
  const allX = walls.flatMap(w => [w[0], w[2]]), allY = walls.flatMap(w => [w[1], w[3]]);
  const [minX, maxX, minY, maxY] = allX.length ? [Math.min(...allX), Math.max(...allX), Math.min(...allY), Math.max(...allY)] : [0, 10000, 0, 8000];   // 没识别出墙时给个默认范围
  const breaks = (vals, a, b) => { const v = [a, ...vals.filter(x => x > a + 60 && x < b - 60), b].sort((p, q) => p - q), o = []; v.forEach(x => { if (!o.length || x - o[o.length - 1] > 60) o.push(x); else o[o.length - 1] = x; }); return o; };
  const segs = pts => pts.slice(1).map((p, i) => p - pts[i]);
  const band = 1200;
  const vWalls = walls.filter(w => w[3] - w[1] > w[2] - w[0]), hWalls = walls.filter(w => w[2] - w[0] >= w[3] - w[1]);
  const topX = breaks(vWalls.filter(w => w[1] <= minY + band).flatMap(w => [w[0], w[2]]), minX, maxX);
  const botX = breaks(vWalls.filter(w => w[3] >= maxY - band).flatMap(w => [w[0], w[2]]), minX, maxX);
  const lefY = breaks(hWalls.filter(w => w[0] <= minX + band).flatMap(w => [w[1], w[3]]), minY, maxY);
  const rigY = breaks(hWalls.filter(w => w[2] >= maxX - band).flatMap(w => [w[1], w[3]]), minY, maxY);
  const dims = [
    [true, minY - 750, minX, segs(topX)], [true, minY - 1250, minX, [maxX - minX]],
    [true, maxY + 650, minX, segs(botX)], [true, maxY + 1150, minX, [maxX - minX]],
    [false, minX - 800, minY, segs(lefY)], [false, minX - 1300, minY, [maxY - minY]],
    [false, maxX + 750, minY, segs(rigY)], [false, maxX + 1250, minY, [maxY - minY]],
  ].filter(d => d[3].length && d[3].every(v => v > 0));

  // 漫游起点：站在客厅（最大房间）中央，沿房间较长方向看 —— 比按入户门推算更稳（门的内外判断出错时不会站进墙里）
  let walkStart;
  if (living){
    const xs = living.poly.map(p => p[0]), ys = living.poly.map(p => p[1]), [x, y] = living.at;
    const wide = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
    walkStart = wide ? {x, y, lx:Math.max(...xs), ly:y} : {x, y, lx:x, ly:Math.max(...ys)};
  } else walkStart = {x:(minX + maxX)/2, y:(minY + maxY)/2, lx:maxX, ly:(minY + maxY)/2};

  const cnt = planRooms.filter(r => r.counted !== false), nBed = cnt.filter(r => /卧|儿童房|老人房/.test(r.name)).length, nLiv = cnt.filter(r => /客厅|餐厅|客餐厅/.test(r.name)).length, nBath = cnt.filter(r => /卫/.test(r.name)).length;   // 飘窗不计
  const plan = {
    v:1, auto:true,
    title:`${nBed}室${nLiv}厅${nBath}卫`, titleEn:`${nBed}BR ${nLiv}LR ${nBath}BA`,
    walls, wins, doors, slides:[], rooms:planRooms, seals:(an.seals || []).map(R4).filter(r => r[2] > r[0] && r[3] > r[1]), dims, entryMark:null, lintels, walkStart,
    bounds:{x:minX - 1850, y:minY - 1750, w:maxX - minX + 3700, h:maxY - minY + 3500},
    underlay:{x:-bx0*s, y:-by0*s, w:rec.W*s, h:rec.H*s},
  };
  const roomState = {}; planRooms.forEach(r => roomState[r.id] = {name:r.name, mat:r.mat, wall:/卫|厨房/.test(r.name) ? 'walltile' : 'paint_white'});
  return {plan, rooms:roomState};
}
const mid = r => [(r[0] + r[2])/2, (r[1] + r[3])/2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const area = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0)) / 2;

/**
 * 一张图里有几层（「一层 / 二层 / 三层」并排）？墙 + 窗按相互接触聚成若干组，
 * 总长度不小于最大一组 30% 的算一层（相互重叠或贴得很近的组算同一层）→ [{bbox:[x0,y0,x1,y1]}]，按从左到右、从上到下排
 */
export function floorPlates(rec){
  const T = rec.thickness, tol = Math.max(3, T*.6);
  const R = [...rec.walls.map(w => [w.x0, w.y0, w.x1, w.y1]), ...rec.openings.map(o => o.rect)];
  if (R.length < 6) return [];
  const par = R.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
  const near = (a, c, t) => a[0] <= c[2] + t && c[0] <= a[2] + t && a[1] <= c[3] + t && c[1] <= a[3] + t;
  for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) if (near(R[i], R[j], tol)) par[f(i)] = f(j);
  const G = {}; R.forEach((r, i) => { const g = G[f(i)] ||= {bbox:[...r], len:0}; g.bbox = [Math.min(g.bbox[0], r[0]), Math.min(g.bbox[1], r[1]), Math.max(g.bbox[2], r[2]), Math.max(g.bbox[3], r[3])]; g.len += Math.max(r[2] - r[0], r[3] - r[1]); });
  let L = Object.values(G).sort((a, b) => b.len - a.len);
  const big = L[0]?.len || 0; L = L.filter(g => g.len >= big*.3);
  // 外框相交 / 相距不到 3 个墙厚的合并（同一层被门洞断开的部分）
  for (let merged = true; merged;){
    merged = false;
    for (let i = 0; i < L.length && !merged; i++) for (let j = i + 1; j < L.length && !merged; j++) if (near(L[i].bbox, L[j].bbox, T*3)){
      const a = L[i].bbox, b = L[j].bbox; L[i] = {bbox:[Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])], len:L[i].len + L[j].len}; L.splice(j, 1); merged = true;
    }
  }
  return L.length > 1 ? L.sort((a, b) => (a.bbox[0] - b.bbox[0]) || (a.bbox[1] - b.bbox[1])).map(g => ({bbox:g.bbox})) : [];
}

/** 门宽众数（px）：住宅室内门绝大多数同宽 → 取「±15% 内门最多」的那一簇的均值；不足 2 扇返回 0 */
export function typicalDoorPx(rec){
  const pick = min => rec.openings.filter(o => o.kind === 'door' && o.doorScore >= min).map(o => o.gap).sort((a, b) => a - b);
  let g = pick(.85); if (g.length < 2) g = pick(.55);                // 优先只用门弧非常清晰的门
  if (g.length < 2) return 0;
  let best = null;
  for (const v of g){ const c = g.filter(x => x >= v*.87 && x <= v*1.15); if (!best || c.length > best.length) best = c; }
  return best.length >= 2 ? best.reduce((a, b) => a + b, 0)/best.length : 0;
}
