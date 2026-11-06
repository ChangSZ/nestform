/* =====================================================================
 *  儿童高低床（3D）：上下铺、梯柜高低床、子母床、错层 L 型、高架床、滑梯城堡床。
 *  局部坐标与其他家具一致：x 沿宽度，背面（贴墙一侧）朝 -z，y 向上，单位 m。
 *  床头统一在 -x 一端（L 型的下铺床头朝 -z）。
 * ===================================================================== */
import * as THREE from 'three';
import {mat, box, rbox, rod, blob, fabric, woodM, darker, lighter} from './kit.js';

const RAIL = .3;                                                    // 护栏高出床垫的高度（安全要求 ≥ 0.2m）
const QUILTS = ['#8fb3d9', '#f2b8a0', '#a8d0b0', '#f3d27a', '#c7b3e0'];

/** 一层床：床架 + 床垫 + 被子 + 枕头 + 护栏。axis = 'x' 床沿 x 方向（床头在 xa），'z' 沿 z 方向（床头在 za）
 *  rails：{back, front, left, right}，值为 true（整边）或 [[a, b], …]（只在这些区间装护栏） */
function deck(g, P, xa, xb, za, zb, y, {axis = 'x', rails = {}, quilt = QUILTS[0], slats = true} = {}){
  const L = xb - xa, D = zb - za, cx = (xa + xb)/2, cz = (za + zb)/2, top = y + .1 + .16;
  g.add(rbox(L, .1, D, P.frame, cx, y, cz, .015));
  g.add(rbox(L - .05, .16, D - .05, mat('#f7f5f0', {roughness:.9}), cx, y + .1, cz, .05));
  if (axis === 'x'){
    g.add(rbox(L*.62, .05, D - .02, fabric(quilt), xb - L*.31 - .02, top - .035, cz, .03), rbox(L*.06, .055, D - .015, fabric('#fbfaf7'), xb - L*.62 - .01, top - .03, cz, .025));
    g.add(rbox(.32, .11, Math.min(.6, D*.6), fabric('#ffffff'), xa + .24, top - .01, cz, .05));
  } else {
    g.add(rbox(L - .02, .05, D*.62, fabric(quilt), cx, top - .035, zb - D*.31 - .02, .03), rbox(L - .015, .055, D*.06, fabric('#fbfaf7'), cx, top - .03, zb - D*.62 - .01, .025));
    g.add(rbox(Math.min(.6, L*.6), .11, .32, fabric('#ffffff'), cx, top - .01, za + .24, .05));
  }
  const yr = top + RAIL;
  const run = (a, b, fixed, along) => {                              // 一段护栏：上下两根横杆 + 竖向栏杆
    if (b - a < .08) return;
    const m = (a + b)/2, n = Math.max(1, Math.round((b - a)/.16));
    const bar = (yy, h) => along === 'x' ? rbox(b - a, h, .035, P.rail, m, yy, fixed, .012) : rbox(.035, h, b - a, P.rail, fixed, yy, m, .012);
    g.add(bar(yr - .045, .045), bar(y + .1, .035));
    if (slats) for (let i = 1; i < n; i++){ const t = a + (b - a)*i/n; g.add(along === 'x' ? rod([t, y + .13, fixed], [t, yr - .04, fixed], .012, P.rail) : rod([fixed, y + .13, t], [fixed, yr - .04, t], .012, P.rail)); }
  };
  const side = (spec, a, b, fixed, along) => { if (!spec) return; (spec === true ? [[a, b]] : spec).forEach(([p, q]) => run(Math.max(a, p), Math.min(b, q), fixed, along)); };
  side(rails.back, xa, xb, za + .02, 'x'); side(rails.front, xa, xb, zb - .02, 'x');
  side(rails.left, za, zb, xa + .02, 'z'); side(rails.right, za, zb, xb - .02, 'z');
  return top;
}
/** 立柱 */
const post = (g, P, x, z, h) => g.add(rbox(.065, h, .065, P.frame, x, 0, z, .014), blob(.04, .03, .04, P.frame, x, h, z, 14));
/** 床头 / 床尾挡板（x 方向的端板） */
const endBoard = (g, P, x, za, zb, y0, h) => g.add(rbox(.04, h, zb - za, P.panel, x, y0, (za + zb)/2, .012));
/** 竖直爬梯，贴在 z 处的平面上，中心 x，从地面到 top */
function ladder(g, P, x, z, top){
  const hw = .2;
  [-1, 1].forEach(s => g.add(rbox(.045, top + .45, .045, P.frame, x + s*hw, 0, z, .012)));
  for (let yy = .28; yy < top + .05; yy += .27) g.add(rod([x - hw, yy, z], [x + hw, yy, z], .017, P.accent));
}
/** 梯柜：沿 z 方向的台阶（前低后高），每级正面一个抽屉 */
function stairs(g, P, xa, xb, za, zb, ytop, n){
  const W = xb - xa, cx = (xa + xb)/2, dz = (zb - za)/n, sh = ytop/n;
  for (let k = 0; k < n; k++){
    const z1 = zb - k*dz, z0 = z1 - dz, h = sh*(k + 1);
    g.add(box(W, h - .025, dz, P.panel, cx, 0, (z0 + z1)/2));
    g.add(rbox(W + .01, .025, dz + .01, P.frame, cx, h - .025, (z0 + z1)/2, .006));                       // 踏板
    g.add(box(W - .05, sh - .06, .008, P.front, cx, h - sh + .02, z1 + .004));                            // 抽屉面
    g.add(rbox(.12, .022, .02, P.accent, cx, h - sh/2 - .01, z1 + .016, .008));                             // 拉手
  }
}

export function buildBunk(g, type, w, d, c, R){
  const P = {frame:woodM(c), rail:woodM(lighter(c, .15)), panel:mat('#f4f1ec', {roughness:.6}), front:mat(lighter(c, .35), {roughness:.55}), accent:mat(darker(c, .72), {roughness:.5})};
  const q = () => QUILTS[Math.floor(R()*QUILTS.length)];
  const X0 = -w/2, X1 = w/2, Z0 = -d/2, Z1 = d/2;
  switch (type){
    case 'bunkbed': {                                                  // 上下铺：两张同尺寸的床叠放，前侧直爬梯
      const za = Z0 + .03, zb = Z1 - .07, lx = X1 - .34;
      [[X0 + .035, za], [X1 - .035, za], [X0 + .035, zb], [X1 - .035, zb]].forEach(([x, z]) => post(g, P, x, z, 1.9));
      [X0 + .035, X1 - .035].forEach(x => { endBoard(g, P, x, za, zb, .22, .5); endBoard(g, P, x, za, zb, 1.37, .48); });
      deck(g, P, X0 + .06, X1 - .06, za, zb, .2, {quilt:q()});
      deck(g, P, X0 + .06, X1 - .06, za, zb, 1.25, {quilt:q(), rails:{back:true, front:[[X0, lx - .24], [lx + .24, X1]]}});
      ladder(g, P, lx, Z1 - .035, 1.35);
      break;
    }
    case 'bunkstairs': {                                               // 梯柜高低床：一端是带抽屉的台阶
      const sw = .5, bx = X1 - sw, za = Z0 + .03, zb = Z1 - .03;
      [[X0 + .035, za], [bx - .035, za], [X0 + .035, zb], [bx - .035, zb]].forEach(([x, z]) => post(g, P, x, z, 1.9));
      endBoard(g, P, X0 + .035, za, zb, .22, .5); endBoard(g, P, X0 + .035, za, zb, 1.37, .48);
      deck(g, P, X0 + .06, bx - .06, za, zb, .2, {quilt:q()});
      deck(g, P, X0 + .06, bx - .06, za, zb, 1.25, {quilt:q(), rails:{back:true, front:true, right:[[za, za + .35]]}});
      stairs(g, P, bx, X1, Z0, Z1, 1.35, 4);
      break;
    }
    case 'trundlebed': {                                               // 子母床：上层略高的单人床 + 下方可拉出的拖床
      const mz1 = Z0 + 1.25, tz0 = Z1 - 1.0;
      [X0 + .035, X1 - .035].forEach(x => endBoard(g, P, x, Z0 + .02, mz1, .0, x < 0 ? 1.05 : .8));
      deck(g, P, X0 + .06, X1 - .06, Z0 + .02, mz1, .42, {quilt:q(), rails:{back:true, front:[[X0 + .06, X0 + .9]]}});
      // 拖床：低矮床架 + 前面板（像大抽屉）+ 万向轮
      const tx0 = X0 + .14, tx1 = X1 - .14;
      [[tx0 + .06, tz0 + .06], [tx1 - .06, tz0 + .06], [tx0 + .06, Z1 - .06], [tx1 - .06, Z1 - .06]].forEach(([x, z]) => g.add(blob(.025, .025, .025, mat('#3a3a3a'), x, .025, z, 12)));
      g.add(rbox(tx1 - tx0, .08, Z1 - tz0, P.frame, (tx0 + tx1)/2, .05, (tz0 + Z1)/2, .012));
      g.add(rbox(tx1 - tx0 - .05, .12, Z1 - tz0 - .07, mat('#f7f5f0', {roughness:.9}), (tx0 + tx1)/2, .13, (tz0 + Z1)/2 - .02, .04));
      g.add(rbox(tx1 - tx0 - .2, .045, (Z1 - tz0)*.55, fabric(q()), (tx0 + tx1)/2 + .08, .23, Z1 - (Z1 - tz0)*.32, .025));
      g.add(rbox(tx1 - tx0, .3, .035, P.front, (tx0 + tx1)/2, .05, Z1 - .018, .012), rbox(.3, .03, .025, P.accent, 0, .26, Z1 + .005, .01));
      break;
    }
    case 'lbunk': {                                                    // 错层 L 型：上铺靠背墙横放，下铺靠左墙竖放，上铺右下是书桌和格子柜
      const uz1 = Z0 + 1.02, lx1 = X0 + 1.02, ly = 1.3, lad = X1 - .4;
      [[X0 + .035, Z0 + .035], [X1 - .035, Z0 + .035], [X0 + .035, uz1], [X1 - .035, uz1]].forEach(([x, z]) => post(g, P, x, z, ly + .6));
      deck(g, P, X0 + .06, X1 - .06, Z0 + .03, uz1 - .03, ly, {quilt:q(), rails:{back:true, left:true, right:true, front:[[X0, lad - .24], [lad + .24, X1]]}});
      deck(g, P, X0 + .04, lx1 - .03, Z0 + .03, Z1 - .04, .2, {axis:'z', quilt:q()});
      g.add(rbox(lx1 - X0 - .04, .5, .04, P.panel, (X0 + lx1)/2, .2, Z1 - .02, .012), rbox(.04, .5, Z1 - uz1, P.panel, lx1 - .02, .2, (uz1 + Z1)/2, .012));   // 下铺床尾 / 外侧挡板
      post(g, P, X0 + .035, Z1 - .035, .78); post(g, P, lx1 - .02, Z1 - .035, .78);
      const dx0 = lx1 + .04, dx1 = X1 - .5;                             // 书桌（上铺下方）
      g.add(rbox(dx1 - dx0, .03, .58, P.frame, (dx0 + dx1)/2, .74, Z0 + .32, .008), box(.03, .74, .55, P.panel, dx0 + .015, 0, Z0 + .3));
      g.add(box(.4, .01, .25, mat('#e9edf2'), (dx0 + dx1)/2, .77, Z0 + .25), blob(.05, .05, .05, mat('#f3d27a'), dx1 - .15, .82, Z0 + .2, 14));
      const sx0 = X1 - .48, sx1 = X1 - .06, sh = (ly - .02)/4;              // 右侧格子柜
      g.add(box(sx1 - sx0, ly - .02, .02, P.panel, (sx0 + sx1)/2, 0, Z0 + .02));
      for (let k = 0; k <= 4; k++) g.add(box(sx1 - sx0, .02, .58, P.panel, (sx0 + sx1)/2, Math.min(k*sh, ly - .04), Z0 + .3));
      [sx0, sx1].forEach(x => g.add(box(.02, ly - .02, .58, P.panel, x, 0, Z0 + .3)));
      for (let k = 0; k < 4; k++) if (R() < .7) g.add(box(.08 + R()*.12, sh*.6, .2, mat(QUILTS[k % QUILTS.length], {roughness:.8}), sx0 + .12 + R()*.15, k*sh + .02, Z0 + .3));
      ladder(g, P, lad, uz1 + .025, ly + .1);
      break;
    }
    case 'loftbed': {                                                  // 高架床：上层床，下方书桌 + 书架 + 抽屉柜
      const top = 1.5, lad = X0 + .36, za = Z0 + .03, zb = Z1 - .07;
      [[X0 + .035, za], [X1 - .035, za], [X0 + .035, zb], [X1 - .035, zb]].forEach(([x, z]) => post(g, P, x, z, top + .6));
      [X0 + .035, X1 - .035].forEach(x => endBoard(g, P, x, za, zb, top + .12, .46));
      deck(g, P, X0 + .06, X1 - .06, za, zb, top, {quilt:q(), rails:{back:true, front:[[X0, lad - .24], [lad + .24, X1]]}});
      const dx0 = X0 + .66, dx1 = X1 - .06;
      g.add(rbox(dx1 - dx0, .03, .6, P.frame, (dx0 + dx1)/2, .74, Z0 + .33, .008), box(.03, .74, .58, P.panel, dx0 + .015, 0, Z0 + .32));
      g.add(box(.42, .71, .55, P.panel, dx1 - .21, 0, Z0 + .31));                                   // 抽屉柜
      for (let k = 0; k < 3; k++){ g.add(box(.38, .2, .008, P.front, dx1 - .21, .04 + k*.23, Z0 + .585)); g.add(rbox(.1, .02, .02, P.accent, dx1 - .21, .14 + k*.23, Z0 + .6, .008)); }
      g.add(box(dx1 - dx0, .02, .26, P.panel, (dx0 + dx1)/2, 1.12, Z0 + .16), box(dx1 - dx0, .3, .012, P.panel, (dx0 + dx1)/2, 1.12, Z0 + .03));   // 桌上书架
      let x = dx0 + .08; while (x < dx1 - .5){ const bw = .025 + R()*.03; g.add(box(bw, .18 + R()*.08, .17, mat(QUILTS[Math.floor(R()*5)], {roughness:.8}), x, 1.14, Z0 + .14)); x += bw + .004; }
      g.add(rod([dx0 + .3, .77, Z0 + .2], [dx0 + .3, 1.02, Z0 + .3], .01, P.accent), blob(.06, .035, .06, mat('#f3d27a'), dx0 + .3, 1.02, Z0 + .34, 14));   // 台灯
      ladder(g, P, lad, Z1 - .035, top + .1);
      break;
    }
    case 'slidebed': {                                                 // 滑梯城堡床：一端梯柜上床，另一端滑梯下来，床下是游戏帐篷
      const sw = .46, bx0 = X0 + sw, bx1 = X1 - 1.3, top = .95, za = Z0 + .03, zb = Z1 - .03, sz0 = Z1 - .62, sz1 = Z1 - .08;
      [[bx0 + .035, za], [bx1 - .035, za], [bx0 + .035, zb], [bx1 - .035, zb]].forEach(([x, z]) => post(g, P, x, z, top + .7));
      deck(g, P, bx0 + .05, bx1 - .05, za, zb, top, {quilt:q(), rails:{back:true, front:true, right:[[za, sz0 - .02]]}});
      stairs(g, P, X0, bx0, Z0, Z1, top + .1, 3);
      // 城堡垛口：护栏顶上的小方块
      for (let x = bx0 + .12; x < bx1 - .1; x += .24) g.add(box(.1, .08, .04, P.front, x, top + .26 + RAIL, zb - .02));
      // 床下游戏帐篷：前面两片布帘，中间留门
      const tm = fabric('#f7cdb9'), tm2 = fabric('#b9d3ec'), mx = (bx0 + bx1)/2;
      g.add(box(mx - .3 - bx0 - .06, top - .05, .015, tm, (bx0 + .06 + mx - .3)/2, .02, zb - .03), box(bx1 - .06 - mx - .3, top - .05, .015, tm2, (mx + .3 + bx1 - .06)/2, .02, zb - .03));
      g.add(box(bx1 - bx0 - .12, top - .05, .012, fabric('#f3e6d4'), mx, .02, za + .03));
      // 滑梯：斜板 + 两侧挡边 + 底部缓冲段 + 支腿
      const L = X1 - .08 - bx1, H = top + .1 - .1, len = Math.hypot(L, H), ang = Math.atan2(H, L), slide = mat('#f7d46a', {roughness:.3});
      const sg = new THREE.Group(); sg.position.set(bx1 + L/2, .1 + H/2, (sz0 + sz1)/2); sg.rotation.z = -ang; g.add(sg);
      sg.add(rbox(len, .035, sz1 - sz0, slide, 0, -.0175, 0, .012));
      [sz0, sz1].forEach(z => sg.add(rbox(len, .08, .025, mat('#7fb3d5', {roughness:.4}), 0, -.01, z - (sz0 + sz1)/2 + (z < (sz0 + sz1)/2 ? .0125 : -.0125), .01)));
      g.add(rbox(.3, .035, sz1 - sz0, slide, X1 - .2, .065, (sz0 + sz1)/2, .012));
      [[bx1 + L*.5, sz0 + .03], [bx1 + L*.5, sz1 - .03]].forEach(([x, z]) => g.add(rod([x, 0, z], [x, .1 + H*.5 - .02, z], .02, P.accent)));
      // 小旗子
      g.add(rod([bx1 - .035, top + .7, zb], [bx1 - .035, top + 1.05, zb], .008, P.accent), box(.18, .1, .005, mat('#e46f5c'), bx1 + .055, top + .93, zb));
      break;
    }
  }
}
