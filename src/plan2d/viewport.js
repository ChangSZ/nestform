import {PX_MM, $, svg, ui, view, P} from '../store.js';
import {aabb, snapRects} from '../geom.js';
import {renderMeasure, renderSel} from '../plan2d/render.js';

/* ======================= 视图 ======================= */
export function applyView(){
  const W = svg.clientWidth, H = svg.clientHeight;
  svg.setAttribute('viewBox', `${view.x0} ${view.y0} ${W/view.s} ${H/view.s}`);
  const ratio = 1/(view.s*PX_MM);
  $('#ratio').textContent = '1:' + Math.round(ratio);
  const nice = [100,200,500,1000,2000,5000].find(v => v*view.s >= 60) || 5000;
  $('#sbBar').style.width = nice*view.s + 'px';
  $('#sbText').textContent = nice >= 1000 ? `${nice/1000} m` : `${nice} mm`;
  renderSel(); renderMeasure();
}
/** 画布上未被浮岛遮挡的区域（相对 svg 的像素坐标） */
export function freeRect(){
  const r = svg.getBoundingClientRect(), on = el => { if (!el) return null; const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return b.width && cs.display !== 'none' && +cs.opacity > .5 && b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom ? b : null; };
  const lib = on($('.libpanel')), top = on($('.ctx-island')), insp = on($('.inspector'));
  const L = (lib ? lib.right : r.left) + 12, T = (top ? top.bottom : r.top) + 12, R = (insp ? insp.left : r.right) - 12, B = r.bottom - 40;
  return R - L > 200 && B - T > 160 ? {x:L - r.left, y:T - r.top, w:R - L, h:B - T} : {x:0, y:0, w:r.width, h:r.height};
}
export function fitView(){
  const b = P().bounds, f = freeRect();
  view.s = Math.min(f.w/b.w, f.h/b.h);
  view.x0 = b.x - f.x/view.s - (f.w/view.s - b.w)/2; view.y0 = b.y - f.y/view.s - (f.h/view.s - b.h)/2;
  applyView();
}
export function zoomAt(ns, mx, my){
  ns = Math.max(.012, Math.min(2, ns));
  const px = view.x0 + mx/view.s, py = view.y0 + my/view.s;
  view.s = ns; view.x0 = px - mx/ns; view.y0 = py - my/ns; applyView();
}
export const zoomCenter = k => zoomAt(view.s*k, svg.clientWidth/2, svg.clientHeight/2);
export const setRatio = r => zoomAt(1/(r*PX_MM), svg.clientWidth/2, svg.clientHeight/2);

export function toMM(e){
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/* ======================= 吸附 ======================= */
export const grid = () => 10;
export function snapMove(f, cx, cy){
  let nx = Math.round(cx/grid())*grid(), ny = Math.round(cy/grid())*grid();
  if (!ui.layers.wallSnap) return [nx, ny];
  const {hw, hh} = aabb(f), tol = 10/view.s;
  let bx = tol, by = tol;
  for (const r of snapRects()){
    if (!(r[3] < cy-hh-tol || r[1] > cy+hh+tol)) for (const ex of [r[0], r[2]]) for (const c of [ex+hw, ex-hw]) if (Math.abs(c-cx) < bx){ bx = Math.abs(c-cx); nx = c; }
    if (!(r[2] < cx-hw-tol || r[0] > cx+hw+tol)) for (const ey of [r[1], r[3]]) for (const c of [ey+hh, ey-hh]) if (Math.abs(c-cy) < by){ by = Math.abs(c-cy); ny = c; }
  }
  return [nx, ny];
}
export function snapPoint(p, shift){
  let x = Math.round(p.x/10)*10, y = Math.round(p.y/10)*10;
  const tol = 8/view.s; let bx = tol, by = tol;
  for (const r of snapRects()){
    for (const ex of [r[0], r[2]]) if (Math.abs(ex-p.x) < bx){ bx = Math.abs(ex-p.x); x = ex; }
    for (const ey of [r[1], r[3]]) if (Math.abs(ey-p.y) < by){ by = Math.abs(ey-p.y); y = ey; }
  }
  if (shift && ui.mA){ if (Math.abs(x-ui.mA.x) > Math.abs(y-ui.mA.y)) y = ui.mA.y; else x = ui.mA.x; }
  return {x, y};
}

