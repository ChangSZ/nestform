/* =====================================================================
 *  导出 VR 看房：每个房间在人眼高度拍一张 360° 全景（立方体相机 → 等距柱状投影），
 *  门洞 / 开敞处生成热点，连同小地图打包成一个可离线打开的 HTML。
 * ===================================================================== */
import * as THREE from 'three';
import {tr, nm} from '../i18n.js';
import {state, P} from '../store.js';
import {area} from '../geom.js';
import {pointInPoly} from '../import/rooms.js';
import {facing} from '../plan2d/partitions.js';
import {isDem} from '../demolish.js';
import {planImage} from '../exporter.js';
import {K, wx, wz} from './kit.js';
import {renderer, scene, opt, archUp, labelG, furnG, fillLight, selHelper, sync, syncCutBtns, SW, SH} from './index.js';
import VIEWER from './vr-viewer.html?raw';

const EYE = 1.55, PW = 3072, PH = 1536, CUBE = 1280;
// 让出一帧给界面刷新提示；页面在后台时 rAF 会暂停，用定时器兜底，导出不至于卡住
const frame = () => new Promise(r => { requestAnimationFrame(() => r()); setTimeout(r, 60); });
const isH = r => (r[2] - r[0]) >= (r[3] - r[1]);

/** 障碍物（mm 矩形）：未拆除的墙、隔断柜 / 窗、门洞边框，以及高家具（衣柜 / 冰箱…）的占地 */
function obstacles(tall){
  const pl = P(), R = [];
  pl.walls.forEach((w, i) => { if (!isDem('wall', i)) R.push(w.slice(0, 4)); });
  pl.wins.forEach((w, i) => { if (!isDem('win', i)) R.push(w.slice(0, 4)); });
  tall.forEach(b => R.push([b.min.x*1000 + K.ox, b.min.z*1000 + K.oy, b.max.x*1000 + K.ox, b.max.z*1000 + K.oy]));
  return R;
}
const rectDist = ([x, y], r) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
/** 房间内的候选点 → [{p, clear, sc}]（clear：离墙 / 高家具的净距；sc：开阔度 + 靠近中心） */
function candidates(room, obs){
  const poly = room.poly, at = room.at || poly[0], xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  const near = obs.filter(r => r[2] > Math.min(...xs) - 1500 && r[0] < Math.max(...xs) + 1500 && r[3] > Math.min(...ys) - 1500 && r[1] < Math.max(...ys) + 1500);
  const out = [];
  for (let x = Math.min(...xs) + 50; x < Math.max(...xs); x += 100) for (let y = Math.min(...ys) + 50; y < Math.max(...ys); y += 100){
    if (!pointInPoly([x, y], poly)) continue;
    const edge = Math.min(...poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return rectDist([x, y], [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[0], q[0]), Math.max(p[1], q[1])]); }));
    const clear = Math.min(edge, ...near.map(r => rectDist([x, y], r)));
    out.push({p:[x, y], clear, sc:Math.min(clear, 1100) - .3*Math.hypot(x - at[0], y - at[1])});
  }
  return {list:out, near};
}
/** 两点之间能否直接走过去：线段全程在房间内、不穿过墙 / 高家具 */
function walkable(a, b, poly, near){
  const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])/100);
  for (let i = 1; i < n; i++){ const t = i/n, q = [a[0] + (b[0] - a[0])*t, a[1] + (b[1] - a[1])*t]; if (!pointInPoly(q, poly) || near.some(r => rectDist(q, r) < 150)) return false; }
  return true;
}
/** 房间机位：大房间放多个点位（面积越大越多，彼此 ≥ 1.8m 且互相看得见），小房间一个 */
function camPoints(room, obs){
  const {list, near} = candidates(room, obs); if (!list.length) return [room.at || room.poly[0]];
  const A = area(room.poly), n = A < 9 ? 1 : A < 16 ? 2 : A < 26 ? 3 : 4;
  const pts = [list.reduce((a, c) => c.sc > a.sc ? c : a).p];
  while (pts.length < n){
    let best = null, bs = -Infinity;
    for (const c of list){
      if (c.clear < 500) continue;
      const d = Math.min(...pts.map(p => Math.hypot(c.p[0] - p[0], c.p[1] - p[1]))); if (d < 1800) continue;
      const sc = Math.min(c.clear, 900) + .5*Math.min(d, 3000);
      if (sc > bs && pts.some(p => walkable(p, c.p, room.poly, near))){ bs = sc; best = c.p; }
    }
    if (!best) break; pts.push(best);
  }
  return pts.map(p => ({p, near}));
}
/** 初始朝向：房间里视线最深的方向（射线到房间轮廓的距离，取邻域平均） */
function deepYaw(c, poly){
  const N = 72, d = [];
  for (let k = 0; k < N; k++){
    const a = k/N*2*Math.PI, dx = Math.sin(a), dy = -Math.cos(a); let t = 2e4;
    poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1], den = dx*ey - dy*ex; if (Math.abs(den) < 1e-9) return;
      const s = ((p[0] - c[0])*ey - (p[1] - c[1])*ex)/den, u = ((p[0] - c[0])*dy - (p[1] - c[1])*dx)/den; if (s > 0 && u >= 0 && u <= 1) t = Math.min(t, s); });
    d.push(t);
  }
  let bk = 0, bv = -1;
  for (let k = 0; k < N; k++){ let v = 0; for (let j = -12; j <= 12; j++) v += d[(k + j + N) % N]; if (v > bv){ bv = v; bk = k; } }
  return bk/N*2*Math.PI;
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

/** 立方体全景 → 等距柱状投影（输出到画布，走渲染器的色调映射 / sRGB） */
function makeEquirect(){
  const rt = new THREE.WebGLCubeRenderTarget(CUBE, {type:THREE.HalfFloatType, generateMipmaps:true, minFilter:THREE.LinearMipmapLinearFilter});
  const cam = new THREE.CubeCamera(.05, 300, rt);
  const q = new THREE.Scene(), oc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  q.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms:{tCube:{value:rt.texture}},
    vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader:`uniform samplerCube tCube; varying vec2 vUv;
      void main(){ float lon = (vUv.x - .5)*6.2831853, lat = (vUv.y - .5)*3.1415927;
        vec3 d = vec3(sin(lon)*cos(lat), sin(lat), -cos(lon)*cos(lat));
        gl_FragColor = vec4(textureCube(tCube, d).rgb, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest:false, depthWrite:false,
  })));
  return {
    shoot(x, y){
      cam.position.set(x, EYE, y); cam.update(renderer, scene);
      const pr = renderer.getPixelRatio();
      renderer.setPixelRatio(1); renderer.setSize(PW, PH, false); renderer.render(q, oc);
      const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; cv.getContext('2d').drawImage(renderer.domElement, 0, 0);
      renderer.setPixelRatio(pr); renderer.setSize(SW(), SH(), false);
      return cv.toDataURL('image/jpeg', .86);
    },
    dispose(){ rt.dispose(); q.children[0].geometry.dispose(); q.children[0].material.dispose(); },
  };
}

export async function exportVR(download, toast){
  const pl = P(), rooms = pl.rooms.filter(r => r.counted !== false && area(r.poly) >= 1.5);
  if (!rooms.length) return toast(tr('没有可导出的房间', 'No rooms to export'));
  // —— 进入「VR 拍摄」状态：满层高（带吊顶）、棱线 / 阴角线、漫游补光，隐藏标签与选中框
  const keep = {cut:opt.cut, fill:fillLight.intensity, labels:labelG.visible, sel:selHelper?.visible};
  if (opt.cut < 99){ opt.cut = 99; sync(); }
  [archUp, furnG].forEach(G => G.traverse(o => { if (o.userData.walkOnly) o.visible = true; }));
  fillLight.intensity = .75; labelG.visible = false; if (selHelper) selHelper.visible = false;
  const tall = furnG.children.filter(o => o.userData.mount === 'floor').map(o => new THREE.Box3().setFromObject(o)).filter(b => b.max.y > 1.2 && b.min.y < .5);   // 吊灯 / 壁灯不挡路
  const obs = obstacles(tall), links = passages(rooms), eq = makeEquirect(), b = pl.bounds;
  // 每个房间的点位 → 全局点位表
  const nodes = [];
  rooms.forEach(r => camPoints(r, obs).forEach(({p, near}, k) => nodes.push({id:r.id + '~' + k, room:r, p, near})));
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
      // 同一房间的其它点位：地面上的落脚圈
      nodes.filter(m => m.room === r && m !== nd && walkable(c, m.p, r.poly, nd.near)).forEach(m =>
        lk.push({to:m.id, kind:'step', dist:+(Math.hypot(m.p[0] - c[0], m.p[1] - c[1])/1000).toFixed(2), ...dirTo(c, m.p, 0)}));
      out.push({id:nd.id, room:r.id, img, pos:[(c[0] - b.x)/b.w, (c[1] - b.y)/b.h], yaw0:deepYaw(c, r.poly), links:lk});
    }
  } finally {
    eq.dispose();
    if (keep.cut !== opt.cut){ opt.cut = keep.cut; syncCutBtns(); sync(); }
    [archUp, furnG].forEach(G => G.traverse(o => { if (o.userData.walkOnly) o.visible = opt.mode === 'walk'; }));
    fillLight.intensity = keep.fill; labelG.visible = keep.labels; if (selHelper) selHelper.visible = keep.sel;
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
