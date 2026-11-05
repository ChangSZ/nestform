/* =====================================================================
 *  导出「方案展示图」：与页面同一套视觉（深色标题栏 + 点阵画布 + 玻璃卡片）
 *   - 平面图：高清平面 + 右侧房间图例 / 材料 / 预算 + 比例尺、指北
 *   - 效果图：3D 离屏 2× 渲染 + 房间标签 + 与平面展示图一致的标题栏
 * ===================================================================== */
import {tr, nm} from './i18n.js';
import {svg, state, P} from './store.js';
import {MATS, WALL_MATS} from './data.js';
import {area} from './geom.js';
import {texCanvas} from './materials.js';
import {matPrice, furnPrice, fmtRange} from './pricing.js';
import {roomFaces} from './faces.js';

const FONT = 'Inter,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';
const MONO = '"JetBrains Mono",ui-monospace,Menlo,monospace';
const C = {bg:'#e6ebf1', ink:'#162032', muted:'#5d6b80', glass:'#14181f', glass2:'#1d222b', text:'#eef1f6', text2:'#b8c0cf', accent:'#6b8afd', line:'rgba(255,255,255,.08)'};

const font = (w, px, mono) => `${w} ${px}px ${mono ? MONO : FONT}`;
function rr(g, x, y, w, h, r){ g.beginPath(); g.roundRect(x, y, w, h, r); }
function dots(g, W, H, step = 36){ g.fillStyle = C.bg; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(22,32,50,.09)'; for (let y = step/2; y < H; y += step) for (let x = step/2; x < W; x += step){ g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); } }
const today = () => new Date().toISOString().slice(0, 10);
const hM = () => (P().height || 2800)/1000;
const title = () => P().title ? tr(P().title, P().titleEn || P().title) : tr('三室一厅两卫', '3BR 1LR 2BA');
const netArea = () => P().rooms.filter(r => r.counted !== false).reduce((a, r) => a + area(r.poly), 0);

/** 顶部标题栏 */
function header(g, W, sub){
  const H = 190;
  g.fillStyle = C.glass; g.fillRect(0, 0, W, H);
  // logo
  const lx = 70, ly = 50; g.fillStyle = C.accent; rr(g, lx, ly, 90, 90, 26); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(lx + 27, ly + 66); g.lineTo(lx + 27, ly + 33); g.lineTo(lx + 45, ly + 21); g.lineTo(lx + 63, ly + 33); g.lineTo(lx + 63, ly + 66); g.lineTo(lx + 51, ly + 66); g.lineTo(lx + 51, ly + 48); g.lineTo(lx + 39, ly + 48); g.lineTo(lx + 39, ly + 66); g.closePath(); g.fill();
  g.fillStyle = C.text; g.font = font(700, 58); g.textBaseline = 'alphabetic'; g.fillText(title(), lx + 125, ly + 52);
  g.fillStyle = C.text2; g.font = font(400, 30); g.fillText(sub, lx + 127, ly + 96);
  g.textAlign = 'right'; g.fillStyle = C.text; g.font = font(700, 38); g.fillText(tr('栖构 Nestform', 'Nestform'), W - 70, ly + 44);
  g.fillStyle = C.text2; g.font = font(400, 26); g.fillText(tr('户型设计 · 方案展示', 'Floor plan · presentation'), W - 70, ly + 86); g.textAlign = 'left';
  return H;
}
/** 底栏：日期 + 说明 */
function footer(g, W, H, note){
  g.fillStyle = C.muted; g.font = font(400, 24);
  g.fillText(note, 70, H - 40);
  g.textAlign = 'right'; g.fillText(`${tr('导出于', 'Exported')} ${today()} · ${tr('价格为市场参考价，仅供预算参考', 'Prices are market references for budgeting only')}`, W - 70, H - 40); g.textAlign = 'left';
}
/** 预算（与检查器总览同口径） */
function budget(){
  const B = [0, 0], add = (p, mul) => { if (p){ B[0] += p.low*mul; B[1] += p.high*mul; } };
  const byMat = {}, byWall = {};
  P().rooms.forEach(r => { const m = state.rooms[r.id].mat; byMat[m] = (byMat[m] || 0) + area(r.poly); });
  P().rooms.filter(r => r.counted !== false).forEach(r => roomFaces(r).forEach(f => byWall[f.mat] = (byWall[f.mat] || 0) + f.len/1000*hM()));
  Object.entries(byMat).forEach(([m, a]) => add(matPrice(m), a*1.05));
  Object.entries(byWall).forEach(([w, a]) => add(matPrice(w), a*1.05));
  state.furniture.forEach(f => add(furnPrice(f, P().height || 2800), 1));
  return {B, byMat, byWall};
}
/** 平面图 SVG → Image（高分辨率） */
export function planImage(W){
  const b = P().bounds, H = Math.round(W*b.h/b.w), clone = svg.cloneNode(true);
  clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`); clone.setAttribute('width', W); clone.setAttribute('height', H);
  clone.querySelector('#gSel').innerHTML = ''; clone.querySelector('#gGrid').innerHTML = ''; clone.querySelector('#gMeasure').innerHTML = '';
  // 导出时线条加粗一档（屏幕上的 1px 在大图里太细）
  clone.querySelectorAll('[vector-effect="non-scaling-stroke"]').forEach(el => { const w = +(el.getAttribute('stroke-width') || 1); el.setAttribute('stroke-width', w*2.2); });
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res({img, W, H}); img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  });
}

/** 平面图展示图 */
export async function exportPlanSheet(download){
  const PW = 2900, side = 860, pad = 70;
  const {img, H:PH} = await planImage(PW);
  const rooms = P().rooms.filter(r => r.counted !== false), {B} = budget();
  const listH = 150 + rooms.length*78 + 430;
  const bodyH = Math.max(PH + 2*pad, listH + 2*pad), W = PW + side + pad*3, top = 190, H = top + bodyH + 110;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  dots(g, W, H);
  header(g, W, tr(`套内使用面积约 ${netArea().toFixed(2)} m² · 层高 ${hM()} m · 尺寸单位 mm`, `Net area ≈ ${netArea().toFixed(2)} m² · Ceiling ${hM()} m · Units: mm`));
  // 平面卡片
  g.save(); g.shadowColor = 'rgba(10,14,22,.16)'; g.shadowBlur = 40; g.shadowOffsetY = 12;
  g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, pad, top + pad, PW, PH, 28); g.fill(); g.restore();
  g.drawImage(img, pad, top + pad, PW, PH);
  // 右侧图例卡片（深色玻璃）
  const sx = pad*2 + PW, sy = top + pad, sh = Math.min(bodyH - 2*pad, listH);
  g.save(); g.shadowColor = 'rgba(10,14,22,.28)'; g.shadowBlur = 50; g.shadowOffsetY = 16; g.fillStyle = C.glass; rr(g, sx, sy, side, sh, 32); g.fill(); g.restore();
  let y = sy + 80;
  g.fillStyle = C.text; g.font = font(700, 36); g.fillText(tr('房间', 'Rooms'), sx + 50, y);
  g.fillStyle = C.text2; g.font = font(400, 24); g.textAlign = 'right'; g.fillText(tr('地面 · 墙面 · 面积', 'Floor · walls · area'), sx + side - 50, y); g.textAlign = 'left';
  y += 40;
  for (const r of rooms){
    const st = state.rooms[r.id];
    g.save(); rr(g, sx + 50, y + 8, 56, 56, 12); g.clip(); g.drawImage(texCanvas(st.mat), sx + 50, y + 8, 56, 56); g.restore();
    g.save(); rr(g, sx + 114, y + 8, 22, 56, 8); g.clip(); g.drawImage(texCanvas(st.wall || 'paint_white'), sx + 114, y + 8, 22, 56); g.restore();
    g.fillStyle = C.text; g.font = font(600, 30); g.fillText(nm(st.name), sx + 158, y + 38);
    g.fillStyle = C.text2; g.font = font(400, 21); g.fillText(`${nm(MATS[st.mat]?.name || '')} · ${nm(WALL_MATS[st.wall]?.name || '')}`, sx + 158, y + 64);
    g.fillStyle = C.text; g.font = font(600, 28, true); g.textAlign = 'right'; g.fillText(`${area(r.poly).toFixed(2)} m²`, sx + side - 50, y + 46); g.textAlign = 'left';
    g.fillStyle = C.line; g.fillRect(sx + 50, y + 76, side - 100, 2);
    y += 78;
  }
  y += 40;
  // 合计卡
  const grad = g.createLinearGradient(sx + 50, y, sx + side - 50, y + 120); grad.addColorStop(0, 'rgba(107,138,253,.32)'); grad.addColorStop(1, 'rgba(160,102,245,.26)');
  g.fillStyle = grad; rr(g, sx + 50, y, side - 100, 130, 22); g.fill();
  g.fillStyle = C.text2; g.font = font(400, 24); g.fillText(tr('套内使用面积', 'Net floor area'), sx + 80, y + 50);
  g.fillStyle = '#fff'; g.font = font(700, 40, true); g.fillText(`${netArea().toFixed(2)} m²`, sx + 80, y + 102);
  y += 160;
  g.fillStyle = 'rgba(255,255,255,.05)'; rr(g, sx + 50, y, side - 100, 200, 22); g.fill();
  g.fillStyle = C.text2; g.font = font(400, 24); g.fillText(tr('预算估算（地面 + 墙面 + 定制柜 / 家电）', 'Budget (floors + walls + cabinets / appliances)'), sx + 80, y + 50);
  g.fillStyle = '#8ea6ff'; g.font = font(700, 44, true); g.fillText(fmtRange(...B), sx + 80, y + 112);
  g.fillStyle = C.text2; g.font = font(400, 20); g.fillText(tr('主流品牌中档产品市场参考价，含铺贴 / 施工人工', 'Mid-market reference prices incl. labor'), sx + 80, y + 160);
  footer(g, W, H, P().rooms.some(r => r.counted === false) ? tr('* 飘窗不计入使用面积；面积按墙体内净尺寸计算', '* Bay windows excluded; areas use net inner dimensions') : tr('* 面积按墙体内净尺寸计算', '* Areas use net inner dimensions'));
  cv.toBlob(b => download(tr('栖构-平面方案', 'nestform-plan') + '.png', b), 'image/png');
}

/** 效果图：shot = {canvas, labels:[{text, sub, x, y}]}（由 3D 模块离屏渲染提供） */
export function export3DSheet(shot, download){
  const {canvas:src, labels} = shot, pad = 0, top = 190, W = src.width, H = top + src.height + 110;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  dots(g, W, H);
  header(g, W, tr(`3D 效果 · 套内 ${netArea().toFixed(2)} m² · 层高 ${hM()} m`, `3D view · net ${netArea().toFixed(2)} m² · ceiling ${hM()} m`));
  g.drawImage(src, pad, top);
  // 房间标签（与页面一致的深色胶囊）
  for (const l of labels){
    const x = l.x*src.width, y = top + l.y*src.height;
    g.font = font(600, 30); const tw = g.measureText(l.text).width; g.font = font(400, 24, true); const sw = g.measureText(l.sub).width;
    const w = tw + sw + 56, h = 52;
    g.fillStyle = 'rgba(18,21,27,.82)'; rr(g, x - w/2, y - h/2, w, h, 26); g.fill(); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#fff'; g.font = font(600, 30); g.fillText(l.text, x - w/2 + 22, y + 10);
    g.fillStyle = '#aab3c2'; g.font = font(400, 24, true); g.fillText(l.sub, x - w/2 + 30 + tw, y + 9);
  }
  footer(g, W, H, tr('3D 示意，材质与家具按方案实时生成', '3D preview generated from the plan'));
  cv.toBlob(b => download(tr('栖构-3D效果图', 'nestform-3d') + '.png', b), 'image/png');
}
