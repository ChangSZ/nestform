/* =====================================================================
 *  灯具（3D）：吸顶 / 吊灯 / 筒灯 / 轨道灯 / 浴霸 / 风扇灯 / 壁灯 / 镜前灯 / 床头吊灯 / 台灯 / 钓鱼灯。
 *  局部坐标与其他家具一致（背面朝 -z，y 向上，m）。顶棚高度 = K.H。
 *  每盏灯返回光源信息 {at:[x,y,z], k:强度, dist:照射距离}，夜景时在这里放一个点光源；
 *  mount：'ceil' 吸顶 / 吊装（只在漫游里显示，鸟瞰不挡视线），'wall' 壁装，'top' 放在下方家具的台面上，'floor' 落地。
 * ===================================================================== */
import * as THREE from 'three';
import {K, mat, box, rbox, cyl, lathe, rod, blob, ring, glowMat, chrome, blackMetal, woodM} from './kit.js';

/** 灯具类型（安装方式见 data.js MOUNT） */
const LAMPS = new Set(['ceilround', 'ceilsquare', 'chandelier', 'pendant', 'pendant3', 'fanlamp', 'downlight', 'tracklight', 'bathheater', 'bedpendant', 'walllamp', 'mirrorlight', 'tablelamp', 'archlamp', 'floorlamp']);
/** 算「主照明」的灯：房间里放了它们，就关掉这间房自动生成的顶灯 */
export const MAIN_LIGHTS = ['ceilround', 'ceilsquare', 'chandelier', 'pendant', 'pendant3', 'fanlamp', 'downlight', 'tracklight'];
export const isLamp = t => LAMPS.has(t);

const warm = (k = .9) => glowMat('#fffaf0', '#ffe3b0', k);
/** 吊杆 / 吊线：从顶棚垂到 y */
const drop = (g, x, z, y, m, r = .004) => g.add(rod([x, K.H, z], [x, y, z], r, m, r, 6));
const canopy = (g, x, z, m, r = .06) => g.add(cyl(r, r, .025, m, x, K.H - .025, z, 24));

export function buildLamp(g, t, w, d, c, R){
  const H = K.H, cm = mat(c, {roughness:.4, metalness:.5});
  switch (t){
    case 'ceilround': {                                                 // 圆形吸顶灯：薄圆盘 + 发光面罩
      const r = Math.min(w, d)/2;
      g.add(cyl(r, r, .03, mat('#f4f2ee', {roughness:.5}), 0, H - .03, 0, 64), cyl(r*.94, r*.97, .035, warm(1), 0, H - .065, 0, 64), ring(r*.97, .006, cm, 0, H - .035, 0));
      return {at:[0, H - .3, 0], k:6, dist:7};
    }
    case 'ceilsquare': {                                                // 方形吸顶灯：边框 + 发光面
      g.add(box(w, .03, d, mat('#f4f2ee', {roughness:.5}), 0, H - .03, 0), box(w - .04, .03, d - .04, warm(1), 0, H - .06, 0));
      [-1, 1].forEach(s => g.add(box(w, .008, .01, cm, 0, H - .06, s*(d/2 - .005)), box(.01, .008, d, cm, s*(w/2 - .005), H - .06, 0)));
      return {at:[0, H - .3, 0], k:6, dist:7};
    }
    case 'chandelier': {                                                // 客厅主灯：中心吊杆 + 放射状金属枝 + 球形灯泡
      const r = Math.min(w, d)/2, y = H - .55, bm = mat('#c9a86a', {metalness:.85, roughness:.3});
      canopy(g, 0, 0, bm, .08); drop(g, 0, 0, y, bm, .008); g.add(blob(.045, .045, .045, bm, 0, y, 0, 16));
      const n = 8;
      for (let i = 0; i < n; i++){
        const a = i/n*Math.PI*2, rr = r*(i % 2 ? .62 : .95), dy = i % 2 ? .1 : -.05, x = Math.cos(a)*rr, z = Math.sin(a)*rr;
        g.add(rod([0, y, 0], [x, y + dy, z], .006, bm), blob(.055, .055, .055, warm(1.1), x, y + dy, z, 16));
      }
      return {at:[0, y - .1, 0], k:7, dist:8};
    }
    case 'pendant': {                                                   // 餐厅一字吊灯：两根吊线 + 长条灯体（离地约 1.6m）
      const y = Math.max(1.55, H - 1.1), bm = blackMetal();
      [-1, 1].forEach(s => { canopy(g, s*(w/2 - .1), 0, bm, .04); drop(g, s*(w/2 - .1), 0, y + .04, bm, .002); });
      g.add(rbox(w, .04, Math.min(d, .07), bm, 0, y, 0, .012), box(w - .03, .006, Math.min(d, .07) - .02, warm(1.2), 0, y - .004, 0));
      return {at:[0, y - .15, 0], k:6, dist:5};
    }
    case 'pendant3': {                                                  // 三头吊灯：三个碗形灯罩一字排开
      const y = Math.max(1.6, H - 1.05), bm = mat(c, {roughness:.35, metalness:.6});
      for (let i = 0; i < 3; i++){
        const x = (i - 1)*(w/3), hh = i === 1 ? 0 : .06;
        canopy(g, x, 0, bm, .035); drop(g, x, 0, y + hh + .16, bm, .002);
        g.add(lathe([[.02, .16], [.07, .14], [.14, .02], [.15, 0]], bm, x, y + hh, 0, 40), blob(.035, .035, .035, warm(1.2), x, y + hh + .04, 0, 12));
      }
      return {at:[0, y - .1, 0], k:7, dist:5};
    }
    case 'fanlamp': {                                                   // 风扇灯：吊杆 + 电机 + 5 片扇叶 + 底部灯罩
      const r = Math.min(w, d)/2, y = H - .35, wm = woodM(c);
      canopy(g, 0, 0, mat('#ece9e3'), .07); drop(g, 0, 0, y + .12, mat('#ece9e3'), .012);
      g.add(cyl(.11, .12, .12, mat('#ece9e3', {roughness:.4}), 0, y, 0, 32), lathe([[.12, .0], [.1, -.06], [.0, -.08]].map(([a, b]) => [a, b + .08]), warm(1), 0, y - .08, 0, 32));
      for (let i = 0; i < 5; i++){
        const a = i/5*Math.PI*2, bl = rbox(r - .12, .012, .14, wm, 0, 0, 0, .006);
        bl.position.set(Math.cos(a)*(r/2 + .06), y + .05, Math.sin(a)*(r/2 + .06)); bl.rotation.y = -a; g.add(bl);
      }
      return {at:[0, y - .2, 0], k:6, dist:7};
    }
    case 'downlight': {                                                 // 筒灯：嵌入顶棚的小圆
      const r = Math.min(w, d)/2;
      g.add(cyl(r, r, .006, mat('#f2f1ee', {roughness:.4}), 0, H - .006, 0, 32), cyl(r*.72, r*.72, .006, warm(1.4), 0, H - .009, 0, 32));
      return {at:[0, H - .2, 0], k:2.5, dist:4};
    }
    case 'tracklight': {                                                // 磁吸轨道灯：吸顶轨道 + 若干射灯头
      const bm = blackMetal(), n = Math.max(2, Math.round(w/.4));
      g.add(box(w, .04, Math.min(d, .05), bm, 0, H - .04, 0));
      for (let i = 0; i < n; i++){
        const x = -w/2 + w*(i + .5)/n, head = new THREE.Group(); head.position.set(x, H - .05, 0);
        head.add(cyl(.032, .032, .1, bm, 0, -.1, 0, 20), cyl(.026, .026, .004, warm(1.5), 0, -.104, 0, 20)); head.rotation.x = (i % 2 ? .35 : -.35); g.add(head);
      }
      return {at:[0, H - .4, 0], k:5, dist:5};
    }
    case 'bathheater': {                                                // 浴霸：吸顶面板 + 中间照明 + 两侧出风格栅
      g.add(box(w, .02, d, mat('#f4f4f2', {roughness:.4}), 0, H - .02, 0), box(w*.45, .012, d*.3, warm(1.2), 0, H - .03, 0));
      [-1, 1].forEach(s => { for (let k = 0; k < 5; k++) g.add(box(w*.7, .006, .012, mat('#c9ced3'), 0, H - .026, s*(d*.22 + k*.025))); });
      return {at:[0, H - .3, 0], k:4, dist:4};
    }
    case 'bedpendant': {                                                // 床头吊灯：细吊线 + 小玻璃球，垂到床头柜上方
      const y = 1.2;
      canopy(g, 0, 0, cm, .035); drop(g, 0, 0, y + .14, cm, .0015);
      g.add(blob(.1, .1, .1, mat('#f1e7d3', {roughness:.1, transparent:true, opacity:.55}), 0, y + .05, 0, 24), blob(.03, .04, .03, warm(1.4), 0, y + .05, 0, 12), cyl(.02, .02, .03, cm, 0, y + .14, 0, 12));
      return {at:[0, y, 0], k:2, dist:3};
    }
    case 'walllamp': {                                                  // 壁灯：墙面底座 + 臂 + 灯罩（离地 1.8m）
      const y = 1.8, bz = -d/2;
      g.add(rbox(.1, .16, .02, cm, 0, y - .08, bz + .01, .008), rod([0, y, bz + .02], [0, y + .05, bz + d*.65], .008, cm));
      g.add(lathe([[.1, 0], [.07, .14]], glowMat('#f6ecd9', '#ffdca0', .6), 0, y - .02, bz + d*.65, 32), blob(.025, .025, .025, warm(1.3), 0, y + .05, bz + d*.65, 12));
      return {at:[0, y + .05, bz + d*.7], k:2, dist:3.5};
    }
    case 'mirrorlight': {                                               // 镜前灯：一字长条（离地 1.95m）
      const y = 1.95, bz = -d/2;
      const sm = mat(c, {metalness:.4, roughness:.3});                          // 浅色金属：纯镜面铬在暗环境里会显成黑条
      [-1, 1].forEach(s => g.add(box(.03, .04, .06, sm, s*(w/2 - .08), y - .02, bz + .03)));
      g.add(rbox(w, .045, .05, sm, 0, y - .02, bz + .08, .015), box(w - .02, .006, .036, warm(1.4), 0, y - .026, bz + .08));
      return {at:[0, y - .1, bz + .25], k:2.5, dist:3};
    }
    case 'tablelamp': {                                                 // 台灯：底座 + 灯杆 + 布灯罩（放在下方家具台面上，y0 由外部设定）
      const r = Math.min(w, d)/2;
      g.add(lathe([[r*.45, 0], [r*.45, .02], [.02, .04]], cm, 0, 0, 0, 32), rod([0, .03, 0], [0, .3, 0], .008, cm));
      g.add(lathe([[r*.85, 0], [r*.6, .2]], glowMat('#f3e9d8', '#ffdca0', .6), 0, .25, 0, 40), blob(.03, .03, .03, warm(1.3), 0, .3, 0, 12));
      return {at:[0, .32, 0], k:1.6, dist:3};
    }
    case 'archlamp': {                                                  // 钓鱼灯：大理石底座 + 弧形灯臂 + 半球灯罩
      const base = mat('#e8e4dd', {roughness:.2}), bm = chrome(), ex = w/2 - .2;
      g.add(cyl(.17, .18, .06, base, -w/2 + .2, 0, 0, 40));
      const pts = []; for (let k = 0; k <= 16; k++){ const a = k/16*Math.PI*.82; pts.push(new THREE.Vector3(-w/2 + .2 + (1 - Math.cos(a))*((w - .4)/(1 - Math.cos(Math.PI*.82))), .06 + Math.sin(a)*1.75 + k/16*.2, 0)); }
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, .012, 8), bm));
      const hy = pts.at(-1).y - .02;
      g.add(new THREE.Mesh(new THREE.SphereGeometry(.2, 32, 12, 0, Math.PI*2, 0, Math.PI/2), mat('#2d2d2d', {roughness:.4, metalness:.6, side:THREE.DoubleSide})).translateX(ex).translateY(hy), blob(.05, .03, .05, warm(1.4), ex, hy - .01, 0, 14));
      return {at:[ex, hy - .1, 0], k:3, dist:4.5};
    }
    case 'floorlamp': return {at:[0, 1.36, 0], k:2.2, dist:4};
  }
  return null;
}
