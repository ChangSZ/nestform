/* =====================================================================
 *  弧形墙：墙数组第 6 项 = 拱高 bulge（mm，0 / 缺省 = 直墙）
 *  墙矩形的长轴中线为弦；拱高为弦中点到弧顶的距离，正值弯向弦的左法线（横墙 = +y，竖墙 = −x）
 * ===================================================================== */
export const isArc = w => !!w[5];

/** 弦端点、弧所在圆、厚度 */
export function arcInfo(w){
  const [x0, y0, x1, y1] = w, h = (x1 - x0) >= (y1 - y0), t = h ? y1 - y0 : x1 - x0;
  const A = h ? [x0, (y0 + y1)/2] : [(x0 + x1)/2, y0], B = h ? [x1, (y0 + y1)/2] : [(x0 + x1)/2, y1];
  const c = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0])/c, uy = (B[1] - A[1])/c, nx = -uy, ny = ux;
  const s = Math.max(-c/2, Math.min(c/2, w[5])), sg = Math.sign(s) || 1, R = (c*c/4 + s*s)/(2*Math.abs(s));
  const M = [(A[0] + B[0])/2, (A[1] + B[1])/2], C = [M[0] + nx*sg*(Math.abs(s) - R), M[1] + ny*sg*(Math.abs(s) - R)];
  let a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), a1 = Math.atan2(B[1] - C[1], B[0] - C[0]);
  // 走「经过弧顶」的那一侧
  const P = [M[0] + nx*s, M[1] + ny*s], ap = Math.atan2(P[1] - C[1], P[0] - C[0]);   // 弧顶
  const norm = a => { while (a < a0) a += Math.PI*2; while (a >= a0 + Math.PI*2) a -= Math.PI*2; return a; };
  a1 = norm(ap) < norm(a1) ? norm(a1) : norm(a1) - Math.PI*2;
  return {A, B, C, R, a0, a1, t, s, len:Math.abs(a1 - a0)*R};
}
/** 中线采样点 */
export function arcPoints(w, step = 120){
  const {C, R, a0, a1, len} = arcInfo(w), n = Math.max(4, Math.ceil(len/step));
  return Array.from({length:n + 1}, (_, k) => { const a = a0 + (a1 - a0)*k/n; return [C[0] + Math.cos(a)*R, C[1] + Math.sin(a)*R]; });
}
/** 墙体轮廓多边形（外弧 + 内弧） */
export function arcOutline(w, step = 120){
  const {C, R, a0, a1, t, len} = arcInfo(w), n = Math.max(4, Math.ceil(len/step)), out = [], inn = [];
  for (let k = 0; k <= n; k++){ const a = a0 + (a1 - a0)*k/n, c = Math.cos(a), s = Math.sin(a); out.push([C[0] + c*(R + t/2), C[1] + s*(R + t/2)]); inn.push([C[0] + c*(R - t/2), C[1] + s*(R - t/2)]); }
  return [...out, ...inn.reverse()];
}
/** 近似成一串小矩形（房间分割 / 碰撞用） */
export function arcRects(w, step = 150){
  const pts = arcPoints(w, step), t = arcInfo(w).t/2, out = [];
  for (let k = 0; k < pts.length - 1; k++){
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
    out.push([Math.min(ax, bx) - t, Math.min(ay, by) - t, Math.max(ax, bx) + t, Math.max(ay, by) + t]);
  }
  return out;
}
/** 墙 → 阻挡矩形列表（直墙 = 自身矩形） */
export const wallRects = w => isArc(w) ? arcRects(w) : [w.slice(0, 4)];
