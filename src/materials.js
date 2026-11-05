/* =====================================================================
 *  地面 / 墙面材质贴图 —— 2D 与 3D 共用同一套 Canvas 画法
 *   - 3D：CanvasTexture，UV 单位为米，按 sx×sy 平铺
 *   - 2D：toDataURL 后作为 SVG <pattern> 的图片，按 sx×sy（mm）平铺
 * ===================================================================== */
import {MATS, WALL_MATS} from './data.js';

const PX_PER_M = 420;                                    // 贴图分辨率（每米像素），超过 1024 时压缩
const cache = new Map();

function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const tint = (h, k) => { const [r, g, b] = hex(h), f = v => Math.max(0, Math.min(255, Math.round(k > 1 ? v + (255 - v)*(k - 1) : v*k))); return `rgb(${f(r)},${f(g)},${f(b)})`; };
const noise = (g, W, H, R, a = .035, n = 1400) => { for (let k = 0; k < n; k++){ g.fillStyle = `rgba(0,0,0,${R()*a})`; g.fillRect(R()*W, R()*H, 2, 2); } };
const veins = (g, W, H, R, col, n = 5) => { g.strokeStyle = col; for (let k = 0; k < n; k++){ g.lineWidth = .8 + R()*2.4; g.beginPath(); g.moveTo(R()*W, 0); g.bezierCurveTo(R()*W, R()*H, R()*W, R()*H, R()*W, H); g.stroke(); } };
const grout = (g, W, H, col, cols = 1, rows = 1, w = 3) => { g.fillStyle = col; for (let i = 0; i < cols; i++) g.fillRect(W*i/cols, 0, w, H); for (let j = 0; j < rows; j++) g.fillRect(0, H*j/rows, W, w); };

/** 木地板：rows 行，每行若干块，接缝错开 */
function planks(g, W, H, R, base, rows, seams){
  const rh = H/rows;
  for (let r = 0; r < rows; r++){
    const js = seams[r % seams.length].map(f => f*W);
    let x0 = 0;
    [...js, W].forEach(x1 => {
      g.fillStyle = tint(base, .88 + R()*.22); g.fillRect(x0, r*rh, x1 - x0, rh);
      g.strokeStyle = tint(base, .78); g.globalAlpha = .33; g.lineWidth = 1.1;
      for (let k = 0; k < 6; k++){ const y = r*rh + 4 + R()*(rh - 8); g.beginPath(); g.moveTo(x0, y); for (let x = x0; x <= x1; x += 30) g.lineTo(x, y + Math.sin(x*.025 + k)*2); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = tint(base, .6); g.fillRect(x1 - 1.5, r*rh, 3, rh); x0 = x1;
    });
    g.fillStyle = tint(base, .6); g.fillRect(0, r*rh, W, 2.5);
  }
}

const PAINT = {
  wood:     (g, W, H, R) => planks(g, W, H, R, '#d6b58a', 2, [[2/3], [1/3]]),
  walnut:   (g, W, H, R) => planks(g, W, H, R, '#9a6f4b', 2, [[2/3], [1/3]]),
  greywood: (g, W, H, R) => planks(g, W, H, R, '#bab3a8', 2, [[.55], [.2, .85]]),
  bamboo:   (g, W, H, R) => planks(g, W, H, R, '#d8c08a', 2, [[.5], [.25, .75]]),
  chevron:  (g, W, H, R) => {                                         // 鱼骨拼：两列 45° 斜向木条
    const cw = W/2, n = 3, pitch = H/n;
    for (let c = 0; c < 2; c++){
      g.save(); g.beginPath(); g.rect(c*cw, 0, cw, H); g.clip();
      for (let k = -n - 2; k < n*3; k++){
        const y = k*pitch, dir = c ? -1 : 1;
        g.fillStyle = tint('#d1ad80', .86 + R()*.24);
        g.beginPath(); g.moveTo(c*cw, y); g.lineTo(c*cw + cw, y + dir*cw); g.lineTo(c*cw + cw, y + dir*cw + pitch); g.lineTo(c*cw, y + pitch); g.closePath(); g.fill();
        g.strokeStyle = tint('#d1ad80', .6); g.lineWidth = 2; g.stroke();
      }
      g.restore();
    }
    g.fillStyle = tint('#d1ad80', .58); g.fillRect(cw - 1, 0, 2, H);
  },
  tile800:  (g, W, H, R) => { g.fillStyle = '#ebe6dd'; g.fillRect(0, 0, W, H); noise(g, W, H, R); grout(g, W, H, '#cfc6b7'); },
  tile600:  (g, W, H, R) => { g.fillStyle = '#dfe3e0'; g.fillRect(0, 0, W, H); noise(g, W, H, R); grout(g, W, H, '#bfc6c1'); },
  antislip: (g, W, H, R) => { g.fillStyle = '#d3d8d4'; g.fillRect(0, 0, W, H); noise(g, W, H, R, .08, 2600); grout(g, W, H, '#aab2ac'); },
  slab:     (g, W, H, R) => { g.fillStyle = '#ecebe8'; g.fillRect(0, 0, W, H); veins(g, W, H, R, 'rgba(150,145,140,.18)', 3); grout(g, W, H, '#d8d5cf', 1, 1, 2); },
  marble:   (g, W, H, R) => { g.fillStyle = '#f2efe9'; g.fillRect(0, 0, W, H); veins(g, W, H, R, 'rgba(160,150,135,.35)', 6); grout(g, W, H, '#d9d2c4'); },
  checker:  (g, W, H) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){ g.fillStyle = (i + j) % 2 ? '#2f3237' : '#f1f1ee'; g.fillRect(i*W/2, j*H/2, W/2, H/2); } grout(g, W, H, '#9a9a96', 2, 2, 2); },
  encaustic:(g, W, H) => {                                            // 复古花砖：2×2 块，每块四叶花纹
    const t = W/2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++){
      const x = i*t, y = j*t, c = [x + t/2, y + t/2];
      g.fillStyle = '#e9dfc9'; g.fillRect(x, y, t, t);
      g.fillStyle = '#3f5f6e'; for (let k = 0; k < 4; k++){ g.beginPath(); g.ellipse(c[0] + Math.cos(k*Math.PI/2)*t*.2, c[1] + Math.sin(k*Math.PI/2)*t*.2, t*.17, t*.08, k*Math.PI/2, 0, 7); g.fill(); }
      g.fillStyle = '#b5563f'; g.beginPath(); g.arc(c[0], c[1], t*.09, 0, 7); g.fill();
      g.fillStyle = '#3f5f6e'; [[x, y], [x + t, y], [x, y + t], [x + t, y + t]].forEach(([px, py]) => { g.beginPath(); g.arc(px, py, t*.14, 0, 7); g.fill(); });
    }
    grout(g, W, H, '#cbbf9f', 2, 2, 2);
  },
  terrazzo: (g, W, H, R) => { g.fillStyle = '#e6dfd3'; g.fillRect(0, 0, W, H); const cs = ['#b9a58c', '#8fa3a0', '#c9b7a2', '#a88f76', '#7e8a86']; for (let k = 0; k < 170; k++){ g.fillStyle = cs[k % 5]; g.beginPath(); g.arc(R()*W, R()*H, 2 + R()*7, 0, 7); g.fill(); } },
  microcement:(g, W, H, R) => { g.fillStyle = '#c8c4bd'; g.fillRect(0, 0, W, H); for (let k = 0; k < 90; k++){ const r = 30 + R()*140, x = R()*W, y = R()*H, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${R() < .5 ? '255,255,255' : '90,85,80'},${.05 + R()*.07})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2*r, 2*r); } noise(g, W, H, R, .05); },
  carpet:   (g, W, H, R) => { g.fillStyle = '#c6bfd2'; g.fillRect(0, 0, W, H); noise(g, W, H, R, .09, 3000); },
  // ---------- 墙面 ----------
  wallpaper:(g, W, H, R) => { g.fillStyle = '#e8dec9'; g.fillRect(0, 0, W, H); g.fillStyle = '#d9caa9'; g.fillRect(W*.1, 0, W*.18, H); g.fillRect(W*.62, 0, W*.06, H); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(W*.34, 0, W*.02, H); noise(g, W, H, R, .03); },
  wp_floral:(g, W, H, R) => {                                          // 碎花：五瓣小花 + 叶片，错位排布
    g.fillStyle = '#f1e7d8'; g.fillRect(0, 0, W, H);
    const flower = (x, y, r, c) => { g.fillStyle = c; for (let k = 0; k < 5; k++){ const a = k*Math.PI*2/5; g.beginPath(); g.arc(x + Math.cos(a)*r, y + Math.sin(a)*r, r*.75, 0, 7); g.fill(); } g.fillStyle = '#f6d27a'; g.beginPath(); g.arc(x, y, r*.55, 0, 7); g.fill(); };
    const pts = [[.2, .2], [.7, .35], [.4, .7], [.9, .85], [.05, .95], [.95, .05]];
    pts.forEach(([u, v], i) => { const x = u*W, y = v*H; g.fillStyle = '#9db08a'; g.beginPath(); g.ellipse(x + W*.06, y + H*.05, W*.04, W*.015, .6, 0, 7); g.fill(); flower(x, y, W*.022, i % 2 ? '#d98a8a' : '#c7a4c9'); });
    noise(g, W, H, R, .02, 600);
  },
  wp_geo:   (g, W, H) => {                                              // 几何：菱形格 + 细线
    g.fillStyle = '#dde2e6'; g.fillRect(0, 0, W, H); g.strokeStyle = '#8a9aa8'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(W/2, 0); g.lineTo(W, H/2); g.lineTo(W/2, H); g.lineTo(0, H/2); g.closePath(); g.stroke();
    g.strokeStyle = 'rgba(138,154,168,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W/2, H*.18); g.lineTo(W*.82, H/2); g.lineTo(W/2, H*.82); g.lineTo(W*.18, H/2); g.closePath(); g.stroke();
    g.fillStyle = '#c9a96e'; g.beginPath(); g.arc(W/2, H/2, W*.02, 0, 7); g.fill();
  },
  wp_damask:(g, W, H) => {                                              // 大马士革：对称卷草纹（金色）
    g.fillStyle = '#dccaa6'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(150,118,60,.55)';
    const motif = (cx, cy, s) => {
      g.beginPath(); g.ellipse(cx, cy, s*.16, s*.32, 0, 0, 7); g.fill();
      [-1, 1].forEach(d => { g.beginPath(); g.ellipse(cx + d*s*.26, cy - s*.05, s*.12, s*.22, d*.6, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + d*s*.2, cy + s*.3, s*.08, s*.14, -d*.5, 0, 7); g.fill(); });
      g.beginPath(); g.moveTo(cx, cy - s*.5); g.lineTo(cx + s*.07, cy - s*.36); g.lineTo(cx - s*.07, cy - s*.36); g.fill();
    };
    motif(W/2, H*.5, W*.7); motif(0, 0, W*.5); motif(W, 0, W*.5); motif(0, H, W*.5); motif(W, H, W*.5);
  },
  wp_leaf:  (g, W, H, R) => {                                           // 植物叶子：龟背竹 / 长叶
    g.fillStyle = '#e4eadd'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++){
      const x = R()*W, y = R()*H, a = R()*Math.PI*2, L = W*(.12 + R()*.1);
      g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = k % 3 ? '#7f9d6f' : '#5f7f55';
      g.beginPath(); g.ellipse(0, 0, L, L*.36, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-L, 0); g.lineTo(L, 0); g.stroke(); g.restore();
    }
  },
  wp_plaid: (g, W, H) => {                                              // 格纹
    g.fillStyle = '#d9d0c3'; g.fillRect(0, 0, W, H);
    [['rgba(120,92,70,.25)', .12, .0], ['rgba(70,90,110,.18)', .05, .55], ['rgba(255,255,255,.35)', .02, .3]].forEach(([c, w, o]) => { g.fillStyle = c; g.fillRect(W*o, 0, W*w, H); g.fillRect(0, H*o, W, H*w); });
  },
  wp_star:  (g, W, H, R) => {                                           // 星空儿童墙纸
    g.fillStyle = '#b7cde2'; g.fillRect(0, 0, W, H);
    const star = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); for (let k = 0; k < 10; k++){ const a = -Math.PI/2 + k*Math.PI/5, rr = k % 2 ? r*.45 : r; g.lineTo(x + Math.cos(a)*rr, y + Math.sin(a)*rr); } g.closePath(); g.fill(); };
    for (let k = 0; k < 14; k++) star(R()*W, R()*H, W*(.012 + R()*.03), k % 4 ? '#ffffff' : '#ffd66b');
    g.fillStyle = '#fff6d6'; g.beginPath(); g.arc(W*.75, H*.25, W*.06, 0, 7); g.fill(); g.fillStyle = '#b7cde2'; g.beginPath(); g.arc(W*.78, H*.22, W*.055, 0, 7); g.fill();
  },
  wp_linen: (g, W, H, R) => {                                           // 肌理墙布：细密经纬纹
    g.fillStyle = '#ddd6cb'; g.fillRect(0, 0, W, H); g.globalAlpha = .18;
    for (let y = 0; y < H; y += 3){ g.fillStyle = R() < .5 ? '#a89f92' : '#fff'; g.fillRect(0, y, W, 1); }
    for (let x = 0; x < W; x += 4){ g.fillStyle = R() < .5 ? '#a89f92' : '#fff'; g.fillRect(x, 0, 1, H); }
    g.globalAlpha = 1; noise(g, W, H, R, .05, 1500);
  },
  woodpanel:(g, W, H, R) => { const n = 3; for (let i = 0; i < n; i++){ g.fillStyle = tint('#b08458', .88 + R()*.2); g.fillRect(i*W/n, 0, W/n, H); g.strokeStyle = tint('#b08458', .75); g.globalAlpha = .35; for (let k = 0; k < 5; k++){ const x = i*W/n + 6 + R()*(W/n - 12); g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= H; y += 30) g.lineTo(x + Math.sin(y*.02 + k)*2, y); g.stroke(); } g.globalAlpha = 1; } g.fillStyle = '#5a4128'; for (let i = 0; i < n; i++) g.fillRect(i*W/n, 0, 3, H); },
  walltile: (g, W, H, R) => { g.fillStyle = '#eef0f2'; g.fillRect(0, 0, W, H); noise(g, W, H, R, .02, 500); grout(g, W, H, '#c9cfd5', 1, 1, 3); },
  marblewall:(g, W, H, R) => { g.fillStyle = '#efede9'; g.fillRect(0, 0, W, H); veins(g, W, H, R, 'rgba(150,140,128,.3)', 5); grout(g, W, H, '#d9d4cb', 1, 1, 2); },
  brick:    (g, W, H, R) => { g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, W, H); const rows = 4, bh = H/rows; for (let r = 0; r < rows; r++){ const off = r % 2 ? W/4 : 0; for (let i = -1; i < 2; i++){ g.fillStyle = tint('#b0634a', .82 + R()*.3); g.fillRect(off + i*W/2 + 3, r*bh + 3, W/2 - 6, bh - 6); } } },
};
const paintFlat = c => (g, W, H, R) => { g.fillStyle = c; g.fillRect(0, 0, W, H); noise(g, W, H, R, .018, 900); };

/** kind：地面或墙面材质键；返回 Canvas（缓存） */
export function texCanvas(kind){
  if (cache.has(kind)) return cache.get(kind);
  const m = MATS[kind] || WALL_MATS[kind] || MATS.tile800;
  const k = Math.min(1, 1024/(Math.max(m.sx, m.sy)*PX_PER_M));
  const cv = document.createElement('canvas'); cv.width = Math.round(m.sx*PX_PER_M*k); cv.height = Math.round(m.sy*PX_PER_M*k);
  const g = cv.getContext('2d');
  (PAINT[kind] || paintFlat(m.sw))(g, cv.width, cv.height, rng(kind.length*977 + kind.charCodeAt(0)*31));
  cache.set(kind, cv);
  return cv;
}
const urls = new Map();
export const texURL = kind => { if (!urls.has(kind)) urls.set(kind, texCanvas(kind).toDataURL('image/jpeg', .85)); return urls.get(kind); };
export const matInfo = kind => MATS[kind] || WALL_MATS[kind];
