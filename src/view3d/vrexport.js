/* =====================================================================
 *  导出 VR 看房：每个房间在人眼高度拍一张 360° 全景（立方体相机 → 等距柱状投影），
 *  门洞 / 开敞处生成热点，连同小地图打包成一个可离线打开的 HTML。
 * ===================================================================== */
import * as THREE from 'three';
import {tr, nm} from '../i18n.js';
import {COARSE, state, P} from '../store.js';
import {area} from '../geom.js';
import {pointInPoly} from '../import/rooms.js';
import {facing} from '../plan2d/partitions.js';
import {isDem} from '../demolish.js';
import {planImage} from '../exporter.js';
import {K, wx, wz} from './kit.js';
import {renderer, opt, archUp, labelG, furnG, selHelper, sync, syncCutBtns, applyLight, draw, withSize} from './index.js';
import VIEWER from './vr-viewer.html?raw';

const EYE = 1.55, TW = 240, TH = 124;
// 全景分辨率：电脑上 6144×3072（约 17 像素 / 度，1080p 屏按默认视场看基本是 1:1）；平板 / 手机显存小，用 4096×2048。
// CUBE = 每个方向那张图里中间 90° 的边长：要比全景同一角度的像素多一些，拼接时是缩小采样，线条才利落
const PW = COARSE ? 4096 : 6144, PH = PW/2, CUBE = COARSE ? 1792 : 2304;
// 让出一帧给界面刷新提示；页面在后台时 rAF 会暂停，用定时器兜底，导出不至于卡住
const frame = () => new Promise(r => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
const isH = r => (r[2] - r[0]) >= (r[3] - r[1]);

/** 挡视线的障碍物（mm 矩形）：未拆除的墙、隔断柜 / 窗、入户门、敞开的门扇，以及高家具（衣柜 / 冰箱…）的占地 */
function obstacles(tall){
  const pl = P(), R = [];
  pl.walls.forEach((w, i) => { if (!isDem('wall', i)) R.push(w.slice(0, 4)); });
  pl.wins.forEach((w, i) => { if (!isDem('win', i)) R.push(w.slice(0, 4)); });
  pl.doors.forEach((d, i) => { if (d.entry && !isDem('door', i)) R.push(d.rect); });      // 入户门外是空的，不朝那边看
  pl.doors.forEach((d, i) => {                                                               // 敞开的门扇：别贴着门扇站，否则半个画面都是门板
    if (d.style === 'arch' || isDem('door', i) || !d.o || !d.h) return;
    const k = d.len/(Math.hypot(d.o[0], d.o[1]) || 1), ex = d.h[0] + d.o[0]*k, ey = d.h[1] + d.o[1]*k;
    R.push([Math.min(d.h[0], ex) - 30, Math.min(d.h[1], ey) - 30, Math.max(d.h[0], ex) + 30, Math.max(d.h[1], ey) + 30]);
  });
  tall.forEach(b => R.push(boxRect(b)));
  return R;
}
const boxRect = b => [b.min.x*1000 + K.ox, b.min.z*1000 + K.oy, b.max.x*1000 + K.ox, b.max.z*1000 + K.oy];
const rectDist = ([x, y], r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
/** 房间附近（外扩 1.5m）的障碍物 */
function nearOf(room, obs){
  const xs = room.poly.map(p => p[0]), ys = room.poly.map(p => p[1]);
  return obs.filter(r => r[2] > Math.min(...xs) - 1500 && r[0] < Math.max(...xs) + 1500 && r[3] > Math.min(...ys) - 1500 && r[1] < Math.max(...ys) + 1500);
}
/** 房间内的候选点（100mm 网格）→ [{p, i, j, clear}]（clear：离墙 / 家具的净距） */
function candidates(room, near){
  const poly = room.poly, xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs) + 50, y0 = Math.min(...ys) + 50, out = [];
  for (let i = 0, x = x0; x < Math.max(...xs); x += 100, i++) for (let j = 0, y = y0; y < Math.max(...ys); y += 100, j++){
    if (!pointInPoly([x, y], poly)) continue;
    const edge = Math.min(...poly.map((p, k) => { const q = poly[(k + 1) % poly.length]; return rectDist([x, y], [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]); }));
    out.push({p:[x, y], i, j, clear:Math.min(edge, ...near.map(r => rectDist([x, y], r)))});
  }
  return out;
}
/** 两点之间是否通视：线段全程在房间内、不穿过墙 / 高家具 */
function walkable(a, b, poly, near){
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])/100);
  for (let i = 1; i < n; i++){ const t = i/n, q = [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t]; if (!pointInPoly(q, poly) || near.some(r => rectDist(q, r) < 150)) return false; }
  return true;
}
/** 站在 a 能否看到 b 处的地面：视线从眼睛高度斜向下，途中经过的矮家具（床 / 沙发 / 桌子）比视线高就挡住了 */
function floorSeen(a, b, low){
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])/100);
  for (let i = 1; i <= n; i++){ const t = i/n, x = a[0] + (b[0] - a[0])*t, y = a[1] + (b[1] - a[1])*t, h = EYE*(1 - t);
    if (low.some(o => x > o.r[0] && x < o.r[2] && y > o.r[1] && y < o.r[3] && o.h > h)) return false; }
  return true;
}
/** 从 (x, y) 沿 (dx, dy) 到最近障碍物的距离（mm） */
function rayDepth(x, y, dx, dy, rects, max){
  let t = max;
  for (const r of rects){
    let t0 = 0, t1 = t;
    if (Math.abs(dx) < 1e-9){ if (x < r[0] || x > r[2]) continue; }
    else { const a = (r[0] - x)/dx, b = (r[2] - x)/dx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (Math.abs(dy) < 1e-9){ if (y < r[1] || y > r[3]) continue; }
    else { const a = (r[1] - y)/dy, b = (r[3] - y)/dy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
    if (t0 <= t1) t = t0;
  }
  return t;
}
/** 从 c 沿 (dx, dy) 到房间轮廓的距离（mm） */
function polyDepth(c, dx, dy, poly, max){
  let t = max;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], den = dx*ey - dy*ex; if (Math.abs(den) < 1e-9) return;
    const s = ((p[0] - c[0])*ey - (p[1] - c[1])*ex)/den, u = ((p[0] - c[0])*dy - (p[1] - c[1])*dx)/den; if (s > 0 && u >= 0 && u <= 1) t = Math.min(t, s); });
  return t;
}
/** 站在 p 往哪看最开阔：72 个方向量视线深度（只算本房间内、到墙 / 高柜为止，6m 封顶 —— 拍的是这间房，不是透过门洞看隔壁），
 *  取 ±40° 视野内的加权平均；视线落在床 / 沙发 / 台面等家具上的方向加分（看陈设，而不是对着一面白墙）；
 *  正前方 1.2m 内就是墙 / 柜子的方向减半 → {yaw, sc} */
const DIRS = 72, DEEP = 6000, SHOW = 1400;
function bestView(p, see, poly, low){
  const d = [], wall = [];
  for (let k = 0; k < DIRS; k++){
    const a = k/DIRS*2*Math.PI, dx = Math.sin(a), dy = -Math.cos(a), far = Math.min(rayDepth(p[0], p[1], dx, dy, see, DEEP), polyDepth(p, dx, dy, poly, DEEP));
    wall.push(far); d.push(far + (rayDepth(p[0], p[1], dx, dy, low, far) < far ? SHOW : 0));
  }
  let bk = 0, bv = -1;
  for (let k = 0; k < DIRS; k++){
    let v = 0, w = 0;
    for (let j = -8; j <= 8; j++){ const c = Math.cos(j*5*Math.PI/180); v += c*d[(k + j + DIRS) % DIRS]; w += c; }
    v /= w; if (wall[k] < 1200) v *= .5;
    if (v > bv){ bv = v; bk = k; }
  }
  return {yaw:bk/DIRS*2*Math.PI, sc:bv};
}
/** 房间机位 → [{p, yaw, near}]。
 *  首个点位像拍房源照片那样选：不站在家具上、离墙和家具留出净距，在此前提下取「看出去最深」的位置（通常是退到一头看向房间纵深），
 *  而不是站在房间正中对着近处的墙。大房间再补几个彼此 ≥ 1.8m 且互相通视的点位。 */
function camPoints(room, see, stand, low){
  const seeNear = nearOf(room, see), lowNear = nearOf(room, low);
  let list = candidates(room, nearOf(room, stand));
  if (!list.some(c => c.clear >= 250)) list = candidates(room, seeNear);          // 家具摆满了：退而求其次，只避开墙和高柜
  if (!list.length) return [{p:room.at || room.poly[0], yaw:0, near:seeNear}];
  const need = Math.min(450, Math.max(...list.map(c => c.clear))*.8), step = list.length > 500 ? 3 : 1;
  let first = null;
  for (const c of list){
    if (c.clear < need || c.i % step || c.j % step) continue;
    const v = bestView(c.p, seeNear, room.poly, lowNear), sc = v.sc + .6*Math.min(c.clear, 900);
    if (!first || sc > first.sc) first = {p:c.p, yaw:v.yaw, sc};
  }
  first ||= {p:list.reduce((a, c) => c.clear > a.clear ? c : a).p, yaw:0};
  const A = area(room.poly), n = A < 9 ? 1 : A < 16 ? 2 : A < 26 ? 3 : 4, pts = [first];
  while (pts.length < n){
    let best = null, bs = -Infinity;
    for (const c of list){
      if (c.clear < 500) continue;
      const d = Math.min(...pts.map(q => Math.hypot(c.p[0] - q.p[0], c.p[1] - q.p[1]))); if (d < 1800) continue;
      const sc = Math.min(c.clear, 900) + .5*Math.min(d, 3000);
      if (sc > bs && pts.some(q => walkable(q.p, c.p, room.poly, seeNear))){ bs = sc; best = c.p; }
    }
    if (!best) break; pts.push({p:best, yaw:bestView(best, seeNear, room.poly, lowNear).yaw});
  }
  return pts.map(({p, yaw}) => ({p, yaw, near:seeNear}));
}
/** 房间之间的通道：门 / 推拉门 / 开敞相邻边 → {a, b, p:[x, y]} */
function passages(rooms){
  const pl = P(), out = [], seen = new Set(), at = p => rooms.find(r => pointInPoly(p, r.poly));
  const add = (A, B, p) => { if (!A || !B || A === B) return; const k = [A.id, B.id].sort().join('|'); if (seen.has(k)) return; seen.add(k); out.push({a:A, b:B, p}); };
  const viaRect = r => { const c = [(r[0] + r[2])/2, (r[1] + r[3])/2], n = isH(r) ? [0, 350] : [350, 0]; add(at([c[0] - n[0], c[1] - n[1]]), at([c[0] + n[0], c[1] + n[1]]), c); };
  pl.doors.forEach((d, i) => !isDem('door', i) && viaRect(d.rect));
  pl.slides.forEach((s, i) => !isDem('slide', i) && viaRect(s.rect));
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++){
    const f = facing(rooms[i], rooms[j]).sort((x, y) => y.len - x.len)[0];
    if (f && f.len >= 700) add(rooms[i], rooms[j], [(f.bridge[0] + f.bridge[2])/2, (f.bridge[1] + f.bridge[3])/2]);
  }
  return out;
}
const dirTo = (from, p, y) => { const dx = wx(p[0]) - wx(from[0]), dz = wz(p[1]) - wz(from[1]); return {yaw:Math.atan2(dx, -dz), pitch:Math.atan2(y - EYE, Math.hypot(dx, dz))}; };

/** 六个方向各拍一张（带环境光遮蔽）→ 拼成等距柱状全景。
 *  每个面多拍一圈（视场正切 FT > 1），拼接时只用中间 90° 的部分：遮蔽是按屏幕邻域算的，留出余量后面与面的接缝处才连续 */
const FACES = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, 1]], [[0, -1, 0], [0, 0, -1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]]];
const FT = 1.12, FACE = Math.round(CUBE*FT/8)*8;
function makeEquirect(){
  const fc = new THREE.PerspectiveCamera(2*Math.atan(FT)*180/Math.PI, 1, .05, 300), tc = new THREE.PerspectiveCamera(62, TW/TH, .05, 300);
  const cvs = FACES.map(() => { const c = document.createElement('canvas'); c.width = c.height = FACE; return c; });
  const tex = cvs.map(c => { const t = new THREE.CanvasTexture(c); t.generateMipmaps = false; t.minFilter = t.magFilter = THREE.LinearFilter; t.colorSpace = THREE.NoColorSpace; return t; });   // 已是屏幕色，原样拼
  const q = new THREE.Scene(), oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const pick = FACES.map(([f, u], i) => `face(f${i}, d, vec3(${f.map(v => v.toFixed(1))}), vec3(${u.map(v => v.toFixed(1))}))`);
  const mat = new THREE.ShaderMaterial({
    uniforms:Object.fromEntries(tex.map((t, i) => ['f' + i, {value:t}])),
    vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader:`uniform sampler2D f0, f1, f2, f3, f4, f5; varying vec2 vUv;
      vec4 face(sampler2D s, vec3 d, vec3 fw, vec3 up){ vec3 r = cross(fw, up); return texture2D(s, vec2(dot(d, r), dot(d, up))/(dot(d, fw)*${FT.toFixed(4)})*.5 + .5); }
      void main(){ float lon = (vUv.x - .5)*6.2831853, lat = (vUv.y - .5)*3.1415927;
        vec3 d = vec3(sin(lon)*cos(lat), sin(lat), -cos(lon)*cos(lat)), a = abs(d);
        if (a.x >= a.y && a.x >= a.z) gl_FragColor = d.x > 0. ? ${pick[0]} : ${pick[1]};
        else if (a.y >= a.z) gl_FragColor = d.y > 0. ? ${pick[2]} : ${pick[3]};
        else gl_FragColor = d.z > 0. ? ${pick[4]} : ${pick[5]};
      }`,
    depthTest:false, depthWrite:false, toneMapped:false,
  });
  q.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const grab = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(renderer.domElement, 0, 0, w, h); return cv; };
  return {
    shoot(x, y){
      withSize(FACE, FACE, () => FACES.forEach(([f, u], i) => {
        fc.position.set(x, EYE, y); fc.up.set(...u); fc.lookAt(x + f[0], EYE + f[1], y + f[2]);
        draw(0, fc, true); cvs[i].getContext('2d').drawImage(renderer.domElement, 0, 0); tex[i].needsUpdate = true;
      }));
      return withSize(PW, PH, () => { renderer.render(q, oc); return grab(PW, PH).toDataURL('image/jpeg', COARSE ? .85 : .82); });
    },
    /** 房间条用的缩略图：从点位朝初始方向拍一张普通透视小图（直接裁全景图的话墙线是弯的） */
    thumb(x, y, yaw){
      tc.position.set(x, EYE, y); tc.lookAt(x + Math.sin(yaw), EYE - .12, y - Math.cos(yaw));
      return withSize(TW*2, TH*2, () => { draw(0, tc, true); return grab(TW, TH).toDataURL('image/jpeg', .8); });
    },
    dispose(){ tex.forEach(t => t.dispose()); q.children[0].geometry.dispose(); mat.dispose(); },
  };
}

/** only：只导出这些房间（房间 id 数组；脚本调用时用，默认全部） */
export async function exportVR(download, toast, only){
  const pl = P(), rooms = pl.rooms.filter(r => r.counted !== false && area(r.poly) >= 1.5 && (!Array.isArray(only) || only.includes(r.id)));
  if (!rooms.length) return toast(tr('没有可导出的房间', 'No rooms to export'));
  // —— 进入「VR 拍摄」状态：满层高（带吊顶）、棱线 / 阴角线、漫游补光，隐藏标签与选中框
  const keep = {cut:opt.cut, labels:labelG.visible, sel:selHelper?.visible};
  if (opt.cut < 99){ opt.cut = 99; sync(); }
  [archUp, furnG].forEach(G => G.traverse(o => { if (o.userData.walkOnly) o.visible = true; }));
  opt.shoot = true; applyLight(); labelG.visible = false; if (selHelper) selHelper.visible = false;
  // 落地家具的占地：高的（衣柜 / 冰箱…）挡视线，矮的（床 / 沙发 / 桌子）只是不能站上去；吊灯 / 壁灯 / 地毯不算
  const boxes = furnG.children.filter(o => o.userData.mount === 'floor').map(o => new THREE.Box3().setFromObject(o)).filter(b => b.max.y > .15 && b.min.y < .5);
  const lowB = boxes.filter(b => b.max.y <= 1.2), low = lowB.map(b => ({r:boxRect(b), h:b.max.y}));
  const see = obstacles(boxes.filter(b => b.max.y > 1.2)), stand = see.concat(lowB.map(boxRect));
  const links = passages(rooms), eq = makeEquirect(), b = pl.bounds;
  // 每个房间的点位 → 全局点位表
  const nodes = [];
  rooms.forEach(r => camPoints(r, see, stand, lowB.map(boxRect)).forEach(({p, yaw, near}, k) => nodes.push({id:r.id + '~' + k, room:r, p, yaw, near})));
  const nearestOf = (room, p) => nodes.filter(n => n.room === room).reduce((a, n) => Math.hypot(n.p[0] - p[0], n.p[1] - p[1]) < Math.hypot(a.p[0] - p[0], a.p[1] - p[1]) ? n : a);
  const out = [];
  try {
    for (const [k, nd] of nodes.entries()){
      const r = nd.room, c = nd.p, nmR = nm(state.rooms[r.id].name);
      toast(tr(`正在拍摄全景 ${k + 1}/${nodes.length} · ${nmR}`, `Rendering panorama ${k + 1}/${nodes.length} · ${nmR}`));
      await frame(); await frame();
      const img = eq.shoot(wx(c[0]), wz(c[1]));
      // 去别的房间：经过门口，落到目标房间离门最近的点位
      const lk = links.filter(l => l.a === r || l.b === r).map(l => { const o = l.a === r ? l.b : l.a; return {to:nearestOf(o, l.p).id, kind:'door', label:nm(state.rooms[o.id].name), ...dirTo(c, l.p, 1.0)}; });
      // 同一房间的其它点位：地面上的落脚圈（落点被沙发 / 床挡住看不见时不画，免得圆圈浮在家具上；仍可从小地图过去）
      nodes.filter(m => m.room === r && m !== nd && walkable(c, m.p, r.poly, nd.near) && floorSeen(c, m.p, low)).forEach(m =>
        lk.push({to:m.id, kind:'step', dist:+(Math.hypot(m.p[0] - c[0], m.p[1] - c[1])/1000).toFixed(2), ...dirTo(c, m.p, 0)}));
      out.push({id:nd.id, room:r.id, img, thumb:eq.thumb(wx(c[0]), wz(c[1]), nd.yaw), pos:[(c[0] - b.x)/b.w, (c[1] - b.y)/b.h], yaw0:nd.yaw, links:lk});
    }
  } finally {
    eq.dispose();
    if (keep.cut !== opt.cut){ opt.cut = keep.cut; syncCutBtns(); sync(); }
    [archUp, furnG].forEach(G => G.traverse(o => { if (o.userData.walkOnly) o.visible = opt.mode === 'walk'; }));
    opt.shoot = false; applyLight(); labelG.visible = keep.labels; if (selHelper) selHelper.visible = keep.sel;
  }
  toast(tr('正在打包 VR 看房…', 'Packaging VR tour…')); await frame();
  // 小地图：平面图缩略
  const {img:mi, W:mw, H:mh} = await planImage(1100), mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
  const g = mc.getContext('2d'); g.fillStyle = '#eef1f5'; g.fillRect(0, 0, mw, mh); g.drawImage(mi, 0, 0, mw, mh);
  const start = rooms.reduce((a, r) => area(r.poly) > area(a.poly) ? r : a, rooms[0]);
  const net = pl.rooms.filter(r => r.counted !== false).reduce((a, r) => a + area(r.poly), 0);
  const title = pl.title ? tr(pl.title, pl.titleEn || pl.title) : tr('三室一厅两卫', '3BR 1LR 2BA');
  const data = {
    lang:tr('zh', 'en'), title, sub:tr(`套内约 ${net.toFixed(2)} m² · 层高 ${(pl.height || 2800)/1000} m · ${rooms.length} 个空间`, `Net ≈ ${net.toFixed(2)} m² · Ceiling ${(pl.height || 2800)/1000} m · ${rooms.length} spaces`),
    brand:tr('栖构 Nestform', 'Nestform'), date:new Date().toISOString().slice(0, 10), north:pl.north || 0,
    map:{img:mc.toDataURL('image/jpeg', .85), ar:mw/mh}, start:start.id + '~0', nodes:out,
    rooms:rooms.map(r => ({id:r.id, name:nm(state.rooms[r.id].name), area:+area(r.poly).toFixed(2), node:r.id + '~0'})),
    t:{tip:tr('拖动环视 · 滚轮 / 双指缩放 · 点地面圆圈在房间内走动，点门口标签去隔壁', 'Drag to look around · scroll / pinch to zoom · tap a doorway label or floor circle to move'),
       auto:tr('自动旋转', 'Auto-rotate'), gyro:tr('陀螺仪', 'Gyro'), fs:tr('全屏', 'Fullscreen'), map:tr('平面', 'Plan'), rooms:tr('房间', 'Rooms')},
  };
  const html = VIEWER.replace('/*__DATA__*/null', () => JSON.stringify(data).replace(/</g, '\\u003c')).replace('__TITLE__', `${title} · ${data.brand} VR`);
  download(tr('栖构-VR看房', 'nestform-vr-tour') + '.html', new Blob([html], {type:'text/html'}));
  toast(tr(`已导出 VR 看房（${rooms.length} 个房间 / ${out.length} 个点位，${(html.length/1048576).toFixed(1)} MB）`, `VR tour exported (${rooms.length} rooms / ${out.length} spots, ${(html.length/1048576).toFixed(1)} MB)`));
}
