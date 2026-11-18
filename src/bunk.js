/* =====================================================================
 *  高低床尺寸：上床 / 下床各自的宽（床垫短边）和长，单位 mm。
 *  方案里存 f.bunk = {uw, ul, lw, ll}；没有该字段时按占地 w × d 推出默认值。
 *  占地始终由床的尺寸决定：叠放的两层里较大的一层撑满占地，另一层保持差值。
 *  2D 符号、3D 模型和属性面板共用这里的换算，三处保持一致。
 * ===================================================================== */
const LADDER = 100;      // 直梯 + 背板占的进深
const LEAN = .65;        // 下床比上床宽时爬梯改斜放：梯脚外伸量 = 宽度差 × LEAN
const STAIR = 500;       // 梯柜宽
const PULL = 450;        // 拖床拉出的长度
const SLIDE = 1760;      // 滑梯床：梯柜 460 + 滑梯 1300
const clamp = (v, lo, hi) => Math.max(lo, Math.min(Math.max(lo, hi), v));

/** 各款可调的尺寸（没有下床的款式只有上床） */
export const BUNK_KEYS = {bunkbed:['uw', 'ul', 'lw', 'll'], bunkstairs:['uw', 'ul', 'lw', 'll'], trundlebed:['uw', 'ul', 'lw', 'll'], lbunk:['uw', 'ul', 'lw', 'll'], loftbed:['uw', 'ul'], slidebed:['uw', 'ul']};
export const isBunk = t => Object.hasOwn(BUNK_KEYS, t);

// 叠放的两层：较大的一层 = cap，另一层保持差值（不小于 min）
function pair(cap, a, b, min){
  a ??= cap; b ??= cap;
  const s = cap - Math.max(a, b), lo = Math.min(cap, min);
  return [Math.max(a + s, lo), Math.max(b + s, lo)];
}
const lean = q => q.lw != null && q.uw != null ? Math.round(LEAN*Math.max(0, q.lw - q.uw)) : 0;

/** 占地 w × d + 已存参数 p → 实际使用的尺寸 {uw, ul, lw?, ll?}（mm） */
export function bunkDims(type, w, d, p){
  const q = p || {};
  switch (type){
    case 'bunkbed': { const [ul, ll] = pair(w, q.ul, q.ll, 1200), [uw, lw] = pair(d - LADDER - lean(q), q.uw, q.lw, 600); return {uw, ul, lw, ll}; }
    case 'bunkstairs': {                                               // 梯柜接上床：上床撑满，下床不长于上床
      const ul = w - STAIR, ll = Math.max(Math.min(ul, 1200), ul - Math.max(0, (q.ul ?? ul) - (q.ll ?? ul))), [uw, lw] = pair(d, q.uw, q.lw, 600);
      return {uw, ul, lw, ll};
    }
    case 'trundlebed': {                                               // 上床 = 主床，下床 = 拖床（要能推回主床下面）
      if (!p) return {uw:Math.min(d - 300, 1250), ul:w, lw:1000, ll:w - 280};
      const uw = d - PULL; return {uw, ul:w, lw:clamp(q.lw ?? 1000, 600, uw - 50), ll:clamp(q.ll ?? w - 280, 1000, w - 280)};
    }
    case 'lbunk':                                                      // 上床横放靠背墙，下床竖放靠左墙
      return p ? {uw:clamp(q.uw ?? 1020, 700, d - 600), ul:w, lw:clamp(q.lw ?? 1020, 700, w - 1000), ll:d} : {uw:1020, ul:w, lw:1020, ll:d};
    case 'loftbed': return {uw:d - LADDER, ul:w};
    case 'slidebed': return {uw:d, ul:w - SLIDE};
  }
  return {uw:d, ul:w};
}
/** 尺寸 → 占地 [w, d] */
export function bunkFootprint(type, D){
  switch (type){
    case 'bunkbed': return [Math.max(D.ul, D.ll), Math.max(D.uw, D.lw) + LADDER + lean(D)];
    case 'bunkstairs': return [Math.max(D.ul, D.ll) + STAIR, Math.max(D.uw, D.lw)];
    case 'trundlebed': return [D.ul, D.uw + PULL];
    case 'lbunk': return [D.ul, D.ll];
    case 'loftbed': return [D.ul, D.uw + LADDER];
    case 'slidebed': return [D.ul + SLIDE, D.uw];
  }
  return [D.ul, D.uw];
}
/** 某个尺寸当前允许的范围 [最小, 最大] */
export function bunkRange(type, key, D){
  if (type === 'trundlebed'){ if (key === 'lw') return [700, D.uw - 50]; if (key === 'll') return [1200, D.ul - 280]; if (key === 'uw') return [900, 1800]; return [1700, 2400]; }
  if (type === 'lbunk') return key === 'uw' || key === 'lw' ? [800, 1500] : key === 'ul' ? [Math.max(1900, D.lw + 1000), 2600] : [Math.max(1800, D.uw + 600), 2400];
  if (type === 'slidebed' && key === 'ul') return [1200, 2200];
  return key === 'uw' || key === 'lw' ? [800, 1800] : [1600, 2400];
}
/** 修改一个尺寸：钳制到允许范围、联动受约束的另一层、更新占地；靠墙的床头 / 背面一角保持不动 */
export function setBunk(f, key, v){
  if (!isBunk(f.type) || !BUNK_KEYS[f.type].includes(key) || !isFinite(v)) return;
  const D = bunkDims(f.type, f.w, f.d, f.bunk), [lo, hi] = bunkRange(f.type, key, D);
  D[key] = clamp(Math.round(v), lo, hi);
  if (f.type === 'trundlebed'){ D.lw = clamp(D.lw, 700, D.uw - 50); D.ll = clamp(D.ll, 1200, D.ul - 280); }
  if (f.type === 'lbunk'){ D.ul = Math.max(D.ul, D.lw + 1000); D.ll = Math.max(D.ll, D.uw + 600); }
  if (f.type === 'bunkstairs'){ if (key === 'll') D.ul = Math.max(D.ul, D.ll); else D.ll = Math.min(D.ll, D.ul); }
  const [w, d] = bunkFootprint(f.type, D), hx = (w - f.w)/2, hy = (d - f.d)/2, a = (f.rot || 0)*Math.PI/180;
  f.cx = Math.round(f.cx + hx*Math.cos(a) - hy*Math.sin(a)); f.cy = Math.round(f.cy + hx*Math.sin(a) + hy*Math.cos(a));
  f.w = w; f.d = d;
  if (D.lw != null) f.bunk = D;                                        // 只有上床的款式：尺寸完全由占地决定，不用另存
}
