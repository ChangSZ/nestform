/* =====================================================================
 *  户型图文字识别：读出房间名与面积标注（如「厨房」「4.3㎡」），用来给房间命名、校准比例尺。
 *  做法：先在像素上找出「文字行」（深色、字号大小的连通块按行聚合），再逐行交给 OCR ——
 *  比整图直接识别准得多（地板纹理、家具图例、门弧都不会混进来）。
 *  OCR 引擎 tesseract.js（Apache-2.0）+ 中文模型，全部从本站 ./ocr/ 加载（见 scripts/ocr-assets.mjs），
 *  图片不离开浏览器；只在导入户型图时按需加载，加载失败时返回 null，识别退回按颜色 / 面积猜。
 * ===================================================================== */
let workerP = null;
function worker(){
  return workerP ??= import('tesseract.js').then(async T => {
    // 资源目录按「本模块的位置」定位，而不是当前页面：开发时模块在 /src/import/，构建后在 assets/ 下（与 ocr/ 同级）
    const base = import.meta.env?.DEV ? new URL('/ocr/', location.origin).href : new URL('../ocr/', import.meta.url).href;
    const w = await T.createWorker('chi_sim', 1, {workerPath:base + 'worker.min.js', corePath:base, langPath:base + 'lang', gzip:true, workerBlobURL:false});
    await w.setParameters({tessedit_pageseg_mode:'7'});                // 单行文本
    return w;
  }).catch(e => { workerP = null; throw e; });
}
export async function disposeOCR(){ if (workerP){ const w = await workerP.catch(() => null); workerP = null; await w?.terminate(); } }

/* ---------- 文本 → 房间名 / 面积 ---------- */
/** 房间名词典：OCR 结果 → 规范名（长词在前） */
const NAMES = [
  ['主卧', '主卧'], ['次卧', '次卧'], ['儿童房', '儿童房'], ['老人房', '老人房'], ['客卧', '客卧'], ['卧室', '卧室'], ['书房', '书房'],
  ['客餐厅', '客餐厅'], ['起居室', '客厅'], ['客厅', '客厅'], ['餐厅', '餐厅'], ['门厅', '门厅'], ['玄关', '玄关'],
  ['主卫', '主卫'], ['客卫', '客卫'], ['卫生间', '卫生间'], ['洗手间', '卫生间'], ['卫浴', '卫生间'],
  ['厨房', '厨房'], ['生活阳台', '生活阳台'], ['景观阳台', '阳台'], ['阳台', '阳台'], ['露台', '露台'], ['花园', '花园'],
  ['飘窗', '飘窗'], ['过道', '过道'], ['走廊', '过道'], ['衣帽间', '衣帽间'], ['储藏', '储物间'], ['储物', '储物间'], ['储', '储物间'], ['设备平台', '设备平台'], ['洗衣', '洗衣房'],
];
/** 单字线索：OCR 只认出一半时（如「卧□」「□房」）也能猜中 */
const HINTS = [[/卧|^.?室$/, '卧室'], [/厨/, '厨房'], [/卫|浴|厕/, '卫生间'], [/阳/, '阳台'], [/客/, '客厅'], [/餐/, '餐厅'], [/书/, '书房'], [/玄/, '玄关'], [/道|廊/, '过道'], [/衣帽/, '衣帽间'], [/储/, '储物间']];
const FIX = [[/卧窒|卧宝|卧至|卧圭|卧垒|耻室|卧宣|臣卜室|卧窭/g, '卧室'], [/厨防|厨方|厨旁/g, '厨房'], [/卫牛|卫生问|卫生闾|卫生阆/g, '卫生间'], [/阳合|阳囗/g, '阳台'], [/过遣|过逍|过適/g, '过道'], [/门斤|门广/g, '门厅'], [/客斤|客广/g, '客厅'], [/餐斤|餐广/g, '餐厅']];
const clean = s => FIX.reduce((t, [re, to]) => t.replace(re, to), s.replace(/\s+/g, ''));
/** 是否完整命中词典（而不是靠单字猜的） */
export const fullName = text => { const t = clean(text); return NAMES.some(([k]) => t.includes(k)); };
export function roomName(text){
  const t = clean(text); if (!/[一-龥]/.test(t)) return null;
  // 带编号的保留编号：卧室A / 卧室B / 次卧1 …
  const suf = k => { const m = t.slice(t.indexOf(k) + k.length).match(/^[A-Da-d](?![A-Za-z])/); return m ? m[0].toUpperCase() : ''; };
  for (const [k, v] of NAMES) if (t.includes(k)) return v + suf(k);
  if (t.replace(/[^一-龥]/g, '').length > 3) return null;            // 一长串乱码里碰巧有个「卫」字 —— 不算
  const zh = t.replace(/[^一-龥]/g, '');
  const tail = (t.match(/[A-Da-d]$/) || [''])[0].toUpperCase();
  if (zh.length >= 1 && zh.length <= 4) for (const [re, v] of HINTS) if (re.test(zh)) return v + (v === '卧室' ? tail : '');
  return null;
}
/** 面积标注：4.3㎡ / 4.3m² / 4.3m2 / 4.3平 … → m²（「m」常被认成 n / rn） */
export function areaOf(text){
  const t = clean(text).replace(/[，,。·]/g, '.').replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
  let m = t.match(/(\d{1,3}(?:\.\d{1,2})?)\s*(?:㎡|m|rn|n|平|M)/), v = m ? +m[1] : NaN;
  if (!m && (m = t.match(/^\D?(\d{1,2}\.\d{1,2})\D{0,3}$/))) v = Math.floor(+m[1]*10)/10;     // 没认出单位：「8.37」多半是「8.3㎡」把 ㎡ 读成了 7
  return v >= .5 && v <= 300 ? v : null;
}

/* ---------- 找文字行 ---------- */
/** 文字像素：够暗；JPEG 在彩色地板上会给文字镶色边，所以按「暗度 + 有限饱和度」判断 */
const isInk = (r, g, b, k = 1) => { const L = .299*r + .587*g + .114*b, ch = Math.max(r, g, b) - Math.min(r, g, b); return L < 70*k || (L < 125*k && ch < 70); };
/**
 * 在图里找出文字行的像素框 [{box:[x0,y0,x1,y1], h}]
 * @param img     ImageData
 * @param block   需要排除的像素（墙体掩码等），可空
 */
export function findTextLines(img, block, sep = block){
  const {width:W, height:H, data} = img, ink = new Uint8Array(W*H);
  for (let i = 0, p = 0; i < W*H; i++, p += 4) if (!block?.[i] && isInk(data[p], data[p + 1], data[p + 2])) ink[i] = 1;
  // 连通块（8 邻域）
  const lab = new Int32Array(W*H), comps = [], st = [];
  for (let s = 0; s < W*H; s++){
    if (!ink[s] || lab[s]) continue;
    const id = comps.length + 1; let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0; lab[s] = id; st.push(s);
    while (st.length){
      const i = st.pop(), x = i % W, y = (i - x)/W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy*W + xx; if (ink[j] && !lab[j]){ lab[j] = id; st.push(j); }
      }
    }
    comps.push({x0, y0, x1:x1 + 1, y1:y1 + 1, n});
  }
  // 字号上限约为图短边的 4.5%；太小的是噪点；细长的线（尺寸线、门弧、窗线）不要
  const HM = Math.max(14, Math.min(W, H)*.045);
  // 门弧 / 曲线碎片很稀疏（填充率 < 12%），文字笔画密得多 —— 排除掉，免得把相邻的两行字粘成一块
  const glyph = comps.filter(c => { const w = c.x1 - c.x0, h = c.y1 - c.y0; return h <= HM && w <= HM*1.4 && Math.max(w, h) >= 3 && c.n >= 4 && c.n <= w*h*.85 && !(w > h*6) && !(h > w*8 && h > HM*.6) && !(w >= 8 && h >= 8 && c.n < w*h*.12); });
  // 同一行：竖向重叠 ≥ 50%、横向间隔 ≤ 0.9 倍字高 → 合并（并查集）
  glyph.sort((a, b) => a.x0 - b.x0);
  // 墙要竖着贯穿两字之间的整个字高（上 / 中 / 下三行都碰到墙）才算隔开，零星的墙像素不算
  const walled = (xa, xb, ya, yb) => [.2, .5, .8].every(t => { const y = Math.round(ya + (yb - ya)*t); for (let x = xa; x < xb; x++) if (sep[y*W + x]) return true; return false; });
  const par = glyph.map((_, i) => i), f = i => par[i] === i ? i : (par[i] = f(par[i]));
  for (let i = 0; i < glyph.length; i++) for (let j = i + 1; j < glyph.length; j++){
    const a = glyph[i], b = glyph[j], ha = a.y1 - a.y0, hb = b.y1 - b.y0, hm = Math.max(ha, hb);
    if (b.x0 - a.x1 > HM*1.5) break;
    if (b.x0 - a.x1 > hm*.9) continue;
    const ov = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (!(ov >= Math.min(ha, hb)*.5 || (ov > 0 && Math.abs((a.y0 + a.y1) - (b.y0 + b.y1)) < hm*.6))) continue;
    if (sep && walled(a.x1, b.x0, Math.max(a.y0, b.y0), Math.min(a.y1, b.y1))) continue;   // 中间隔着墙：两间房的字（如「28.3㎡」和隔壁的「储」）
    par[f(j)] = f(i);
  }
  const groups = new Map();
  glyph.forEach((g, i) => { const r = f(i), o = groups.get(r); if (!o) groups.set(r, {x0:g.x0, y0:g.y0, x1:g.x1, y1:g.y1, k:1}); else { o.x0 = Math.min(o.x0, g.x0); o.y0 = Math.min(o.y0, g.y0); o.x1 = Math.max(o.x1, g.x1); o.y1 = Math.max(o.y1, g.y1); o.k++; } });
  return [...groups.values()]
    .map(o => ({box:[o.x0, o.y0, o.x1, o.y1], h:o.y1 - o.y0, k:o.k}))
    .filter(l => l.h >= 7 && l.h <= HM*1.15 && ((l.box[2] - l.box[0]) >= l.h*1.2 && l.k >= 2 || (l.k === 1 && l.box[2] - l.box[0] >= l.h*.75)));   // 单字（如「储」）也要
}

/** 区域里「文字」的外框：墨迹连通块里去掉碰到区域边缘的（墙边、门线）和细长的线，剩下的合起来；没有则 null */
function inkBox(img, [x0, y0, x1, y1], dk){
  x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0)); x1 = Math.min(img.width, Math.round(x1)); y1 = Math.min(img.height, Math.round(y1));
  const w = x1 - x0, h = y1 - y0, d = img.data; if (w < 4 || h < 4) return null;
  const ink = new Uint8Array(w*h), seen = new Uint8Array(w*h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){ const p = ((y0 + y)*img.width + x0 + x)*4; ink[y*w + x] = isInk(d[p], d[p + 1], d[p + 2], dk); }
  let bx = null, n = 0;
  for (let s = 0; s < w*h; s++){
    if (!ink[s] || seen[s]) continue;
    const st = [s]; seen[s] = 1; let a = w, b = h, c = 0, e = 0, k = 0;
    while (st.length){ const i = st.pop(), x = i % w, y = (i - x)/w; k++; a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); e = Math.max(e, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const xx = x + dx, yy = y + dy, j = yy*w + xx; if (xx >= 0 && yy >= 0 && xx < w && yy < h && ink[j] && !seen[j]){ seen[j] = 1; st.push(j); } } }
    const cw = c - a + 1, ch = e - b + 1;
    if (a === 0 || b === 0 || c === w - 1 || e === h - 1 || cw > w*.8 || ch > h*.8 || cw > ch*6 || ch > cw*6) continue;
    n += k; bx = bx ? [Math.min(bx[0], a), Math.min(bx[1], b), Math.max(bx[2], c + 1), Math.max(bx[3], e + 1)] : [a, b, c + 1, e + 1];
  }
  if (!bx || n < 12 || bx[3] - bx[1] < 6) return null;
  return [bx[0] + x0, bx[1] + y0, bx[2] + x0, bx[3] + y0];
}

/** 把一行文字裁出来：黑字白底、留白、放大到字高约 48px（tesseract 最适合的字号） */
function lineCanvas(img, [x0, y0, x1, y1], h, dk = 1){
  const pad = Math.ceil(h*.25); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(img.width, x1 + pad); y1 = Math.min(img.height, y1 + pad);
  const w = x1 - x0, hh = y1 - y0, o = new ImageData(w, hh), d = img.data;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++){
    const p = ((y0 + y)*img.width + x0 + x)*4, q = (y*w + x)*4, v = dk ? (isInk(d[p], d[p + 1], d[p + 2], dk) ? 0 : 255) : Math.max(0, Math.min(255, Math.round((.299*d[p] + .587*d[p + 1] + .114*d[p + 2] - 60)*1.6)));   // dk=0：保留灰度（拉伸对比度），交给 OCR 自己二值化
    o.data[q] = o.data[q + 1] = o.data[q + 2] = v; o.data[q + 3] = 255;
  }
  const a = document.createElement('canvas'); a.width = w; a.height = hh; a.getContext('2d').putImageData(o, 0, 0);
  const k = Math.max(1, Math.min(5, 48/h)), c = document.createElement('canvas'); c.width = Math.round(w*k) + 32; c.height = Math.round(hh*k) + 32;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(a, 16, 16, w*k, hh*k);
  return c;
}

/**
 * 识别图中的文字行 → [{text, name, area, box, h}]；OCR 不可用时返回 null
 * @param img      ImageData
 * @param block    排除的像素（墙体），可空
 * @param inRoom   (cx, cy) => boolean，只识别落在房间里的行（省时间）；可空
 * @param hints    {sep, regions}（见 build.js ocrHints）：sep 墙体掩码（含浅色隔墙），文字行不跨墙合并；
 *                 regions 小房间内部 [[x0,y0,x1,y1]]，逐行没读到名字时整块再认一次
 */
export async function readLabels(img, block, inRoom, onProgress, {sep, regions = []} = {}){
  let w;
  try { w = await worker(); } catch(e){ console.warn('OCR unavailable', e); return null; }
  const lines = findTextLines(img, block, sep).map(l => ({...l, inside:!inRoom || inRoom((l.box[0] + l.box[2])/2, (l.box[1] + l.box[3])/2)}));
  // 字高中位数：明显更高的「行」其实是两行字被门弧等线条粘在一起了 → 按文本块识别
  const hs = lines.map(l => l.h).sort((a, b) => a - b), hMed = hs[hs.length >> 1] || 0;
  let psm = '7', wl = '';
  const mode = async (m, white = '') => { if (m !== psm || white !== wl){ psm = m; wl = white; await w.setParameters({tessedit_pageseg_mode:m, tessedit_char_whitelist:white}); } };
  const out = [];
  for (const [i, l] of lines.entries()){
    onProgress?.(i, lines.length);
    let text = '', name = null, area = null;
    const tall = hMed && l.h > hMed*1.6;
    await mode(tall ? '6' : '7');
    for (const dk of [1, .8, 1.25]){                                   // 没读出来就换个阈值再试（细笔画 / 粗笔画）
      const {data} = await w.recognize(lineCanvas(img, l.box, tall ? hMed : l.h, dk));
      text = (data.text || '').replace(/\s+/g, ''); name = roomName(text); area = areaOf(text);
      if (name || area || !l.inside) break;
    }
    // 数字再认一遍（只允许数字 / 小数点 / m）：中文模型读数字常把 8 认成 4、5 认成 3，限定字符集后准得多
    const numeric = !name && /\d/.test(text) && text.replace(/[^\d]/g, '').length >= Math.max(2, text.length*.4);
    if (numeric && !tall){
      await mode('7', l.inside ? '0123456789.m' : '0123456789');
      const {data} = await w.recognize(lineCanvas(img, l.box, l.h));
      const t2 = (data.text || '').replace(/\s+/g, '');
      if (l.inside){ const a2 = areaOf(t2.replace(/m.*$/, 'm')) ?? areaOf(t2); if (a2) { area = a2; text = t2; } }
      else if (/\d{3,5}/.test(t2)) text = t2;
      await mode('7');
    }
    const nums = name || area ? [] : (text.match(/\d{3,5}/g) || []).map(Number).filter(v => v >= 300 && v <= 30000);   // 尺寸标注（mm）
    if (name || area || nums.length) out.push({text, name, area, nums, full:!!name && fullName(text), box:l.box, h:l.h});
  }
  // 小房间里没读到名字（字太细、断成碎点，没能拼成文字行，如储物间里的单字「储」）→ 把房间内部整块当成一个词再认一次
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const r of regions){
    if (out.some(o => o.name && hit(o.box, r))) continue;                // 已经有名字了
    const bx = inkBox(img, r, 1.25); if (!bx || out.some(o => hit(o.box, bx))) continue;   // 是已读过的那行字（名字中心刚好落在区域外）
    for (const [m, dk] of [['10', 0], ['8', 0], ['10', 1.25], ['8', 1]]){
      await mode(m);
      const {data} = await w.recognize(lineCanvas(img, bx, bx[3] - bx[1], dk));
      const text = (data.text || '').replace(/\s+/g, ''), name = roomName(text);
      if (name && fullName(text)){ out.push({text, name, area:null, nums:[], full:true, box:bx, h:bx[3] - bx[1], region:true}); break; }
    }
  }
  await mode('7');
  return out;
}
