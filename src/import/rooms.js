/* =====================================================================
 *  由“阻挡矩形”（墙 / 窗 / 门洞）求房间区域 —— 与单位无关（px 或 mm 均可）
 *
 *  1. 收集所有矩形的 x / y 边坐标，切出非均匀网格；
 *  2. 单元格中心落在任一矩形内 → 阻挡，否则为空；
 *  3. 空单元格做 4 邻接连通分量，碰到网格外圈的分量是“室外”；
 *  4. 每个室内分量沿单元格边界描出外轮廓 → 直角多边形（顶点恰好落在墙面上）。
 * ===================================================================== */

const uniq = (a, eps) => { a.sort((p, q) => p - q); const o = []; for (const v of a) if (!o.length || v - o[o.length - 1] > eps) o.push(v); return o; };

/** rects: [[x0,y0,x1,y1], …]；outside(x,y)：可选的“像素级室外”判定（户型图识别时传入，挡住斜墙 / 飘窗处的泄漏） */
export function extractRooms(rects, {eps = 1, pad = 0, outside = null} = {}){
  if (!rects.length) return {rooms:[], outsideAt:() => true};
  let X = [], Y = [];
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x0, y0, x1, y1] of rects){ X.push(x0, x1); Y.push(y0, y1); bx0 = Math.min(bx0, x0); by0 = Math.min(by0, y0); bx1 = Math.max(bx1, x1); by1 = Math.max(by1, y1); }
  const m = pad || Math.max(bx1 - bx0, by1 - by0) * .05 + 1;
  X.push(bx0 - m, bx1 + m); Y.push(by0 - m, by1 + m);
  X = uniq(X, eps); Y = uniq(Y, eps);
  const nx = X.length - 1, ny = Y.length - 1, N = nx*ny;
  const blocked = new Uint8Array(N);
  // 单元格中心是否被矩形覆盖：按矩形覆盖的格子区间直接标记（二分定位）
  const idx = (A, v) => { let lo = 0, hi = A.length - 1; while (lo < hi){ const mid = (lo + hi) >> 1; if (A[mid] < v) lo = mid + 1; else hi = mid; } return lo; };
  for (const [x0, y0, x1, y1] of rects){
    const i0 = idx(X, x0 - eps/2), i1 = idx(X, x1 - eps/2), j0 = idx(Y, y0 - eps/2), j1 = idx(Y, y1 - eps/2);
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++){
      const cx = (X[i] + X[i+1])/2, cy = (Y[j] + Y[j+1])/2;
      if (cx > x0 && cx < x1 && cy > y0 && cy < y1) blocked[j*nx + i] = 1;
    }
  }
  const outCell = new Uint8Array(N);
  if (outside) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){
    const c = j*nx + i; if (!blocked[c] && outside((X[i] + X[i+1])/2, (Y[j] + Y[j+1])/2)) outCell[c] = 1;
  }
  const label = new Int32Array(N).fill(-1), comps = [];
  const stack = [];
  for (let s = 0; s < N; s++){
    if (blocked[s] || outCell[s] || label[s] >= 0) continue;
    const id = comps.length, cells = []; let isOut = false;
    label[s] = id; stack.push(s);
    while (stack.length){
      const c = stack.pop(); cells.push(c);
      const i = c % nx, j = (c / nx) | 0;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) isOut = true;
      const nb = [i > 0 && c - 1, i < nx - 1 && c + 1, j > 0 && c - nx, j < ny - 1 && c + nx];
      for (const n of nb) if (n !== false && !blocked[n] && !outCell[n] && label[n] < 0){ label[n] = id; stack.push(n); }
    }
    comps.push({id, cells, outside:isOut});
  }
  const rooms = [];
  for (const cp of comps){
    if (cp.outside) continue;
    const set = new Set(cp.cells);
    let area = 0, best = null, bx = [Infinity, Infinity, -Infinity, -Infinity];
    for (const c of cp.cells){
      const i = c % nx, j = (c / nx) | 0, w = X[i+1] - X[i], h = Y[j+1] - Y[j];
      area += w*h;
      if (!best || Math.min(w, h)*Math.sqrt(w*h) > best.k) best = {k:Math.min(w, h)*Math.sqrt(w*h), x:(X[i] + X[i+1])/2, y:(Y[j] + Y[j+1])/2};
      bx = [Math.min(bx[0], X[i]), Math.min(bx[1], Y[j]), Math.max(bx[2], X[i+1]), Math.max(bx[3], Y[j+1])];
    }
    const poly = traceOutline(set, nx, X, Y);
    if (poly.length < 4) continue;
    let at = [(bx[0] + bx[2])/2, (bx[1] + bx[3])/2];
    if (!pointInPoly(at, poly)) at = [best.x, best.y];
    rooms.push({poly, area, bbox:bx, at, cells:cp.cells.length});
  }
  // 封口块：像素判定为室外、且紧邻室内的单元格（导入时保存，之后按几何重算房间时充当看不见的墙）
  const seals = [];
  if (outside) for (let c = 0; c < N; c++){
    if (!outCell[c]) continue;
    const i = c % nx, j = (c / nx) | 0;
    const nb = [i > 0 && c - 1, i < nx - 1 && c + 1, j > 0 && c - nx, j < ny - 1 && c + nx];
    if (nb.some(n => n !== false && !blocked[n] && !outCell[n])) seals.push([X[i], Y[j], X[i+1], Y[j+1]]);
  }
  const outsideComp = new Set(comps.filter(c => c.outside).map(c => c.id));
  const outsideAt = (x, y) => {
    if (x <= X[0] || y <= Y[0] || x >= X[nx] || y >= Y[ny]) return true;
    const i = Math.min(nx - 1, Math.max(0, idx(X, x) - 1)), j = Math.min(ny - 1, Math.max(0, idx(Y, y) - 1)), c = j*nx + i;
    return !blocked[c] && (outCell[c] === 1 || outsideComp.has(label[c]));
  };
  return {rooms, outsideAt, seals};
}

/** 单元格集合 → 外轮廓（取周长最长的环，忽略内部孔洞），去掉共线点 */
function traceOutline(set, nx, X, Y){
  // 有向边：沿单元格边界逆时针，key = 起点格点；格点编号 (i,j) → j*(nx+1)+i
  const W = nx + 1, next = new Map();
  const add = (a, b) => { if (!next.has(a)) next.set(a, []); next.get(a).push(b); };
  for (const c of set){
    const i = c % nx, j = (c / nx) | 0;
    const p00 = j*W + i, p10 = p00 + 1, p01 = p00 + W, p11 = p01 + 1;
    if (!set.has(c - nx) || j === 0) add(p00, p10);           // 上边：左 → 右
    if (!set.has(c + 1) || i === nx - 1) add(p10, p11);       // 右边：上 → 下
    if (!set.has(c + nx)) add(p11, p01);                      // 下边：右 → 左
    if (!set.has(c - 1) || i === 0) add(p01, p00);            // 左边：下 → 上
  }
  const used = new Set(), loops = [];
  for (const [s, outs] of next){
    for (const first of outs){
      const k0 = s + ':' + first; if (used.has(k0)) continue;
      const loop = [s]; let a = s, b = first;
      for (let guard = 0; guard < 1e6; guard++){
        used.add(a + ':' + b); loop.push(b);
        if (b === s) break;
        const cand = (next.get(b) || []).filter(n => !used.has(b + ':' + n));
        if (!cand.length) break;
        // 多条出边（对角相接）时优先右转，保证环不自交
        let pick = cand[0];
        if (cand.length > 1){
          const d = [b % W - a % W, ((b / W) | 0) - ((a / W) | 0)];
          const turn = n => { const e = [n % W - b % W, ((n / W) | 0) - ((b / W) | 0)]; return d[0]*e[1] - d[1]*e[0]; };
          pick = cand.reduce((p, q) => turn(q) > turn(p) ? q : p);
        }
        a = b; b = pick;
      }
      loops.push(loop);
    }
  }
  const pts = l => l.map(p => [X[p % W], Y[(p / W) | 0]]);
  const len = l => { let s = 0; for (let k = 1; k < l.length; k++) s += Math.abs(l[k][0] - l[k-1][0]) + Math.abs(l[k][1] - l[k-1][1]); return s; };
  const best = loops.map(pts).sort((p, q) => len(q) - len(p))[0] || [];
  // 去重 + 去共线
  const out = [];
  for (const p of best.slice(0, -1)){
    const q = out[out.length - 1];
    if (q && q[0] === p[0] && q[1] === p[1]) continue;
    out.push(p);
  }
  let changed = true;
  while (changed && out.length > 3){
    changed = false;
    for (let k = 0; k < out.length; k++){
      const a = out[(k - 1 + out.length) % out.length], b = out[k], c = out[(k + 1) % out.length];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])){ out.splice(k, 1); changed = true; break; }
    }
  }
  return out;
}

export function pointInPoly([x, y], poly){
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi)*(y - yi)/(yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 若干多边形 + 矩形的并集外轮廓（直角多边形）：用各顶点坐标切网格，单元格中心落在任一形状内即属于并集 */
export function unionOutline(polys, rects = []){
  let X = [], Y = [];
  for (const pg of polys) for (const [x, y] of pg){ X.push(x); Y.push(y); }
  for (const [x0, y0, x1, y1] of rects){ X.push(x0, x1); Y.push(y0, y1); }
  X = uniq(X, .5); Y = uniq(Y, .5);
  const nx = X.length - 1, ny = Y.length - 1, set = new Set();
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++){
    const c = [(X[i] + X[i+1])/2, (Y[j] + Y[j+1])/2];
    if (polys.some(pg => pointInPoly(c, pg)) || rects.some(r => c[0] > r[0] && c[0] < r[2] && c[1] > r[1] && c[1] < r[3])) set.add(j*nx + i);
  }
  return set.size ? traceOutline(set, nx, X, Y) : [];
}
