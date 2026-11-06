import {draftRect, wallOpts} from './walledit.js';
import {partOf} from './partitions.js';
import {isDem} from '../demolish.js';
import {wallRuns, faceMat, roomEdges} from '../faces.js';
import {isArc, arcOutline} from '../arcs.js';
import {drag} from './pointer.js';
import {getUnderlay} from '../import/underlay.js';
import {tr, nm} from '../i18n.js';

import {COARSE, $, state, ui, view, undoStack, redoStack, getF, ext, P} from '../store.js';
import {area, aabb, fmt} from '../geom.js';
import {furnSVG} from '../plan2d/symbols.js';
import {esc, renderPanel} from '../ui/panel.js';

/* ======================= 渲染 ======================= */
export const NOLABEL = ['plant','floorlamp','sidetable','barstool','beanbag'];
export function renderRooms(){
  let s = '';
  let clips = '';
  P().rooms.forEach(r => {
    const pts = r.poly.map(p=>p.join(',')).join(' '), st = state.rooms[r.id];
    s += `<polygon class="room" data-room="${r.id}" points="${pts}" fill="url(#m-${st.mat})"/>`;
    // 墙面材质：沿房间内侧画一圈 120mm 色带（描边居中 → 用房间形状裁掉外侧一半）
    // 墙面：只在真正贴墙的边段画 120mm 色带（每面墙可单独指定材质）；描边居中 → 用房间形状裁掉外侧一半
    if (r.counted !== false){
      clips += `<clipPath id="rc-${r.id}"><polygon points="${pts}"/></clipPath>`;
      s += `<g clip-path="url(#rc-${r.id})" pointer-events="none">` + wallRuns(r).map(({edge:e, t0, t1}) =>
        `<line x1="${e.a[0] + e.ux*t0}" y1="${e.a[1] + e.uy*t0}" x2="${e.a[0] + e.ux*t1}" y2="${e.a[1] + e.uy*t1}" stroke="url(#w-${faceMat(r.id, e.key)})" stroke-width="240" stroke-linecap="square"/>`).join('') + '</g>';
    }
  });
  s = `<defs>${clips}</defs>` + s;
  // 门槛：普通墙厚的洞口整块画；比普通墙厚得多的（如「单开门 + 上窗下柜」里 350mm 厚的门）只在中间画 120mm 宽的门槛，两端画门套线，
  // 免得整块灰色看起来像一截墙
  const sill = ([a,b,c,d]) => {
    const hz = c - a >= d - b, th = hz ? d - b : c - a, S = 'stroke="#a7b1bf" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"';
    if (th <= 160) return `<rect x="${a}" y="${b}" width="${c-a}" height="${d-b}" fill="#d6dce4" ${S}/>`;
    const m = hz ? (b + d)/2 : (a + c)/2, r = hz ? [a, m - 60, c, m + 60] : [m - 60, b, m + 60, d];
    return `<rect x="${r[0]}" y="${r[1]}" width="${r[2]-r[0]}" height="${r[3]-r[1]}" fill="#d6dce4" ${S}/>`
      + (hz ? `<path d="M${a} ${b}V${d}M${c} ${b}V${d}" fill="none" ${S}/>` : `<path d="M${a} ${b}H${c}M${a} ${d}H${c}" fill="none" ${S}/>`);
  };
  P().doors.forEach((d, i) => { if (!isDem('door', i)) s += sill(d.rect); }); P().slides.forEach((d, i) => { if (!isDem('slide', i)) s += sill(d.rect); });
  $('#gRooms').innerHTML = s;
}

export function renderFurn(){
  const g = $('#gFurn');
  g.setAttribute('display', ui.layers.furn ? 'inline' : 'none');
  g.innerHTML = state.furniture.map(f => {
    const fs = Math.max(80, Math.min(170, Math.min(f.w,f.d)*.2));
    const label = Math.min(f.w,f.d) >= 380 && !NOLABEL.includes(f.type)
      ? `<text transform="rotate(${-f.rot})" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="#334155" opacity=".8" pointer-events="none">${esc(nm(f.name))}</text>` : '';
    return `<g class="furn" data-fid="${f.id}" transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">${furnSVG(f.type,f.w,f.d,f.color,f.cab)}${label}</g>`;
  }).join('');
}

export function renderWalls(){
  $('#gWalls').innerHTML = P().walls.map((w,i) => {
    const [x0,y0,x1,y1,k] = w, id = 'w'+i, dem = state.demolished.includes(id);
    let fill = k==='b' ? (ui.layers.bearing ? '#e5484d' : '#1c2738') : k==='low' ? '#dfe4eb' : k==='e' ? '#5f6d82' : '#a3adbb';
    let ex = k==='low' ? 'stroke="#5f6d82" stroke-width="1" vector-effect="non-scaling-stroke"' : '';
    if (dem){ fill = 'rgba(247,107,21,.14)'; ex = 'stroke="#f76b15" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"'; }
    if (isArc(w)) return `<path class="wall" data-wall="${id}" d="M${arcOutline(w).map(p => p.map(Math.round).join(' ')).join('L')}Z" fill="${fill}" ${ex}/>`;   // 弧形墙
    return `<rect class="wall" data-wall="${id}" x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="${fill}" ${ex}/>`;
  }).join('');
}

export function renderOpenings(){
  const WS = 'stroke="#2f7fe0" stroke-width="1" vector-effect="non-scaling-stroke"';
  let s = '';
  const DEM = r => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]-r[0]}" height="${r[3]-r[1]}" fill="rgba(247,107,21,.14)" stroke="#f76b15" stroke-width="1.2" stroke-dasharray="5 3" vector-effect="non-scaling-stroke"/>`;   // 已拆除的洞口
  P().wins.forEach(([x0,y0,x1,y1], i) => {
    const w = x1-x0, h = y1-y0;
    if (isDem('win', i)){ s += DEM([x0,y0,x1,y1]); return; }
    const st = P().wins[i][5];
    // 整扇窗包在一个分组里：点到窗框线 / 中线也能选中
    if (st?.low === 'cabinet'){                                       // 单开门 + 上窗下柜：柜体 + 中线玻璃
      s += `<g class="op" data-win="${i}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#e6dccc" stroke="#7d6a52" stroke-width="1" vector-effect="non-scaling-stroke"/>`
        + (w >= h ? `<line x1="${x0}" y1="${y0+h/2}" x2="${x1}" y2="${y0+h/2}" ${WS}/>` : `<line x1="${x0+w/2}" y1="${y0}" x2="${x0+w/2}" y2="${y1}" ${WS}/>`) + '</g>';
      return;
    }
    s += `<g class="op" data-win="${i}"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#eef6ff" ${WS}/>`;
    if (w >= h) [1/3,2/3].forEach(t => s += `<line x1="${x0}" y1="${y0+h*t}" x2="${x1}" y2="${y0+h*t}" ${WS}/>`);
    else [1/3,2/3].forEach(t => s += `<line x1="${x0+w*t}" y1="${y0}" x2="${x0+w*t}" y2="${y1}" ${WS}/>`);
    s += '</g>';
  });
  const DS = 'stroke="#334155" stroke-width="1" vector-effect="non-scaling-stroke"';
  P().doors.forEach((d, i) => {
    if (isDem('door', i)){ s += DEM(d.rect); return; }
    const [hx,hy] = d.h, L = d.len, T = 40, [rx0,ry0,rx1,ry1] = d.rect;
    s += `<g class="op" data-door="${i}"><rect x="${rx0}" y="${ry0}" width="${rx1-rx0}" height="${ry1-ry0}" fill="transparent"/>`;
    if (d.style === 'arch'){                                           // 拱形门洞：无门扇，两侧虚线表示拱券投影
      const hz = (rx1-rx0) >= (ry1-ry0);
      s += hz ? `<path d="M${rx0} ${ry0}H${rx1}M${rx0} ${ry1}H${rx1}" stroke="#334155" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`
              : `<path d="M${rx0} ${ry0}V${ry1}M${rx1} ${ry0}V${ry1}" stroke="#334155" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
      s += `<text x="${(rx0+rx1)/2}" y="${(ry0+ry1)/2}" font-size="110" text-anchor="middle" dominant-baseline="central" fill="#5d6b80">${tr('拱','Arch')}</text></g>`;
      return;
    }
    const ox = hx + d.o[0]*L, oy = hy + d.o[1]*L, cx = hx + d.c[0]*L, cy = hy + d.c[1]*L;
    const sweep = d.o[0]*d.c[1] - d.o[1]*d.c[0] > 0 ? 1 : 0;
    const col = d.entry ? '#4c6ef5' : '#334155';
    s += `<polygon points="${hx},${hy} ${ox},${oy} ${ox+d.c[0]*T},${oy+d.c[1]*T} ${hx+d.c[0]*T},${hy+d.c[1]*T}" fill="#fff" stroke="${col}" stroke-width="${d.entry?1.8:1}" vector-effect="non-scaling-stroke"/>`;
    s += `<path d="M${ox} ${oy}A${L} ${L} 0 0 ${sweep} ${cx} ${cy}" fill="none" ${DS} stroke-dasharray="5 3" opacity=".7"/></g>`;
  });
  // 帘子：波浪线；木格栅：一排小方块
  (P().curtains || []).forEach(({rect:[x0,y0,x1,y1], color}, i) => {
    const hz = (x1-x0) >= (y1-y0), L = hz ? x1-x0 : y1-y0, n = Math.max(4, Math.round(L/150)), m = hz ? (y0+y1)/2 : (x0+x1)/2, a = 45;
    let d = hz ? `M${x0} ${m}` : `M${m} ${y0}`;
    for (let k = 1; k <= n; k++){ const t = (hz ? x0 : y0) + L*k/n, tm = t - L/n/2, o = k % 2 ? a : -a; d += hz ? `Q${tm} ${m + o} ${t} ${m}` : `Q${m + o} ${tm} ${m} ${t}`; }
    s += `<g class="op" data-curtain="${i}"><rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="transparent"/><path d="${d}" fill="none" stroke="${color || '#b5946a'}" stroke-width="3" vector-effect="non-scaling-stroke"/></g>`;
  });
  (P().slats || []).forEach(({rect:[x0,y0,x1,y1], color}, i) => {
    const hz = (x1-x0) >= (y1-y0), L = hz ? x1-x0 : y1-y0, n = Math.max(2, Math.floor(L/110));
    s += `<g class="op" data-slat="${i}"><rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="transparent"/>`;
    for (let k = 0; k < n; k++){ const t = (hz ? x0 : y0) + (k + .5)*L/n; s += hz ? `<rect x="${t-20}" y="${y0}" width="40" height="${y1-y0}" fill="${color || '#b08458'}"/>` : `<rect x="${x0}" y="${t-20}" width="${x1-x0}" height="40" fill="${color || '#b08458'}"/>`; }
    s += '</g>';
  });
  P().slides.forEach(({rect:[x0,y0,x1,y1],v}, i) => {
    if (isDem('slide', i)){ s += DEM([x0,y0,x1,y1]); return; }
    s += `<g class="op" data-slide="${i}"><rect x="${x0}" y="${y0}" width="${x1-x0}" height="${y1-y0}" fill="transparent"/>`;
    if (v){ const L = y1-y0, m = (x0+x1)/2; s += `<rect x="${m-45}" y="${y0}" width="40" height="${L*.55}" fill="#fff" ${DS}/><rect x="${m+5}" y="${y1-L*.55}" width="40" height="${L*.55}" fill="#fff" ${DS}/>`; }
    else { const L = x1-x0, m = (y0+y1)/2; s += `<rect x="${x0}" y="${m-45}" width="${L*.55}" height="40" fill="#fff" ${DS}/><rect x="${x1-L*.55}" y="${m+5}" width="${L*.55}" height="40" fill="#fff" ${DS}/>`; }
    s += '</g>';
  });
  // 指北针（画在图纸右上角，随导出图片一起输出）
  const b = P().bounds, nr = 360, ncx = b.x + b.w - nr - 250, ncy = b.y + nr + 250, nth = P().north || 0;
  s += `<g class="compass" transform="translate(${ncx} ${ncy})" pointer-events="none">
    <circle r="${nr}" fill="rgba(255,255,255,.85)" stroke="#334155" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
    <g transform="rotate(${nth})"><path d="M0 ${-nr*.86}L${nr*.26} ${nr*.2}L0 ${nr*.02}L${-nr*.26} ${nr*.2}Z" fill="#162032"/>
      <path d="M0 ${nr*.86}L${nr*.2} ${nr*.2}L0 ${nr*.02}L${-nr*.2} ${nr*.2}Z" fill="none" stroke="#334155" stroke-width="1" vector-effect="non-scaling-stroke"/>
      <text y="${-nr - 90}" font-size="230" font-weight="700" text-anchor="middle" fill="#162032">N</text></g></g>`;
  // 入户标识
  const em = P().entryMark;
  if (em) s += `<path d="${em.d}" fill="none" stroke="#4c6ef5" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <text x="${em.tx}" y="${em.ty}" font-size="200" fill="#4c6ef5">${tr('入户','Entry')}</text>`;
  $('#gOpen').innerHTML = s;
}

export function renderLabels(){
  const g = $('#gLabels');
  g.setAttribute('display', ui.layers.labels ? 'inline' : 'none');
  g.innerHTML = P().rooms.filter(r => r.at).map(r => {
    const [x,y] = r.at, halo = 'stroke="#f3f6f9" stroke-width="45" paint-order="stroke" stroke-linejoin="round"';
    return `<text x="${x}" y="${y}" font-size="250" font-weight="600" text-anchor="middle" fill="#162032" ${halo}>${esc(nm(state.rooms[r.id].name))}</text>
      <text x="${x}" y="${y+260}" font-size="175" text-anchor="middle" fill="#5d6b80" ${halo}>${fmt(area(r.poly))} m²</text>`;
  }).join('');
}

export function renderDims(){
  const DC = '#6b7a90', LS = `stroke="${DC}" stroke-width="1" vector-effect="non-scaling-stroke"`, TK = `stroke="${DC}" stroke-width="2" vector-effect="non-scaling-stroke"`;
  const txt = (x,y,v,rot) => `<text x="${x}" y="${y}" font-size="${v<400?140:200}" text-anchor="middle" fill="${DC}" ${rot?`transform="rotate(-90 ${x} ${y})"`:''}>${v}</text>`;
  const chain = (horiz, at, start, segs) => {
    const pts = [start]; segs.forEach(v => pts.push(pts[pts.length-1]+v));
    let s = horiz ? `<line x1="${pts[0]}" y1="${at}" x2="${pts.at(-1)}" y2="${at}" ${LS}/>` : `<line x1="${at}" y1="${pts[0]}" x2="${at}" y2="${pts.at(-1)}" ${LS}/>`;
    pts.forEach(p => s += horiz
      ? `<line x1="${p}" y1="${at-170}" x2="${p}" y2="${at+170}" ${LS}/><line x1="${p-80}" y1="${at+80}" x2="${p+80}" y2="${at-80}" ${TK}/>`
      : `<line x1="${at-170}" y1="${p}" x2="${at+170}" y2="${p}" ${LS}/><line x1="${at-80}" y1="${p+80}" x2="${at+80}" y2="${p-80}" ${TK}/>`);
    segs.forEach((v,i) => { const mid = (pts[i]+pts[i+1])/2; s += horiz ? txt(mid, at-70, v) : txt(at-70, mid, v, true); });
    return s;
  };
  const g = $('#gDims');
  g.innerHTML = P().dims.map(([h, at, st, segs]) => chain(h, at, st, segs)).join('');
  g.setAttribute('display', ui.layers.dims ? 'inline' : 'none');
}

// 导入户型图的原图底图：只在 id / 开关变化时更新（避免每次重绘都重新解码大图）
let underKey = '';
export function renderUnderlay(){
  const u = P().underlay, src = u?.id ? getUnderlay(u.id) : null, on = !!(src && ui.layers.underlay);
  const key = on ? u.id + JSON.stringify([u.x, u.y, u.w, u.h]) : '';
  const chip = $('[data-layer=underlay]'); if (chip) chip.hidden = !src;
  if (key === underKey) return; underKey = key;
  $('#gUnder').innerHTML = on ? `<image href="${src}" x="${u.x}" y="${u.y}" width="${u.w}" height="${u.h}" opacity=".42" preserveAspectRatio="none" style="mix-blend-mode:multiply"/>` : '';
}

export function renderGrid(){
  $('#gGrid').innerHTML = `<rect x="-20000" y="-20000" width="55000" height="55000" fill="${ui.layers.grid ? 'url(#grid)' : 'transparent'}" data-bg="1"/>`;
}

export function renderMeasure(){
  const k = 1/view.s, fs = 12*k;
  const one = (a,b,tmp) => {
    const L = Math.hypot(b.x-a.x, b.y-a.y); if (L < 1) return '';
    let ang = Math.atan2(b.y-a.y, b.x-a.x)*180/Math.PI; if (ang > 90 || ang < -90) ang += 180;
    const mx = (a.x+b.x)/2, my = (a.y+b.y)/2, nx = -(b.y-a.y)/L*5*k, ny = (b.x-a.x)/L*5*k;
    const col = tmp ? '#0ea5b7' : '#4c6ef5', S = `stroke="${col}" stroke-width="1.5" vector-effect="non-scaling-stroke"`;
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${S}/>
      <line x1="${a.x-nx}" y1="${a.y-ny}" x2="${a.x+nx}" y2="${a.y+ny}" ${S}/><line x1="${b.x-nx}" y1="${b.y-ny}" x2="${b.x+nx}" y2="${b.y+ny}" ${S}/>
      <text x="${mx}" y="${my-5*k}" font-size="${fs}" text-anchor="middle" fill="${col}" font-weight="600" transform="rotate(${ang} ${mx} ${my})"
        stroke="#fff" stroke-width="${3.5*k}" paint-order="stroke">${Math.round(L)} mm</text>`;
  };
  let s = state.measures.map(m => one(m.a,m.b)).join('');
  if (ui.mA && ui.mCur) s += one(ui.mA, ui.mCur, true);
  if (ui.mA) s += `<circle cx="${ui.mA.x}" cy="${ui.mA.y}" r="${3*k}" fill="#0ea5b7"/>`;
  $('#gMeasure').innerHTML = s;
}

export function renderSel(){
  const k = 1/view.s; let s = '';
  if (ui.sel?.kind === 'furn'){
    const f = getF(ui.sel.id);
    if (f){
      // 触屏上手柄更大、离家具更远，并各带一圈透明的大热区
      const p = 5*k, A = 'stroke="#4c6ef5" vector-effect="non-scaling-stroke"', hs = COARSE ? 1.7 : 1, ro = (COARSE ? 40 : 26)*k, hit = (COARSE ? 24 : 11)*k;
      const sx = f.w/2+p, sy = f.d/2+p;
      s += `<g transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})">
        <rect x="${-f.w/2-p}" y="${-f.d/2-p}" width="${f.w+2*p}" height="${f.d+2*p}" fill="none" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>
        <line x1="0" y1="${-f.d/2-p}" x2="0" y2="${-f.d/2-ro}" ${A} stroke-width="1" pointer-events="none"/>
        <circle data-handle="rot" cx="0" cy="${-f.d/2-ro}" r="${hit}" fill="transparent"/>
        <circle data-handle="rot" cx="0" cy="${-f.d/2-ro}" r="${6*hs*k}" fill="#fff" ${A} stroke-width="1.5"><title>${tr('拖动旋转（Shift 自由角度）','Drag to rotate (Shift for free angle)')}</title></circle>
        <circle data-handle="size" cx="${sx}" cy="${sy}" r="${hit}" fill="transparent"/>
        <rect data-handle="size" x="${sx-5*hs*k}" y="${sy-5*hs*k}" width="${10*hs*k}" height="${10*hs*k}" fill="#4c6ef5"><title>${tr('拖动调整尺寸','Drag to resize')}</title></rect></g>`;
      const {hh} = aabb(f);
      s += `<text x="${f.cx}" y="${f.cy+hh+24*k}" font-size="${12*k}" text-anchor="middle" fill="#4c6ef5" font-weight="600" pointer-events="none"
        stroke="#fff" stroke-width="${3*k}" paint-order="stroke">${f.w} × ${f.d}</text>`;
    }
  } else if (['wall', 'win', 'door', 'slide', 'curtain', 'slat'].includes(ui.sel?.kind)){
    const pl = P(), k = 1/view.s, A = 'stroke="#f76b15" vector-effect="non-scaling-stroke"';
    const r = ui.sel.kind === 'wall' ? pl.walls[ui.sel.i] : ui.sel.kind === 'win' ? pl.wins[ui.sel.i] : ui.sel.kind === 'door' ? pl.doors[ui.sel.i]?.rect
      : ui.sel.kind === 'slide' ? pl.slides[ui.sel.i]?.rect : ui.sel.kind === 'curtain' ? pl.curtains?.[ui.sel.i]?.rect : pl.slats?.[ui.sel.i]?.rect;
    if (r){
      const p = 3*k;
      const aw = ui.sel.kind === 'wall' && isArc(r);
      s += aw ? `<path d="M${arcOutline(r).map(q => q.map(Math.round).join(' ')).join('L')}Z" fill="rgba(247,107,21,.18)" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>`
        : `<rect x="${r[0]-p}" y="${r[1]-p}" width="${r[2]-r[0]+2*p}" height="${r[3]-r[1]+2*p}" fill="rgba(247,107,21,.12)" ${A} stroke-width="1.5" stroke-dasharray="5 3" pointer-events="none"/>`;
      if (ui.sel.kind === 'wall'){
        const h = (r[2]-r[0]) >= (r[3]-r[1]), cx = (r[0]+r[2])/2, cy = (r[1]+r[3])/2, hs = (COARSE ? 9 : 6)*k;
        const ends = h ? [[r[0], cy], [r[2], cy]] : [[cx, r[1]], [cx, r[3]]];
        ends.forEach(([x, y], e) => s += `<circle data-handle="wend${e}" cx="${x}" cy="${y}" r="${hs*1.8}" fill="transparent"/><circle data-handle="wend${e}" cx="${x}" cy="${y}" r="${hs}" fill="#fff" ${A} stroke-width="2"/>`);
        const L = h ? r[2]-r[0] : r[3]-r[1];
        s += `<text x="${cx}" y="${h ? r[1] - 14*k : cy}" ${h ? '' : `dx="${(r[2]-r[0])/2 + 10*k}"`} font-size="${12*k}" text-anchor="${h ? 'middle' : 'start'}" fill="#f76b15" font-weight="600" stroke="#fff" stroke-width="${3*k}" paint-order="stroke" pointer-events="none">${L} mm</text>`;
      }
    }
  } else if (ui.sel?.kind === 'room'){
    const r = P().rooms.find(r => r.id === ui.sel.id);
    s += `<polygon points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="rgba(76,110,245,.08)" stroke="#4c6ef5" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  }
  // 高亮某面墙（检查器悬停 / 拖放墙面材质时）
  const hf = ui.hoverFace, hr = hf && P().rooms.find(r => r.id === hf.room), he = hr && roomEdges(hr).find(e => e.key === hf.key);
  if (he) s += `<line x1="${he.a[0]}" y1="${he.a[1]}" x2="${he.b[0]}" y2="${he.b[1]}" stroke="#f76b15" stroke-width="6" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none"/>`
    + `<text x="${(he.a[0]+he.b[0])/2 - he.nx*260}" y="${(he.a[1]+he.b[1])/2 - he.ny*260}" font-size="${13/view.s}" text-anchor="middle" dominant-baseline="central" fill="#f76b15" font-weight="700" stroke="#fff" stroke-width="${3/view.s}" paint-order="stroke" pointer-events="none">${he.dir}${tr('墙','')}</text>`;
  const dr = draftRect(drag);
  if (dr){ const L = Math.round(Math.max(dr[2]-dr[0], dr[3]-dr[1])), k = 1/view.s;
    s += `<rect x="${dr[0]}" y="${dr[1]}" width="${dr[2]-dr[0]}" height="${dr[3]-dr[1]}" fill="${partOf(wallOpts.part).color}" fill-opacity=".75" stroke="#f76b15" stroke-width="1.5" stroke-dasharray="5 3" vector-effect="non-scaling-stroke" pointer-events="none"/>`
      + `<text x="${(dr[0]+dr[2])/2}" y="${(dr[1]+dr[3])/2 - 16*k}" font-size="${12*k}" text-anchor="middle" fill="#f76b15" font-weight="700" stroke="#fff" stroke-width="${3*k}" paint-order="stroke" pointer-events="none">${partOf(wallOpts.part).name} · ${L} mm</text>`; }
  $('#gSel').innerHTML = s;
}

export function renderAll(){
  renderGrid(); renderRooms(); renderUnderlay(); renderFurn(); renderWalls(); renderOpenings(); renderDims(); renderLabels(); renderMeasure(); renderSel(); renderPanel(); updateHeader();
  ext.View3D?.sync();
}

export function updateHeader(){
  const tot = P().rooms.filter(r => r.counted !== false).reduce((a,r) => a + area(r.poly), 0);
  const imported = !!P().title;
  $('#planTitle').textContent = (imported ? tr(P().title, P().titleEn || P().title) : tr('三室一厅两卫', '3BR 1LR 2BA')) + ' · ' + tr('栖构', 'Nestform');
  $('#subtitle').textContent = P().auto
    ? tr(`套内使用面积约 ${fmt(tot)} m² · 尺寸单位 mm · 由户型图识别生成`, `Net floor area ≈ ${fmt(tot)} m² · Units: mm · Recognized from image`)
    : tr(`套内使用面积约 ${fmt(tot)} m² · 层高 ${(P().height || 2800)/1000} m · 尺寸单位 mm`, `Net floor area ≈ ${fmt(tot)} m² · Ceiling ${(P().height || 2800)/1000} m · Units: mm`);
  $('#undo').disabled = !undoStack.length; $('#redo').disabled = !redoStack.length;
  $('#undo').style.opacity = undoStack.length ? 1 : .4; $('#redo').style.opacity = redoStack.length ? 1 : .4;
}

