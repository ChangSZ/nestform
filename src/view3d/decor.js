/* =====================================================================
 *  各空间的小件家具 / 软装 / 窗帘（3D）。局部坐标与其他家具一致：x 沿宽度，背面（贴墙一侧）朝 -z，y 向上，单位 m。
 *  壁装类（挂画、镜柜、油烟机、暖气片…）的离地高度写在模型里；吊装类挂到顶棚 K.H。
 * ===================================================================== */
import * as THREE from 'three';
import {K, mat, box, rbox, cyl, lathe, rod, tube, blob, fabric, woodM, darker, lighter, legs, chrome, blackMetal, mirror, ceramic, glowMat, screenMat, pull} from './kit.js';

const BINS = ['#f2b8a0', '#8fb3d9', '#a8d0b0', '#f3d27a', '#c7b3e0'];
const sheerMat = () => mat('#fbfaf6', {roughness:.95, transparent:true, opacity:.45, side:THREE.DoubleSide});

/** 由本模块建模的类型 */
export const DECOR = new Set(['benchend', 'stool', 'tatami', 'kiddesk', 'toyshelf', 'playtent', 'playmat', 'soundbar', 'screen', 'rocker', 'chaise', 'aquarium', 'cattree', 'petbed', 'hood', 'microwave', 'trashbin', 'smarttoilet', 'mirrorcab', 'towelrack', 'mopsink', 'shoebench', 'coatrack', 'fullmirror', 'dryrack', 'balconyset', 'hangchair', 'plantstand', 'painting', 'decomirror', 'vase', 'drapes', 'rollerblind', 'venetian', 'robotvac', 'dehumid', 'freshair', 'radiator']);

export function buildDecor(g, t, w, d, c, R){
  const H = K.H, bz = -d/2, fz = d/2;
  switch (t){
    /* ---------- 卧室 ---------- */
    case 'benchend': {                                                  // 床尾凳：软包凳面 + 木腿
      legs(g, w, d, .32, woodM('#6b543f'), .06, .02);
      g.add(rbox(w, .13, d, fabric(c), 0, .32, 0, .04), rbox(w - .04, .02, d - .04, fabric(darker(c, .85)), 0, .44, 0, .01));
      break;
    }
    case 'stool': {                                                     // 化妆凳：圆软垫 + 细金属腿
      const r = Math.min(w, d)/2, bm = mat('#c9a86a', {metalness:.85, roughness:.3});
      for (let i = 0; i < 4; i++){ const a = i*Math.PI/2 + Math.PI/4; g.add(rod([Math.cos(a)*r*.7, 0, Math.sin(a)*r*.7], [Math.cos(a)*r*.45, .4, Math.sin(a)*r*.45], .01, bm)); }
      g.add(cyl(r, r*.95, .1, fabric(c), 0, .4, 0, 40));
      break;
    }
    case 'tatami': {                                                    // 榻榻米地台：木平台 + 草席分块 + 正面抽屉
      const ph = .35, wm = woodM(c);
      g.add(box(w, ph - .02, d, wm, 0, 0, 0));
      const nx = Math.max(1, Math.round(w/.9)), nz = Math.max(1, Math.round(d/1.8)), mw = w/nx, md = d/nz;
      for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) g.add(rbox(mw - .02, .03, md - .02, mat('#cbbf8a', {roughness:.9}), -w/2 + mw*(i + .5), ph - .03, -d/2 + md*(k + .5), .008));
      for (let i = 0; i < nx; i++){ g.add(box(mw - .04, ph - .1, .008, mat(lighter(c, .2), {roughness:.5}), -w/2 + mw*(i + .5), .05, fz + .004)); pull(g, .2, false, -w/2 + mw*(i + .5), ph - .1, fz); }
      break;
    }
    /* ---------- 儿童房 ---------- */
    case 'kiddesk': {                                                   // 儿童书桌椅：桌在靠墙一侧，椅子在前面
      const dd = Math.min(.6, d*.62), top = .62, wm = mat(c, {roughness:.5}), acc = mat('#8fb3d9', {roughness:.5});
      [-1, 1].forEach(s => g.add(box(.03, top, dd - .04, wm, s*(w/2 - .015), 0, bz + dd/2)));
      g.add(rbox(w, .025, dd, wm, 0, top, bz + dd/2, .006), box(w - .06, .14, .015, acc, 0, top + .025, bz + .01));
      const cz = bz + dd + .18, cw = .38;                                 // 椅子
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => g.add(rod([a*cw*.42, 0, cz + b*.15], [a*cw*.4, .34, cz + b*.14], .012, acc)));
      g.add(rbox(cw, .04, .34, wm, 0, .34, cz, .015), rbox(cw, .22, .025, acc, 0, .5, cz + .17, .01));
      break;
    }
    case 'toyshelf': {                                                  // 玩具收纳柜：格子 + 彩色收纳盒
      const h = .8, wm = mat(c, {roughness:.55}), cols = Math.max(2, Math.round(w/.33)), rows = 2;
      g.add(box(w, .02, d, wm, 0, 0, 0), box(w, .02, d, wm, 0, h - .02, 0), box(w, h, .012, wm, 0, 0, bz + .006));
      for (let i = 0; i <= cols; i++) g.add(box(.018, h, d, wm, -w/2 + .009 + (w - .018)*i/cols, 0, 0));
      g.add(box(w, .018, d, wm, 0, h/2 - .01, 0));
      for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++){ const cw = (w - .018)/cols; g.add(rbox(cw - .04, h/2 - .07, d - .05, fabric(BINS[(i + k*2) % 5]), -w/2 + .009 + cw*(i + .5), .02 + k*(h/2 - .01) + .01, .01, .02)); }
      g.add(rbox(.3, .02, d*.8, wm, 0, h, 0, .006), blob(.06, .07, .05, mat('#c9a27a'), -w/4, h + .07, 0, 16), blob(.045, .045, .045, mat('#e46f5c'), w/4, h + .045, 0, 16));
      break;
    }
    case 'playtent': {                                                  // 游戏帐篷：锥形帐篷，正面留门
      const r = Math.min(w, d)/2*.95, h = 1.55, wm = woodM('#c9a27a');
      for (let i = 0; i < 4; i++){ const a = i*Math.PI/2 + Math.PI/4; g.add(rod([Math.cos(a)*r, 0, Math.sin(a)*r], [-Math.cos(a)*.08, h + .15, -Math.sin(a)*.08], .014, wm)); }
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r*.98, h, 4, 1, true, Math.PI/4 + .55, Math.PI*2 - 1.1), fabric(c)); cone.position.y = h/2; cone.material.side = THREE.DoubleSide; g.add(cone);
      g.add(cyl(r*.8, r*.8, .04, fabric('#f3e6d4'), 0, 0, 0, 4), blob(.12, .07, .1, fabric('#8fb3d9'), r*.25, .1, -r*.2, 16));
      break;
    }
    case 'playmat': {                                                   // 爬行垫：薄垫 + 彩色方块图案
      g.add(rbox(w, .015, d, mat('#f4efe6', {roughness:.95}), 0, 0, 0, .006));
      const n = 4, cw = w/n, cd = d/n;
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) if ((i + k) % 2) g.add(box(cw - .04, .002, cd - .04, mat(BINS[(i*3 + k) % 5], {roughness:.95}), -w/2 + cw*(i + .5), .015, -d/2 + cd*(k + .5)));
      break;
    }
    /* ---------- 客厅 ---------- */
    case 'soundbar': {                                                  // 回音壁：长条音箱（放在电视柜上）
      g.add(rbox(w, .07, d, mat(c, {roughness:.6}), 0, 0, 0, .025), box(w - .04, .05, .002, mat('#3a3a3c', {roughness:.95}), 0, .01, fz + .001));
      break;
    }
    case 'screen': {                                                    // 投影幕布：吸顶幕布盒 + 垂下的幕面
      const sh = Math.min(1.7, H - 1.1);
      g.add(box(w, .1, .1, mat('#e9e9e7'), 0, H - .1, 0), box(w - .12, sh, .004, mat('#fbfbfa', {roughness:.9}), 0, H - .1 - sh, .01));
      g.add(box(w - .1, .025, .02, mat('#2b2b2d'), 0, H - .1 - sh - .02, .01), box(w - .12, .06, .005, mat('#1d1d1f'), 0, H - .16, .013));
      break;
    }
    case 'rocker': {                                                    // 摇椅：弧形底撑 + 斜靠背 + 软垫
      const wm = woodM(c), sw = Math.min(w, .62), sy = .4;
      [-1, 1].forEach(s => { const x = s*sw/2, pts = []; for (let k = 0; k <= 12; k++){ const u = k/12; pts.push([x, .04 + (u - .5)**2*.35, -d/2 + .05 + u*(d - .1)]); } g.add(tube(pts, .016, wm, 24));
        g.add(rod([x, .1, -d*.2], [x, sy, -d*.12], .016, wm), rod([x, .1, d*.25], [x, sy, d*.2], .016, wm), rod([x, sy, -d*.15], [x, .95, -d*.42], .018, wm), rod([x, sy + .22, d*.18], [x, sy + .22, -d*.1], .016, wm)); });
      g.add(rbox(sw, .07, d*.4, fabric('#e9e2d6'), 0, sy, d*.02, .03));
      const back = rbox(sw, .55, .06, fabric('#e9e2d6'), 0, 0, 0, .03); back.position.set(0, sy + .32, -d*.3); back.rotation.x = -.42; g.add(back);
      break;
    }
    case 'chaise': {                                                    // 贵妃椅：长坐面 + 一端高起的靠背
      const fab = fabric(c), dk = fabric(darker(c, .85));
      legs(g, w, d, .1, woodM('#3a3027'), .06, .015);
      g.add(rbox(w, .3, d, dk, 0, .1, 0, .04), rbox(w - .1, .1, d - .1, fab, .03, .38, 0, .04));
      g.add(rbox(.3, .5, d, dk, -w/2 + .15, .1, 0, .07), rbox(w*.55, .32, .16, dk, -w/2 + w*.3, .3, bz + .08, .06));
      g.add(blob(.24, .1, .1, fabric('#efe7da'), -w/2 + .4, .55, bz + .25, 20));
      break;
    }
    case 'aquarium': {                                                  // 鱼缸：底柜 + 玻璃缸 + 水草 + 小鱼
      const ch = .72, th = .5, cm = mat(c, {roughness:.4});
      g.add(box(w, ch, d, cm, 0, 0, 0)); [-1, 1].forEach(s => pull(g, .2, false, s*w/4, ch*.6, fz));
      g.add(box(w, th, d, mat('#bfe3f2', {roughness:.05, transparent:true, opacity:.28}), 0, ch, 0), box(w - .02, th*.85, d - .02, mat('#5fa8c9', {roughness:.1, transparent:true, opacity:.35}), 0, ch + .01, 0));
      g.add(box(w, .04, d, cm, 0, ch + th, 0), box(w - .02, .03, d - .02, mat('#d9cfb6'), 0, ch + .005, 0), box(w*.7, .006, .02, glowMat('#ffffff', '#e6f6ff', 1), 0, ch + th - .004, 0));
      for (let i = 0; i < 6; i++) g.add(blob(.025, .1 + R()*.08, .025, mat('#4c9a5a', {roughness:.7}), -w/2 + .1 + R()*(w - .2), ch + .1, -d/4 + R()*d/2, 10));
      for (let i = 0; i < 5; i++) g.add(blob(.025, .012, .008, mat(['#f08a3c', '#f3d27a', '#e46f5c'][i % 3]), -w/2 + .15 + R()*(w - .3), ch + .15 + R()*.25, -d/4 + R()*d/2, 10));
      break;
    }
    case 'cattree': {                                                   // 猫爬架：底板 + 麻绳柱 + 多层平台 + 猫窝
      const rope = mat('#c9b48c', {roughness:1}), pm = fabric(c), r = Math.min(w, d)/2;
      g.add(rbox(w, .04, d, pm, 0, 0, 0, .02));
      [[-r*.45, -r*.3, 1.2], [r*.4, r*.35, .75]].forEach(([x, z, h]) => g.add(cyl(.045, .045, h, rope, x, .04, z, 16)));
      g.add(rbox(w*.6, .03, d*.55, pm, -r*.3, .75, -r*.15, .015), rbox(w*.5, .03, d*.5, pm, -r*.3, 1.22, -r*.25, .015), rbox(w*.55, .3, d*.5, pm, r*.25, .04, r*.2, .04));
      g.add(cyl(.08, .08, .01, mat('#2b2b2d'), r*.25, .2, r*.2 + d*.25 + .001, 20).rotateX(Math.PI/2));
      g.add(blob(.1, .06, .08, mat('#f0a870'), -r*.3, 1.3, -r*.25, 16));
      break;
    }
    case 'petbed': {                                                    // 宠物窝：椭圆围边 + 软垫
      const ring0 = new THREE.Mesh(new THREE.TorusGeometry(.5, .14, 14, 40), fabric(c)); ring0.scale.set(w*.85, d*.85, 1); ring0.rotation.x = Math.PI/2; ring0.position.y = .1; g.add(ring0);
      g.add(blob(w*.36, .05, d*.32, fabric('#efe7da'), 0, .06, 0, 24));
      break;
    }
    /* ---------- 餐厨 ---------- */
    case 'hood': {                                                      // 抽油烟机：烟管 + 斜面机身（下沿离地约 1.65m）
      const y0 = 1.65, sm = mat(c, {metalness:.7, roughness:.3});
      g.add(box(.3, H - y0 - .38, .25, sm, 0, y0 + .38, bz + .125));
      const body = box(w, .38, d*.75, sm, 0, 0, 0); body.position.set(0, y0 + .19 - .19, bz + d*.375); g.add(body);
      g.add(box(w - .02, .3, .01, mat('#1d1f22', {roughness:.15, metalness:.4}), 0, y0 + .05, bz + d*.75 + .004), box(.12, .02, .003, screenMat('#2a6f8f'), w/3, y0 + .3, bz + d*.75 + .01));
      break;
    }
    case 'microwave': {                                                 // 微波炉：箱体 + 玻璃门 + 控制面板（放在台面上）
      const h = .3;
      g.add(rbox(w, h, d, mat(c, {roughness:.35}), 0, 0, 0, .015), box(w*.68, h - .06, .008, mat('#1a1d20', {roughness:.08}), -w*.12, .03, fz + .002), box(w*.18, h - .08, .006, mat('#d8dde2'), w*.36, .04, fz + .002));
      break;
    }
    case 'trashbin': {                                                  // 垃圾桶：脚踏桶
      g.add(rbox(w, .55, d, mat(c, {metalness:.6, roughness:.3}), 0, 0, 0, .06), rbox(w + .01, .04, d + .01, mat(darker(c, .8)), 0, .55, 0, .02), box(w*.4, .02, .05, blackMetal(), 0, .03, fz + .02));
      break;
    }
    /* ---------- 卫浴 ---------- */
    case 'smarttoilet': {                                               // 智能马桶：无水箱一体式 + 侧边控制
      const cm = ceramic();
      g.add(lathe([[.17, 0], [.15, .2], [.19, .38], [.0, .4]], cm, 0, 0, d*.08, 40), rbox(w, .42, d*.38, cm, 0, 0, bz + d*.19, .08));
      g.add(rbox(w*.95, .03, d*.62, mat('#f6f6f4', {roughness:.3}), 0, .4, d*.05, .1), rbox(w*.95, .05, d*.6, mat('#ffffff', {roughness:.25}), 0, .43, d*.04, .12));
      g.add(box(.05, .08, .1, mat('#d8dde2'), w/2 + .02, .38, bz + d*.3), box(.08, .006, .03, screenMat('#2a6f8f'), 0, .47, bz + d*.2));
      break;
    }
    case 'mirrorcab': {                                                 // 浴室镜柜：壁挂柜体 + 镜面门 + 底部灯带（离地 1.2m）
      const y0 = 1.2, h = .7;
      g.add(box(w, h, d, mat(c, {roughness:.5}), 0, y0, 0), box(w/2 - .01, h - .02, .006, mirror(), -w/4, y0 + .01, fz + .003), box(w/2 - .01, h - .02, .006, mirror(), w/4, y0 + .01, fz + .003));
      g.add(box(w - .04, .008, .02, glowMat('#ffffff', '#fff3dd', 1), 0, y0 - .008, 0));
      break;
    }
    case 'towelrack': {                                                 // 毛巾架：两根横杆 + 搭着的毛巾（离地 1.3–1.55m）
      const cm = chrome();
      [1.3, 1.55].forEach(y => { g.add(rod([-w/2 + .03, y, bz + .08], [w/2 - .03, y, bz + .08], .01, cm)); [-1, 1].forEach(s => g.add(rod([s*(w/2 - .03), y, bz], [s*(w/2 - .03), y, bz + .08], .008, cm))); });
      g.add(rbox(w*.55, .5, .03, fabric(['#f3e6d4', '#bcd7e6'][Math.floor(R()*2)]), -w*.1, 1.08, bz + .085, .012), rbox(w*.45, .08, .05, fabric('#f3e6d4'), w*.15, 1.5, bz + .08, .02));
      break;
    }
    case 'mopsink': {                                                   // 拖把池：落地陶瓷池 + 墙上龙头
      const cm = ceramic();
      g.add(rbox(w, .35, d, cm, 0, 0, 0, .03), box(w - .08, .02, d - .08, mat('#d7dde2'), 0, .2, .01));
      g.add(tube([[0, .75, bz], [0, .75, bz + .08], [0, .68, bz + .12]], .012, chrome()), cyl(.02, .02, .05, chrome(), .06, .73, bz + .03, 12));
      break;
    }
    /* ---------- 玄关 ---------- */
    case 'shoebench': {                                                 // 换鞋凳：坐垫 + 下方鞋格
      const wm = woodM(c);
      [-1, 1].forEach(s => g.add(box(.03, .42, d, wm, s*(w/2 - .015), 0, 0)));
      g.add(box(w, .02, d, wm, 0, .12, 0), rbox(w, .06, d, fabric('#e9e2d6'), 0, .42, 0, .02), box(w, .02, d, wm, 0, .4, 0));
      for (let i = 0; i < 3; i++) g.add(rbox(.12, .08, .26, mat(['#2b2b2d', '#c9a27a', '#e9e2d6'][i]), -w/3 + i*w/3, .14, 0, .03));
      break;
    }
    case 'coatrack': {                                                  // 衣帽架：立柱 + 挂钩 + 挂着的外套和帽子
      const wm = woodM(c);
      g.add(cyl(.2, .22, .03, wm, 0, 0, 0, 24), cyl(.02, .025, 1.75, wm, 0, .03, 0, 16));
      for (let i = 0; i < 4; i++){ const a = i*Math.PI/2; g.add(rod([0, 1.6, 0], [Math.cos(a)*.15, 1.72, Math.sin(a)*.15], .01, wm)); }
      g.add(blob(.16, .4, .09, fabric('#5a6b80'), .12, 1.3, 0, 20), blob(.13, .05, .13, fabric('#c9a27a'), -.1, 1.76, .05, 16));
      break;
    }
    case 'fullmirror': {                                                // 穿衣镜：靠墙斜放的落地镜
      const mh = 1.6, o = new THREE.Group(); o.position.set(0, 0, bz + .05); o.rotation.x = -.09; g.add(o);
      o.add(box(w, mh, .03, woodM(c), 0, 0, 0), box(w - .06, mh - .06, .006, mirror(), 0, .03, .017));
      break;
    }
    /* ---------- 阳台 ---------- */
    case 'dryrack': {                                                   // 升降晾衣架：吸顶座 + 两根晾杆 + 衣架衣服
      const am = mat('#d8dde2', {metalness:.6, roughness:.3}), y = H - .6;
      [-1, 1].forEach(s => { g.add(box(.25, .06, .16, am, s*(w/2 - .2), H - .06, 0)); [-1, 1].forEach(t2 => g.add(rod([s*(w/2 - .2), H - .06, t2*.05], [s*(w/2 - .2), y, t2*.12], .002, am))); });
      [-.12, .12].forEach(z => g.add(rod([-w/2, y, z], [w/2, y, z], .012, am)));
      for (let i = 0; i < 5; i++){                                      // 衣架上的上衣：衣身 + 两只袖子
        const x = -w/2 + .3 + i*(w - .6)/4, z = i % 2 ? .12 : -.12, fm = fabric(BINS[i % 5]);
        g.add(rbox(.34, .5, .02, fm, x, y - .56, z, .01), tube([[x - .18, y - .05, z], [x, y + .02, z], [x + .18, y - .05, z]], .004, am, 10));
        [-1, 1].forEach(sd => { const sl = rbox(.1, .26, .02, fm, 0, 0, 0, .01); sl.position.set(x + sd*.2, y - .3, z); sl.rotation.z = sd*.5; g.add(sl); });
      }
      break;
    }
    case 'balconyset': {                                                // 阳台桌椅：小圆桌 + 两把椅子
      const wm = woodM(c), bm = blackMetal(), r = Math.min(.32, d/2);
      g.add(cyl(r, r, .025, wm, 0, .62, 0, 32), cyl(.02, .02, .6, bm, 0, .02, 0, 12), cyl(.2, .2, .02, bm, 0, 0, 0, 24));
      [-1, 1].forEach(s => { const x = s*(w/2 - .22), cg = new THREE.Group(); cg.position.x = x; cg.rotation.y = s*Math.PI/2; g.add(cg);
        legs(cg, .42, .42, .42, bm, .02, .012); cg.add(rbox(.42, .04, .42, wm, 0, .42, 0, .01), rbox(.42, .32, .03, wm, 0, .5, -.2, .01)); });
      g.add(cyl(.04, .035, .09, ceramic(), .08, .645, 0, 16), blob(.05, .06, .05, mat('#79a87e'), -.1, .7, .05, 12));
      break;
    }
    case 'hangchair': {                                                 // 吊椅：落地 C 形支架 + 藤编蛋形椅 + 坐垫
      const bm = blackMetal(), rr = Math.min(w, d)/2, cy = .95;
      g.add(cyl(rr*.75, rr*.8, .04, bm, 0, 0, bz + rr*.75, 32));
      g.add(tube([[0, .04, bz + .1], [0, 1.2, bz + .05], [0, 1.95, bz + .3], [0, 1.95, 0]], .025, bm, 40), rod([0, 1.95, 0], [0, cy + .5, 0], .008, bm));
      const egg = new THREE.Mesh(new THREE.SphereGeometry(.48, 32, 18, Math.PI*.15, Math.PI*1.7), mat(c, {roughness:.9, side:THREE.DoubleSide}));
      egg.scale.set(1, 1.25, .95); egg.position.set(0, cy, 0); egg.rotation.y = Math.PI/2; g.add(egg);
      g.add(blob(.38, .08, .32, fabric('#f3e6d4'), 0, cy - .42, .03, 20), blob(.3, .25, .08, fabric('#efe7da'), 0, cy - .08, -.25, 20));
      break;
    }
    case 'plantstand': {                                                // 花架：三层阶梯 + 盆栽
      const wm = woodM(c);
      [-1, 1].forEach(s => g.add(rod([s*(w/2 - .02), 0, fz - .03], [s*(w/2 - .02), 1.0, bz + .03], .015, wm), rod([s*(w/2 - .02), 0, bz + .03], [s*(w/2 - .02), 1.0, bz + .03], .015, wm)));
      [[.35, fz - .07], [.65, 0], [.95, bz + .07]].forEach(([y, z], k) => { g.add(box(w, .02, .12, wm, 0, y, z));
        for (let i = 0; i < 2; i++){ const x = (i ? 1 : -1)*w/4 + (k % 2 ? .05 : -.05); g.add(cyl(.06, .045, .1, ceramic(), x, y + .02, z, 16), blob(.09, .1, .09, mat(['#79a87e', '#86b28a', '#5f8f68'][(i + k) % 3], {roughness:.8}), x, y + .18, z, 14)); } });
      break;
    }
    /* ---------- 装饰 ---------- */
    case 'painting': {                                                  // 挂画：画框 + 抽象色块（中心离地 1.5m）
      const h = Math.min(.9, w*.7), y0 = 1.5 - h/2;
      g.add(box(w, h, d, mat('#2b2b2d', {roughness:.5}), 0, y0, 0), box(w - .06, h - .06, .006, mat('#f4f1ea', {roughness:.9}), 0, y0 + .03, fz + .002));
      for (let i = 0; i < 4; i++){ const cw = .1 + R()*w*.35, chh = .08 + R()*h*.4; g.add(box(cw, chh, .004, mat([c, '#8fb3d9', '#e6c07b', '#6f8f8a'][i], {roughness:.85}), -w/2 + .08 + cw/2 + R()*(w - .16 - cw), y0 + .06 + R()*(h - .12 - chh), fz + .006)); }
      break;
    }
    case 'decomirror': {                                                // 装饰镜：圆镜 + 金属边框（中心离地 1.5m）
      const r = w/2, fr = new THREE.Mesh(new THREE.TorusGeometry(r - .015, .015, 12, 64), mat(c, {metalness:.85, roughness:.3}));
      fr.position.set(0, 1.5, bz + .02); g.add(fr);
      const mm = new THREE.Mesh(new THREE.CircleGeometry(r - .02, 64), mirror()); mm.position.set(0, 1.5, bz + .021); g.add(mm);
      break;
    }
    case 'vase': {                                                      // 花瓶摆件：陶瓷花瓶 + 几枝花（放在台面上）
      const r = Math.min(w, d)/2;
      g.add(lathe([[r*.35, 0], [r*.55, .08], [r*.3, .22], [r*.22, .26], [r*.28, .28]], mat(c, {roughness:.3}), 0, 0, 0, 32));
      for (let i = 0; i < 3; i++){ const a = i*2.1, x = Math.cos(a)*.05, z = Math.sin(a)*.05; g.add(rod([0, .26, 0], [x, .48 + i*.04, z], .003, mat('#5f8f68')), blob(.025, .025, .025, mat(['#f2b8a0', '#f3d27a', '#ffffff'][i]), x, .49 + i*.04, z, 10)); }
      break;
    }
    /* ---------- 窗帘（靠背一侧贴窗） ---------- */
    case 'drapes': {                                                    // 布帘 + 纱帘：顶棚轨道，纱帘拉满，两侧布帘收拢
      const top = H - .05, ch = top - .02, cm = fabric(c);
      g.add(box(w, .04, .1, mat('#e9e9e7'), 0, top, bz + .05));
      g.add(box(w - .04, ch, .006, sheerMat(), 0, .02, bz + .03));
      const pw = Math.max(.25, w*.16), n = 6;
      [-1, 1].forEach(s => { for (let k = 0; k < n; k++){ const x = s*(w/2 - .04 - pw*(k + .5)/n); g.add(rbox(pw/n + .025, ch, .05, cm, x, .02, bz + .08 + (k % 2 ? .02 : -.01), .02)); } });
      break;
    }
    case 'rollerblind': {                                               // 卷帘：窗顶卷帘盒 + 放下一半的帘面
      const top = Math.min(H - .15, 2.35), drop2 = 1.0;
      g.add(rbox(w, .08, .08, mat('#eeeeec'), 0, top, bz + .04, .02), box(w - .03, drop2, .004, mat(c, {roughness:.95, side:THREE.DoubleSide}), 0, top - drop2, bz + .04), box(w - .02, .025, .02, mat(darker(c, .7)), 0, top - drop2 - .02, bz + .04));
      break;
    }
    case 'venetian': {                                                  // 百叶帘：顶轨 + 一片片叶片
      const top = Math.min(H - .15, 2.35), bot = 1.05, sm = mat(c, {roughness:.5});
      g.add(box(w, .05, .06, sm, 0, top, bz + .04));
      for (let y = top - .04; y > bot; y -= .035){ const s = box(w - .02, .003, .05, sm, 0, y, bz + .04); s.rotation.x = .35; g.add(s); }
      g.add(box(w - .02, .02, .05, mat(darker(c, .8)), 0, bot - .02, bz + .04));
      break;
    }
    /* ---------- 家电 ---------- */
    case 'robotvac': {                                                  // 扫地机器人：集尘基站 + 机器人
      g.add(rbox(w*.9, .42, d*.5, mat(c, {roughness:.35}), 0, 0, bz + d*.25, .04), box(w*.5, .04, .004, screenMat('#2a6f8f'), 0, .34, bz + d*.5 + .002));
      g.add(cyl(.17, .17, .09, mat('#2b2b2d', {roughness:.3}), 0, 0, bz + d*.72, 40), cyl(.05, .05, .015, mat('#e6ebee'), 0, .09, bz + d*.66, 24));
      break;
    }
    case 'dehumid': {                                                   // 除湿机：方形机身 + 顶部格栅
      g.add(rbox(w, .58, d, mat(c, {roughness:.35}), 0, 0, 0, .03), box(w - .06, .005, d - .06, mat('#b8bec4'), 0, .58, 0), box(w - .06, .2, .005, mat(darker(c, .9)), 0, .08, fz + .002));
      break;
    }
    case 'freshair': {                                                  // 新风机（壁挂）：离地 1.9m
      const y0 = 1.9;
      g.add(rbox(w, .36, d, mat(c, {roughness:.35}), 0, y0, 0, .03), box(w - .1, .04, .004, mat('#c9ced3'), 0, y0 + .04, fz + .002), box(.06, .015, .003, screenMat('#2a6f8f'), w/2 - .1, y0 + .28, fz + .003));
      break;
    }
    case 'radiator': {                                                  // 暖气片：竖向钢管（离地 0.15–0.75m）
      const n = Math.max(4, Math.round(w/.06)), rm = mat(c, {roughness:.35});
      for (let i = 0; i < n; i++) g.add(rbox(.045, .6, d*.7, rm, -w/2 + w*(i + .5)/n, .15, 0, .015));
      [.18, .7].forEach(y => g.add(rod([-w/2, y, 0], [w/2, y, 0], .016, rm)));
      break;
    }
  }
}
