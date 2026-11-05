import {state, P} from './store.js';

/* ======================= 几何工具 ======================= */
export const area = poly => Math.abs(poly.reduce((a,p,i) => { const q = poly[(i+1)%poly.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0)) / 2 / 1e6;
export const perim = poly => poly.reduce((a,p,i) => { const q = poly[(i+1)%poly.length]; return a + Math.hypot(q[0]-p[0], q[1]-p[1]); }, 0) / 1000;
export const bbox = poly => { const xs = poly.map(p=>p[0]), ys = poly.map(p=>p[1]); return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]; };
export function aabb(f){ const a = f.rot*Math.PI/180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)); return {hw:f.w/2*c + f.d/2*s, hh:f.w/2*s + f.d/2*c}; }
export const fmt = (n, d=2) => n.toFixed(d);
export const norm = a => ((Math.round(a) % 360) + 360) % 360;
export function snapRects(){ return P().walls.filter((w,i) => !state.demolished.includes('w'+i) && !w[5]).concat(P().wins.filter((w,i) => !state.demolished.includes('n'+i))); }

