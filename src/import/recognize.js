/* =====================================================================
 *  户型图识别（纯前端，像素坐标）
 *
 *  输入：ImageData（链家 / 贝壳 / 我爱我家等常见户型图）
 *  步骤：
 *   1. 灰度 → 暗像素掩码（Otsu 自动阈值，可手动调）
 *   2. 统计暗像素横 / 竖游程，估计墙厚 T（墙是“又粗又长”的暗笔画）
 *   3. 形态学开运算（先腐蚀后膨胀）去掉文字、尺寸线、家具图例等细笔画，只留墙
 *   4. 每个墙像素按“横向游程 vs 竖向游程”分到横墙 / 竖墙，连通分量 → 轴对齐矩形
 *   5. 对齐：同一直线上的墙统一厚度，墙端吸附到相交墙的外皮，形成闭合墙角
 *   6. 同一直线上两段墙之间的缺口：
 *        缺口里有 ≥2 条平行细线 → 窗；能找到四分之一圆弧 → 平开门（并推断铰点和开向）；
 *        位于外圈且无特征 → 视为窗（阳台 / 落地窗）；短缺口 → 门洞；其余 → 开放空间
 * ===================================================================== */

/** 灰度直方图 Otsu 阈值，结果限制在 [60, 185] */
function otsu(gray){
  const h = new Float64Array(256); for (const v of gray) h[v]++;
  const N = gray.length; let sum = 0; for (let i = 0; i < 256; i++) sum += i*h[i];
  let sB = 0, wB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++){
    wB += h[t]; if (!wB) continue; const wF = N - wB; if (!wF) break;
    sB += t*h[t]; const mB = sB/wB, mF = (sum - sB)/wF, v = wB*wF*(mB - mF)**2;
    if (v > best){ best = v; thr = t; }
  }
  return Math.max(60, Math.min(185, thr));
}

/** 二值图沿一个方向的“窗口全为 1”（腐蚀）或“窗口有 1”（膨胀），窗口宽 2r+1，用前缀和 O(N) */
function morph1d(src, W, H, r, horiz, erode){
  const out = new Uint8Array(W*H), L = horiz ? W : H, M = horiz ? H : W, pre = new Int32Array(L + 1);
  for (let m = 0; m < M; m++){
    for (let l = 0; l < L; l++){ const k = horiz ? m*W + l : l*W + m; pre[l + 1] = pre[l] + src[k]; }
    for (let l = 0; l < L; l++){
      const a = Math.max(0, l - r), b = Math.min(L, l + r + 1), s = pre[b] - pre[a], k = horiz ? m*W + l : l*W + m;
      out[k] = erode ? (s === b - a && b - a === 2*r + 1 ? 1 : 0) : (s > 0 ? 1 : 0);
    }
  }
  return out;
}
const open2d = (m, W, H, r) => {
  let e = morph1d(morph1d(m, W, H, r, true, true), W, H, r, false, true);
  return morph1d(morph1d(e, W, H, r, true, false), W, H, r, false, false);
};

/** 暗像素游程长度众数 → 墙厚（px） */
function estimateThickness(dark, W, H){
  const hist = new Float64Array(120);
  const runs = (horiz) => {
    const L = horiz ? W : H, M = horiz ? H : W;
    for (let m = 0; m < M; m += 2){
      let run = 0;
      for (let l = 0; l <= L; l++){
        const v = l < L ? dark[horiz ? m*W + l : l*W + m] : 0;
        if (v) run++; else { if (run >= 3 && run < 120) hist[run]++; run = 0; }
      }
    }
  };
  runs(true); runs(false);
  // 平滑后取 count·√len 最大者：细笔画（文字 / 尺寸线）游程短，被 √len 压下去
  const sm = l => hist[l-1] + 2*hist[l] + hist[l+1];
  let best = 0, T = 8;
  for (let l = 3; l < 118; l++){ const v = sm(l) * Math.sqrt(l); if (v > best){ best = v; T = l; } }
  // 链家等图：外墙粗、内墙细 → 再找一个更细的显著峰（内墙），形态学核按它来定
  let Tmin = T;
  for (let l = 4; l < T - 1; l++) if (sm(l) >= sm(l-1) && sm(l) >= sm(l+1) && sm(l) >= .12*sm(T)){ Tmin = l; break; }
  return {T, Tmin};
}

/** 4 邻接连通分量的外接矩形 */
function components(mask, W, H){
  const seen = new Uint8Array(W*H), out = [], st = [];
  for (let s = 0; s < W*H; s++){
    if (!mask[s] || seen[s]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0; seen[s] = 1; st.push(s);
    while (st.length){
      const c = st.pop(), x = c % W, y = (c / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && mask[c-1] && !seen[c-1]){ seen[c-1] = 1; st.push(c-1); }
      if (x < W-1 && mask[c+1] && !seen[c+1]){ seen[c+1] = 1; st.push(c+1); }
      if (y > 0 && mask[c-W] && !seen[c-W]){ seen[c-W] = 1; st.push(c-W); }
      if (y < H-1 && mask[c+W] && !seen[c+W]){ seen[c+W] = 1; st.push(c+W); }
    }
    out.push({x0, y0, x1:x1 + 1, y1:y1 + 1, n});
  }
  return out;
}

/** 数值聚类：差距 < tol 的归为一组，组内取加权中位 */
function clusterValues(vals, tol){
  const s = [...vals].sort((a, b) => a.v - b.v), groups = [];
  for (const it of s){ const g = groups[groups.length - 1]; if (g && it.v - g.last <= tol){ g.items.push(it); g.last = it.v; } else groups.push({items:[it], last:it.v}); }
  for (const g of groups){
    const items = g.items.sort((a, b) => a.v - b.v); let tot = 0; items.forEach(i => tot += i.w);
    let acc = 0, med = items[0].v; for (const i of items){ acc += i.w; if (acc >= tot/2){ med = i.v; break; } }
    items.forEach(i => i.set(med));
  }
}

/**
 * @param {ImageData} img
 * @param {{threshold?:number, thickness?:number}} opt
 * @returns 像素坐标的识别结果
 */
export function recognize(img, opt = {}){
  const {width:W, height:H, data} = img, N = W*H;
  const gray = new Uint8Array(N);
  for (let i = 0; i < N; i++){
    const a = data[i*4 + 3]/255, l = .299*data[i*4] + .587*data[i*4 + 1] + .114*data[i*4 + 2];
    gray[i] = Math.round(l*a + 255*(1 - a));                       // 透明背景按白色处理
  }
  const thr = opt.threshold ?? otsu(gray);
  // 墙是黑 / 灰色：再要求低色度，排除深棕色的床、沙发等彩色家具图例
  const dark = new Uint8Array(N);
  for (let i = 0; i < N; i++){ const r = data[i*4], g = data[i*4+1], b = data[i*4+2]; dark[i] = gray[i] < thr && Math.max(r, g, b) - Math.min(r, g, b) < 48 ? 1 : 0; }
  const soft = new Uint8Array(N); for (let i = 0; i < N; i++) soft[i] = gray[i] < Math.min(235, thr + 55) ? 1 : 0;   // 细线 / 浅色弧线
  const est = estimateThickness(dark, W, H), T = opt.thickness ?? est.T, Tmin = Math.min(T, opt.thinWall ?? est.Tmin);
  const r = Math.max(1, Math.floor((Tmin - 1)*.32));
  const wall = open2d(dark, W, H, r);

  // ---------- 横 / 竖墙拆分 ----------
  const hr = new Uint16Array(N), vr = new Uint16Array(N);
  for (let y = 0; y < H; y++){ let x = 0; while (x < W){ if (!wall[y*W + x]){ x++; continue; } let e = x; while (e < W && wall[y*W + e]) e++; for (let k = x; k < e; k++) hr[y*W + k] = Math.min(65535, e - x); x = e; } }
  for (let x = 0; x < W; x++){ let y = 0; while (y < H){ if (!wall[y*W + x]){ y++; continue; } let e = y; while (e < H && wall[e*W + x]) e++; for (let k = y; k < e; k++) vr[k*W + x] = Math.min(65535, e - y); y = e; } }
  const hm = new Uint8Array(N), vm = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (wall[i]){ if (hr[i] >= vr[i]) hm[i] = 1; else vm[i] = 1; }
  const mk = (c, horiz) => {
    const len = horiz ? c.x1 - c.x0 : c.y1 - c.y0, th = horiz ? c.y1 - c.y0 : c.x1 - c.x0;
    return {x0:c.x0, y0:c.y0, x1:c.x1, y1:c.y1, horiz, len, th, fill:c.n/((c.x1 - c.x0)*(c.y1 - c.y0))};
  };
  // 填充率低的长条：外墙上的窗（几条细线）和两头的实心墙垛粘成了一整块 —— 不整块丢掉，只留下「整个厚度都是墙」的实心段，
  // 中间的窗线留给后面的缺口识别（≥2 条平行细线 → 窗）
  const solidParts = (c, horiz, m) => {
    const out = [], L0 = horiz ? c.x0 : c.y0, L1 = horiz ? c.x1 : c.y1, t0 = horiz ? c.y0 : c.x0, t1 = horiz ? c.y1 : c.x1, th = t1 - t0;
    let s = -1;
    for (let u = L0; u <= L1; u++){
      let k = 0; if (u < L1) for (let t = t0; t < t1; t++) k += horiz ? m[t*W + u] : m[u*W + t];
      const on = u < L1 && k >= th*.8;
      if (on && s < 0) s = u;
      else if (!on && s >= 0){ out.push(horiz ? {x0:s, y0:t0, x1:u, y1:t1, n:(u - s)*th} : {x0:t0, y0:s, x1:t1, y1:u, n:(u - s)*th}); s = -1; }
    }
    return out;
  };
  const split = (m, horiz) => components(m, W, H).flatMap(c => { const w = mk(c, horiz); return w.fill > .5 ? [w] : solidParts(c, horiz, m).map(p => mk(p, horiz)); });
  const raw = [...split(hm, true), ...split(vm, false)].filter(w => w.th >= 2*r + 1 && w.th <= T*1.9 && w.fill > .5), minLen = Math.max(2.6*Tmin, 1.4*T);
  let walls = raw.filter(w => w.len >= minLen);

  // ---------- 对齐：同一直线的墙统一位置 / 厚度 ----------
  const tol = Math.max(2, Tmin*.45);
  clusterValues(walls.filter(w => w.horiz).flatMap(w => [{v:w.y0, w:w.len, set:v => w.y0 = v}, {v:w.y1, w:w.len, set:v => w.y1 = v}]), tol);
  clusterValues(walls.filter(w => !w.horiz).flatMap(w => [{v:w.x0, w:w.len, set:v => w.x0 = v}, {v:w.x1, w:w.len, set:v => w.x1 = v}]), tol);
  walls = walls.filter(w => w.x1 - w.x0 > 1 && w.y1 - w.y0 > 1);

  // ---------- 墙角：端点吸附到相交墙的外皮 ----------
  const reach = T*1.2;
  for (const a of walls){
    for (const b of walls){
      if (a === b || a.horiz === b.horiz) continue;
      if (a.horiz){
        if (b.y0 > a.y1 + reach || b.y1 < a.y0 - reach) continue;   // b（竖墙）需在高度上跨过 a
        if (Math.abs(a.x0 - b.x0) < reach || (a.x0 > b.x0 && a.x0 < b.x1 + reach && a.x0 - b.x1 < reach)) { if (a.x0 >= b.x0 - reach && a.x0 <= b.x1 + reach) a.x0 = Math.min(a.x0, b.x0); }
        if (Math.abs(a.x1 - b.x1) < reach || (a.x1 < b.x1 && a.x1 > b.x0 - reach)) { if (a.x1 >= b.x0 - reach && a.x1 <= b.x1 + reach) a.x1 = Math.max(a.x1, b.x1); }
      } else {
        if (b.x0 > a.x1 + reach || b.x1 < a.x0 - reach) continue;
        if (a.y0 >= b.y0 - reach && a.y0 <= b.y1 + reach) a.y0 = Math.min(a.y0, b.y0);
        if (a.y1 >= b.y0 - reach && a.y1 <= b.y1 + reach) a.y1 = Math.max(a.y1, b.y1);
      }
    }
  }
  // 合并同一直线上相互重叠的墙段
  const merged = [];
  for (const horiz of [true, false]){
    const ws = walls.filter(w => w.horiz === horiz).sort((a, b) => horiz ? a.y0 - b.y0 || a.x0 - b.x0 : a.x0 - b.x0 || a.y0 - b.y0);
    for (const w of ws){
      const m = merged.find(o => o.horiz === horiz && (horiz ? o.y0 === w.y0 && o.y1 === w.y1 && w.x0 <= o.x1 + 1 && w.x1 >= o.x0 - 1 : o.x0 === w.x0 && o.x1 === w.x1 && w.y0 <= o.y1 + 1 && w.y1 >= o.y0 - 1));
      if (m){ m.x0 = Math.min(m.x0, w.x0); m.y0 = Math.min(m.y0, w.y0); m.x1 = Math.max(m.x1, w.x1); m.y1 = Math.max(m.y1, w.y1); }
      else merged.push({...w});
    }
  }
  walls = merged;

  // ---------- 连通聚类：丢掉远离墙体主体的碎片（尺寸数字、指北针、家具图例） ----------
  {
    const par = walls.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    const near = (a, b, d) => a.x0 - d < b.x1 && b.x0 - d < a.x1 && a.y0 - d < b.y1 && b.y0 - d < a.y1;
    for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++){
      const a = walls[i], b = walls[j];
      const col = a.horiz === b.horiz && (a.horiz ? a.y0 < b.y1 && b.y0 < a.y1 && Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) < T*30
                                                  : a.x0 < b.x1 && b.x0 < a.x1 && Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1) < T*30);
      if (col || near(a, b, T*1.1)) par[find(i)] = find(j);
    }
    const tot = new Map(); walls.forEach((w, i) => tot.set(find(i), (tot.get(find(i)) || 0) + w.len));
    const big = Math.max(0, ...tot.values());
    // 落在主体外框以内的组也留下：墙体常被门窗洞口隔成几组（如整片卧室区只经门窗与其余部分相连），
    // 要丢的是外框以外的碎片；框内的家具描边由后面的家具过滤 / build.js dropIsolated 处理
    const bigId = [...tot.entries()].find(([, v]) => v === big)?.[0], m = T*2;
    const mb = walls.reduce((b, w, i) => find(i) === bigId ? [Math.min(b[0], w.x0), Math.min(b[1], w.y0), Math.max(b[2], w.x1), Math.max(b[3], w.y1)] : b, [Infinity, Infinity, -Infinity, -Infinity]);
    const inMain = w => w.x0 >= mb[0] - m && w.y0 >= mb[1] - m && w.x1 <= mb[2] + m && w.y1 <= mb[3] + m;
    const grpIn = new Map(); walls.forEach((w, i) => { const k = find(i); grpIn.set(k, (grpIn.get(k) ?? true) && inMain(w)); });
    walls = walls.filter((w, i) => tot.get(find(i)) >= big*.25 || grpIn.get(find(i)));
  }

  // ---------- 缺口：从每段墙两端沿轴向找最近的墙（共线 / 垂直都算） ----------
  const bbox = walls.reduce((b, w) => [Math.min(b[0], w.x0), Math.min(b[1], w.y0), Math.max(b[2], w.x1), Math.max(b[3], w.y1)], [W, H, 0, 0]);
  const at = (m, x, y) => x >= 0 && y >= 0 && x < W && y < H && m[(y|0)*W + (x|0)];
  // 预泛洪：墙 + 细线（膨胀 1px）作阻挡，从图片边缘灌入 → 粗略的「室外」像素，用来判断缺口是否在外墙上
  const pre = new Uint8Array(N);
  {
    const blk = i => wall[i] || soft[i] || (i % W > 0 && soft[i-1]) || (i % W < W-1 && soft[i+1]) || (i >= W && soft[i-W]) || (i < N-W && soft[i+W]);
    const st = [], seed = i => { if (!pre[i] && !blk(i)){ pre[i] = 1; st.push(i); } };
    for (let x = 0; x < W; x++){ seed(x); seed((H-1)*W + x); }
    for (let y = 0; y < H; y++){ seed(y*W); seed(y*W + W - 1); }
    while (st.length){ const i = st.pop(), x = i % W; if (x > 0) seed(i-1); if (x < W-1) seed(i+1); if (i >= W) seed(i-W); if (i < N-W) seed(i+W); }
  }
  const outFrac = pts => pts.filter(([x, y]) => x < 0 || y < 0 || x >= W || y >= H || pre[(y|0)*W + (x|0)]).length/pts.length;
  const openings = [], seenGap = new Set();
  // 给一个缺口分类（门 / 窗 / 浅色墙 / 门洞），不是洞口返回 null。a、b：缺口两头的墙；g0..g1 沿缺口方向，t0..t1 横截面
  function classifyGap(a, b, horiz, g0, g1, t0, t1){
    const gap = g1 - g0;
    const rect = horiz ? [g0, t0, g1, t1] : [t0, g0, t1, g1];
    // 平行细线：沿墙方向覆盖率 > 60% 的行（列）→ 窗
    let lines = 0, prev = false, onRows = 0, rows = 0;
    for (let t = Math.floor(t0) - 1; t <= Math.ceil(t1) + 1; t++){
      let c = 0; for (let g = g0 + 1; g < g1 - 1; g++) c += horiz ? at(soft, g, t) : at(soft, t, g);
      const on = c > (gap - 2)*.8; if (on && !prev) lines++; prev = on; rows++; onRows += on;
    }
    // 整段几乎被浅色笔画填满 → 是颜色偏浅的墙（链家图的灰色内墙），不是窗
    const solid = onRows/rows >= .6;
    // 四分之一圆弧：4 种（铰点在哪端 × 朝哪侧开），虚线弧在 5×5 邻域内也能命中
    let door = null;
    for (const hingeAtStart of [true, false]) for (const side of [-1, 1]){
      const hg = hingeAtStart ? g0 : g1, ht = side < 0 ? t0 : t1, R = gap;
      let hit = 0, n = 0;
      for (let k = 2; k < 23; k++){
        const ang = k/24*Math.PI/2, dg = Math.cos(ang)*R*(hingeAtStart ? 1 : -1), dt = Math.sin(ang)*R*side;
        const x = horiz ? hg + dg : ht + dt, y = horiz ? ht + dt : hg + dg; n++;
        let ok = false; for (let e = -2; e <= 2 && !ok; e++) for (let f = -2; f <= 2 && !ok; f++) ok = at(soft, x + e, y + f) && !at(wall, x + e, y + f);   // 墙像素不算弧线
        hit += ok;
      }
      const sc = hit/n;
      if (!door || sc > door.score) door = {score:sc, hingeAtStart, side};
    }
    // 外墙缺口：缺口某一侧（离墙 1.5 倍墙厚处）多数采样点在室外
    const side = sd => { const t = sd < 0 ? t0 - T*1.5 : t1 + T*1.5, pts = [];
      for (const k of [.2, .35, .5, .65, .8]){ const g = g0 + gap*k; pts.push(horiz ? [g, t] : [t, g]); } return outFrac(pts); };
    const exterior = side(-1) >= .6 || side(1) >= .6;
    // 几何外圈（较宽松）：缺口某一侧再没有墙 —— 只用于「有窗线证据」的缺口
    const gm = (g0 + g1)/2;
    const outward = sd => !walls.some(o => o !== a && o !== b && (horiz
      ? o.x0 < gm && o.x1 > gm && (sd < 0 ? o.y1 <= t0 : o.y0 >= t1)
      : o.y0 < gm && o.y1 > gm && (sd < 0 ? o.x1 <= t0 : o.x0 >= t1)));
    const geoExt = exterior || outward(-1) || outward(1);
    // 两侧都是室外、空隙里也没有任何窗线 / 门弧：两段外墙之间的露天空隙（如入户门外的凹口），不是洞口
    //（线稿图里「室外」判断会从窗缝漏进房间，所以必须同时没有门窗特征）
    if (!solid && lines === 0 && door.score < .3 && side(-1) >= .6 && side(1) >= .6) return null;
    let kind;
    if (solid) kind = 'wall';
    // 门弧非常清晰的室内缺口就是门：薄隔墙上门框的两条边线也会被数成 2 条「窗线」
    else if (door.score >= .5 && gap >= T*2.5 && gap <= T*9 && (lines < 2 || (door.score >= .8 && !exterior))) kind = 'door';
    else if (lines >= 2 && gap <= T*16 && (geoExt || gap <= T*6)) kind = 'window';
    else if ((exterior && gap <= T*16) || (geoExt && gap <= T*9)) kind = 'window';
    else if (gap <= T*5) kind = 'open';
    else return null;                                                   // 大开口：开放空间，不封闭
    return Object.defineProperty({kind, rect, horiz, gap, exterior, hingeAtStart:door.hingeAtStart, side:door.side, doorScore:+door.score.toFixed(2), lines}, 'ends', {value:[a, b]});   // ends：缺口两头的墙（不可枚举，不进 JSON）
  }
  for (const a of walls) for (const atEnd of [true, false]){
    const horiz = a.horiz, th = horiz ? a.y1 - a.y0 : a.x1 - a.x0, t0a = horiz ? a.y0 : a.x0, t1a = horiz ? a.y1 : a.x1;
    // 从位置 p 沿轴向找最近的、横截面上挡住这段墙的墙
    const nearest = (p, skip) => {
      let b = null, best = Infinity;
      for (const o of walls){
        if (o === a || o === skip) continue;
        const ot0 = horiz ? o.y0 : o.x0, ot1 = horiz ? o.y1 : o.x1;
        if (!(ot0 < t1a - th*.25 && ot1 > t0a + th*.25)) continue;             // 横截面上要挡住这段墙
        const d = atEnd ? (horiz ? o.x0 : o.y0) - p : p - (horiz ? o.x1 : o.y1);
        if (d >= -1 && d < best){ best = d; b = o; }
      }
      return [b, best];
    };
    let p = atEnd ? (horiz ? a.x1 : a.y1) : (horiz ? a.x0 : a.y0), [b, best] = nearest(p, null);
    // 端头正顶在一道垂直墙上（丁字口）：门常紧挨着墙角开在那道墙的另一侧 → 越过它再找一次
    if (b && best <= 1 && b.horiz !== horiz){
      const far = atEnd ? (horiz ? b.x1 : b.y1) : (horiz ? b.x0 : b.y0), [b2, d2] = nearest(far, b);
      if (b2){ p = far; b = b2; best = d2; }
    }
    if (!b) continue;
    const gap = best;
    if (gap < Math.max(1.5*Tmin, 1.2*T) || gap > T*16) continue;
    const g0 = atEnd ? p : (horiz ? b.x1 : b.y1), g1 = g0 + gap;
    const colin = b.horiz === horiz;
    const t0 = colin ? Math.min(t0a, horiz ? b.y0 : b.x0) : t0a, t1 = colin ? Math.max(t1a, horiz ? b.y1 : b.x1) : t1a;
    const key = [horiz, Math.round(g0), Math.round(g1), Math.round(t0)].join();
    if (seenGap.has(key)) continue; seenGap.add(key);
    const o = classifyGap(a, b, horiz, g0, g1, t0, t1); if (o) openings.push(o);
  }
  // 错开的两段平行墙之间的门：一段墙的端头和另一段平行墙的端头在轴向上重叠（相差不到 1.5 倍墙厚）、
  // 横向相距 2.5–9 倍墙厚、中间没有墙 → 两个端头之间是一个垂直方向的缺口（门紧贴墙角时常见）；只认有清晰门弧的
  for (const a of walls) for (const atEnd of [true, false]) for (const b of walls){
    if (b === a || b.horiz !== a.horiz) continue;
    const h = a.horiz, th = h ? a.y1 - a.y0 : a.x1 - a.x0, E = atEnd ? (h ? a.x1 : a.y1) : (h ? a.x0 : a.y0), bs = atEnd ? (h ? b.x0 : b.y0) : (h ? b.x1 : b.y1);
    if (atEnd ? !(bs >= E - th*1.5 && bs < E - 1) : !(bs <= E + th*1.5 && bs > E + 1)) continue;
    const above = h ? b.y1 <= a.y0 : b.x1 <= a.x0, below = h ? b.y0 >= a.y1 : b.x0 >= a.x1; if (!above && !below) continue;
    let g0 = above ? (h ? b.y1 : b.x1) : (h ? a.y1 : a.x1), g1 = above ? (h ? a.y0 : a.x0) : (h ? b.y0 : b.x0); const G0 = g0, G1 = g1;
    const t0 = Math.min(E, bs), t1 = Math.max(E, bs);
    // 两头已经是墙像素的部分（太短、没成为墙段的墙垛）去掉，剩下的才是门洞
    const wallRow = g => { let k = 0; for (let t = Math.ceil(t0); t < t1; t++) k += h ? at(wall, t, g) : at(wall, g, t); return k >= (t1 - t0)*.6; };
    while (g1 - g0 > 2 && wallRow(g0)) g0++;
    while (g1 - g0 > 2 && wallRow(g1 - 1)) g1--;
    if (g1 - g0 < T*2.5 || g1 - g0 > T*9) continue;
    const rect = h ? [t0, g0, t1, g1] : [g0, t0, g1, t1];
    if (walls.some(o => o !== a && o !== b && o.x0 < rect[2] && o.x1 > rect[0] && o.y0 < rect[3] && o.y1 > rect[1])) continue;
    if (openings.some(o => o.rect[0] < rect[2] && o.rect[2] > rect[0] && o.rect[1] < rect[3] && o.rect[3] > rect[1])) continue;
    const o = classifyGap(a, b, !h, g0, g1, t0, t1); if (o?.kind !== 'door') continue;
    openings.push(o);
    // 去掉的墙垛补成短墙段，门洞两头才是封住的
    for (const [p, q] of [[G0, g0], [g1, G1]]) if (q - p >= 1) walls.push(h ? {x0:t0, y0:p, x1:t1, y1:q, horiz:false, len:q - p, th:t1 - t0, fill:1} : {x0:p, y0:t0, x1:q, y1:t1, horiz:true, len:q - p, th:t1 - t0, fill:1});
  }
  // ---------- 家具描边：浅色「墙」两端都要接到深色墙或门窗上，否则是家具 ----------
  // 户型图里墙几乎都是近黑色；床、沙发、电视柜的深灰描边也会通过阈值，被切成「墙」。
  // 判据：比这张图的墙色明显浅（参考亮度 +40 以上），且至少一头悬空（不接深色墙，也不接识别出的门 / 窗）→ 家具。
  // 放在门窗识别之后做：隔墙常常止于门口，门弧已经被认成「门」，这一头就算接上了。
  if (!opt.keepFurniture && walls.length){
    const lum = w => { const v = []; for (let y = Math.ceil(w.y0); y < w.y1; y++) for (let x = Math.ceil(w.x0); x < w.x1; x++) v.push(gray[y*W + x]); v.sort((p, q) => p - q); return v[v.length >> 1] ?? 255; };
    walls.forEach(w => w.lum = lum(w));
    const byLum = [...walls].sort((p, q) => p.lum - q.lum), totLen = walls.reduce((t, w) => t + w.len, 0);
    let acc = 0, L0 = byLum[0].lum; for (const w of byLum){ acc += w.len; if (acc >= totLen*.4){ L0 = w.lum; break; } }
    const dark = w => w.lum <= Math.max(60, L0 + 40);
    const box = r => Array.isArray(r) ? {x0:r[0], y0:r[1], x1:r[2], y1:r[3]} : r;
    const touch = (a, b, d = 0) => { a = box(a); b = box(b); return a.x0 - d <= b.x1 && b.x0 - d <= a.x1 && a.y0 - d <= b.y1 && b.y0 - d <= a.y1; };
    const endBox = (w, start) => { const e = Math.max(2, Tmin*.6); return w.horiz ? (start ? {x0:w.x0 - e, x1:w.x0 + e, y0:w.y0 - e, y1:w.y1 + e} : {x0:w.x1 - e, x1:w.x1 + e, y0:w.y0 - e, y1:w.y1 + e})
                                                                   : (start ? {x0:w.x0 - e, x1:w.x1 + e, y0:w.y0 - e, y1:w.y0 + e} : {x0:w.x0 - e, x1:w.x1 + e, y0:w.y1 - e, y1:w.y1 + e}); };
    // 可靠的门窗：窗；门弧清晰、且至少一侧连着深色墙的门（床头圆灯之类在两根家具线之间被认成的「门」不算）
    const sure = openings.filter(o => o.kind === 'window' || (o.kind === 'door' && o.doorScore >= .6 && walls.some(w => dark(w) && touch(o.rect, w, 1))));
    let cur = walls;
    for (let changed = true; changed;){
      changed = false;
      cur = cur.filter(w => {
        if (dark(w)) return true;
        const ok = [true, false].every(st => { const e = endBox(w, st); return cur.some(o => o !== w && dark(o) && touch(e, o)) || sure.some(o => touch(e, o.rect)); });
        if (!ok) changed = true; return ok;
      });
    }
    const removed = totLen - cur.reduce((t, w) => t + w.len, 0);
    if (removed > 0 && removed <= totLen*.3){                          // 删掉的超过 30% 说明判断失灵（如整张图的墙都偏浅），不删
      const gone = walls.filter(w => !cur.includes(w));
      walls = cur;
      // 挂在被删墙段上的洞口（家具之间补出来的「缝」/「门」）一起删：缺口的某一头就是被删的家具线，或者只挂在被删墙段上
      for (let i = openings.length - 1; i >= 0; i--){
        const o = openings[i];
        if (o.ends.some(e => gone.includes(e)) || (gone.some(g => touch(o.rect, g, 1)) && walls.filter(w => touch(o.rect, w, 1)).length < 2)) openings.splice(i, 1);
      }
    }
  }
  return {W, H, threshold:thr, thickness:T, thinWall:Tmin, walls:walls.map(w => ({x0:w.x0, y0:w.y0, x1:w.x1, y1:w.y1, horiz:w.horiz})), openings, bbox, wallMask:wall, softMask:soft};
}

/** 房间平均颜色（用于猜房间类型：木地板 → 卧室，灰色瓷砖 → 厨卫） */
export function sampleColor(img, poly, step = 3){
  const {width:W, data} = img;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of poly){ x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  let r = 0, g = 0, b = 0, n = 0, white = 0, all = 0;
  for (let y = Math.ceil(y0); y < y1; y += step) for (let x = Math.ceil(x0); x < x1; x += step){
    const k = (y*W + x)*4, l = .299*data[k] + .587*data[k+1] + .114*data[k+2];
    all++; if (l > 243) white++;
    if (l < 120 || l > 252) continue;                                  // 跳过文字 / 线条和纯白
    r += data[k]; g += data[k+1]; b += data[k+2]; n++;
  }
  // 第 5 项：近白像素占比（线稿图房间没有填色，占比很高）
  return n ? [r/n, g/n, b/n, n, all ? white/all : 0] : null;
}
