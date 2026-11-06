import {tr, nm} from '../i18n.js';

import {COARSE, TAP, $, state, ui, view, snap, commit, getF, P} from '../store.js';
import {area} from '../geom.js';
import {renderAll} from '../plan2d/render.js';
import {esc, closeDrawers} from '../ui/panel.js';
import {select} from '../actions.js';
import {snapMove} from '../plan2d/viewport.js';
import {wallRuns, faceMat, roomEdges} from '../faces.js';
import {isArc, arcOutline, arcRects} from '../arcs.js';
import {isDem} from '../demolish.js';
import {K, wallFinishMat, FOV, wx, wz, M, matCache, mat, floorMat, box, rbox, fronts, metal} from '../view3d/kit.js';
import {buildFurniture} from '../view3d/furniture.js';
import {MAIN_LIGHTS} from '../view3d/lamps.js';
import {pointInPoly} from '../import/rooms.js';

import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {CSS2DRenderer, CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
export const stage = $('#stage'), host = $('#view3d');
export const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
export const opt = {cut:99, furn:true, labels:true, night:false, mode:'orbit'};

export let inited = false, active = false, raf = 0, anim = null, fly = null;
export let fillLight, renderer, labelRenderer, scene, camera, orbit, walkCtl, hemi, sun, ground, glassMat, wallMat, capMat, frameMat;
export let archFloor, archUp, furnG, labelG, lampG, colliders = [], selKey = null, selHelper = null;
export let sigArch = '', sigFurn = '', sigLabels = '', grow = 1, furnGrow = 1;
export const ceilH = () => (P().height || 2800)/1000;          // 层高（m）
export const doors = [], slides3d = [], curtains3d = [], keys = {};

/* ======================= 初始化 ======================= */
export function init(){
  if (inited) return; inited = true;
  renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(SW(), SH());
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement); K.renderer = renderer;
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(SW(), SH());
  Object.assign(labelRenderer.domElement.style, {position:'absolute', inset:'0', pointerEvents:'none'});
  host.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, SW()/SH(), .05, 300);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI*.495; orbit.minDistance = 1.5; orbit.maxDistance = 45;
  // 和 2D 一致：左键 / 单指拖动 = 平移画面（沿地面），右键或 Shift+左键 = 旋转，滚轮 / 双指 = 缩放
  orbit.mouseButtons = {LEFT:THREE.MOUSE.PAN, MIDDLE:THREE.MOUSE.DOLLY, RIGHT:THREE.MOUSE.ROTATE};
  orbit.touches = {ONE:THREE.TOUCH.PAN, TWO:THREE.TOUCH.DOLLY_ROTATE};
  orbit.screenSpacePanning = false;
  renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
  walkCtl = new PointerLockControls(camera, document.body);
  walkCtl.addEventListener('lock', () => { $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'block'; });
  walkCtl.addEventListener('unlock', () => { if (opt.mode === 'walk'){ $('#walkOverlay').style.display = 'flex'; $('#cross').style.display = 'none'; } });

  hemi = new THREE.HemisphereLight(0xfff8ee, 0xa9b3c0, 1.1);
  // 主光：中性白、近乎正上方的柔和顶光（不模拟太阳斜射，避免长阴影和偏色），只用来给家具落地阴影
  sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true; sun.shadow.mapSize.setScalar(COARSE ? 2048 : 4096);   // 平板 GPU 用小一点的阴影贴图
  Object.assign(sun.shadow.camera, {left:-11, right:11, top:11, bottom:-11, near:1, far:60});
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
  ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({color:0xe3e8ee, roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -0.015; ground.receiveShadow = true;
  // 斜向补光（不投影）：让相互垂直的墙面亮度不同，室内转角、墙缝更分明
  fillLight = new THREE.DirectionalLight(0xf3f6ff, .5); fillLight.position.set(-8, 6, 5);
  scene.add(hemi, sun, sun.target, ground, fillLight);

  const pm = new THREE.PMREMGenerator(renderer); K.envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  glassMat = new THREE.MeshPhysicalMaterial({color:0xcfe6ef, roughness:.05, transparent:true, opacity:.28, depthWrite:false, side:THREE.DoubleSide});
  wallMat = mat('#f5f6f8', {roughness:.92}); capMat = mat('#1c2738', {roughness:.9}); frameMat = mat('#5d6166', {roughness:.5, metalness:.4}); K.glassMat = glassMat; K.frameMat = frameMat;

  archFloor = new THREE.Group(); archUp = new THREE.Group(); furnG = new THREE.Group(); labelG = new THREE.Group(); lampG = new THREE.Group();
  scene.add(archFloor, archUp, furnG, labelG, lampG);

  const cv = renderer.domElement; let downAt = null, look = null;
  const tp = new Map(); let pinch = null;                        // 触屏 VR：双指捏合缩放视场
  const span = () => { const [a, b] = [...tp.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]) || 1; };
  cv.addEventListener('pointerdown', e => {
    downAt = [e.clientX, e.clientY]; closeDrawers();
    if (touchWalk){ tp.set(e.pointerId, [e.clientX, e.clientY]); if (tp.size === 2){ pinch = {d:span(), fov:camera.fov}; look = null; } }
    if (touchWalk && !look && !pinch){ look = {id:e.pointerId, x:e.clientX, y:e.clientY}; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (tp.has(e.pointerId)) tp.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && tp.size === 2){ camera.fov = Math.max(40, Math.min(100, pinch.fov*pinch.d/span())); camera.updateProjectionMatrix(); return; }
    if (!look || e.pointerId !== look.id) return;
    lookBy(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY;
  });
  const lift = e => { tp.delete(e.pointerId); if (tp.size < 2) pinch = null; };      // look 的清理留给下方 pointerup（要判断点门）
  cv.addEventListener('pointerup', lift);
  cv.addEventListener('pointercancel', e => { lift(e); if (look?.id === e.pointerId) look = null; });

  // 按住已选中的家具拖动：沿地面摆放（与 2D 共用网格和贴墙吸附）。
  // 在父元素上用捕获阶段监听，赶在 OrbitControls 之前关掉它，避免同时旋转镜头
  let fdrag = null;
  host.addEventListener('pointerdown', e => {
    if (e.target !== cv || !e.isPrimary || anim || opt.mode !== 'orbit' || ui.sel?.kind !== 'furn') return;
    const h = pick(e), f = h?.fid === ui.sel.id && getF(h.fid), g = f && groundAt(e.clientX, e.clientY);
    if (!g) return;
    fdrag = {id:f.id, pid:e.pointerId, sx:e.clientX, sy:e.clientY, ox:g.x - f.cx, oy:g.y - f.cy, before:snap(), moved:false};
    orbit.enabled = false; fly = null; cv.setPointerCapture(e.pointerId);
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    if (!fdrag.moved && Math.hypot(e.clientX - fdrag.sx, e.clientY - fdrag.sy) < TAP) return;
    const f = getF(fdrag.id), g = groundAt(e.clientX, e.clientY); if (!f || !g) return;
    fdrag.moved = true; cv.style.cursor = 'grabbing';
    [f.cx, f.cy] = snapMove(f, g.x - fdrag.ox, g.y - fdrag.oy);
    furnG.children.find(o => o.userData.fid === f.id)?.position.set(wx(f.cx), 0, wz(f.cy));   // 拖动中只挪模型，松手再整体同步
  });
  const endF = e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    const d = fdrag; fdrag = null; orbit.enabled = true; cv.style.cursor = '';
    if (d.moved){ commit(d.before); renderAll(); }
  };
  cv.addEventListener('pointerup', endF); cv.addEventListener('pointercancel', endF);

  cv.addEventListener('pointerup', e => {
    const tap = downAt && Math.hypot(e.clientX-downAt[0], e.clientY-downAt[1]) <= TAP;
    if (look?.id === e.pointerId){
      look = null;
      if (tap){ const h = pick(e); if (h?.door && h.dist < 3.5) h.door.open = !h.door.open; if (h?.slide && h.dist < 3.5) h.slide.open = !h.slide.open; if (h?.curtain && h.dist < 3.5) h.curtain.open = !h.curtain.open; }   // 漫游时点门开关
      return;
    }
    if (anim || opt.mode !== 'orbit' || !tap) return;
    const h = pick(e);
    if (h?.door) h.door.open = !h.door.open;
    else if (h?.slide){ h.slide.open = !h.slide.open; }
    else if (h?.curtain){ h.curtain.open = !h.curtain.open; }
    else if (h?.slat !== undefined) select({kind:'slat', i:h.slat});
    else if (h?.wall !== undefined) select({kind:'wall', i:h.wall, at:h.point});
    else if (h?.win !== undefined) select({kind:'win', i:h.win});
    else if (h?.face){                                                   // 点到墙面饰面 → 选中背后的那面墙，并记住是哪个房间的哪一面
      const r = P().rooms.find(r => r.id === h.face.room), e = r && roomEdges(r).find(e => e.key === h.face.key);
      const q = e ? [h.point.x + e.nx*80, h.point.y + e.ny*80] : null;
      const wi = q ? P().walls.findIndex((w, i) => !state.demolished.includes('w' + i) && q[0] > w[0] && q[0] < w[2] && q[1] > w[1] && q[1] < w[3]) : -1;
      if (wi >= 0) select({kind:'wall', i:wi, at:h.point, face:h.face}); else select({kind:'room', id:h.face.room});
    }
    else if (h?.fid) select({kind:'furn', id:h.fid});
    else if (h?.room){ select({kind:'room', id:h.room}); flyToRoom(h.room); }      // 点房间地面 → 选中并飞过去
    else select(null);
  });
  new ResizeObserver(() => {
    renderer.setSize(SW(), SH()); labelRenderer.setSize(SW(), SH());
    camera.aspect = SW()/SH(); camera.updateProjectionMatrix();
  }).observe(stage);
  bindUI();
}

/* ======================= 建筑 ======================= */
export function clearGroup(g){ g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); g.clear(); }
export function wallBox([x0, y0, x1, y1], yb, yt, m){
  if (yt - yb <= .001) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(M(x1-x0), yt-yb, M(y1-y0)), m || [wallMat, wallMat, capMat, wallMat, wallMat, wallMat]);
  o.position.set(wx((x0+x1)/2), (yb+yt)/2, wz((y0+y1)/2)); o.castShadow = o.receiveShadow = true; archUp.add(o);
  // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
  const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edgeMat); ln.position.copy(o.position); ln.userData.walkOnly = true; ln.visible = opt.mode === 'walk'; archUp.add(ln);
  if (yb <= .001){
    const p = o.geometry.parameters, sh = Math.min(.12, yt), sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + .02, sh, p.depth + .02), skirtMat);
    sk.position.set(o.position.x, sh/2, o.position.z); sk.userData.walkOnly = true; sk.visible = opt.mode === 'walk'; archUp.add(sk);
  }
  return o;
}
/* 隔断用的双面储物柜（窗下）：两面都有柜门，顶部台面 */
function partCabinet([x0, y0, x1, y1], h, wi){
  const hz = (x1 - x0) >= (y1 - y0), L = M(hz ? x1 - x0 : y1 - y0), T = M(hz ? y1 - y0 : x1 - x0), cm = mat('#e6dccc', {roughness:.5});
  const g = new THREE.Group(); g.position.set(wx((x0 + x1)/2), 0, wz((y0 + y1)/2)); if (!hz) g.rotation.y = Math.PI/2;
  g.add(box(L, .08, T - .04, '#3c3a37', 0, 0, 0), box(L, h - .1, T - .02, cm, 0, .08, 0));
  const n = Math.max(1, Math.round(L/.5));
  [1, -1].forEach(sd => { const f = new THREE.Group(); f.rotation.y = sd > 0 ? 0 : Math.PI; fronts(f, -L/2, .08, L, h - .1, T/2 - .01, n, 1, cm, 'edge'); g.add(f); });
  g.add(rbox(L + .01, .03, T + .01, mat('#b9a58c', {roughness:.4}), 0, h - .03, 0, .006));
  g.traverse(o => { o.userData.win = wi; if (o.isMesh){ o.castShadow = o.receiveShadow = true; } }); archUp.add(g);
}
/* 帘子：顶部轨道 + 波浪布面；open 时收拢到起点一侧 */
function buildCurtain(c, i, top){
  const [x0, y0, x1, y1] = c.rect, hz = (x1 - x0) >= (y1 - y0), L = M(hz ? x1 - x0 : y1 - y0), ch = Math.max(.5, top - .08);
  const g = new THREE.Group(); g.position.set(wx(x0) + (hz ? 0 : M(x1 - x0)/2), 0, wz(y0) + (hz ? M(y1 - y0)/2 : 0)); if (!hz) g.rotation.y = -Math.PI/2;
  const rail = box(L, .025, .04, metal(), L/2, top - .06, 0); rail.castShadow = false; g.add(rail);
  const geo = new THREE.PlaneGeometry(L, ch, Math.max(24, Math.round(L*24)), 1); geo.translate(L/2, ch/2, 0);
  const pos = geo.attributes.position; for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k)/.07)*.035);
  geo.computeVertexNormals();
  const cloth = new THREE.Group(), m = new THREE.Mesh(geo, mat(c.color || '#d9cbb8', {roughness:1, side:THREE.DoubleSide})); m.castShadow = m.receiveShadow = true;
  cloth.add(m); g.add(cloth);
  const obj = {cloth, open:false, cur:0}; g.traverse(o => { o.userData.curtain = obj; }); g.children.forEach(o => o.userData.part = {kind:'curtain', i});
  curtains3d.push(obj); archUp.add(g);
}
/* 木格栅：竖向木条 + 上下横档 */
function buildSlats(c, i, top){
  const [x0, y0, x1, y1] = c.rect, hz = (x1 - x0) >= (y1 - y0), L = M(hz ? x1 - x0 : y1 - y0), wm = mat(c.color || '#b08458', {roughness:.55}), n = Math.max(2, Math.floor(L/.11));
  const g = new THREE.Group(); g.position.set(wx((x0 + x1)/2), 0, wz((y0 + y1)/2)); if (!hz) g.rotation.y = Math.PI/2;
  for (let k = 0; k < n; k++) g.add(box(.04, top, .06, wm, -L/2 + (k + .5)*L/n, 0, 0));
  g.add(box(L, .04, .07, wm, 0, 0, 0), box(L, .04, .07, wm, 0, top - .04, 0));
  g.traverse(o => { o.userData.slat = i; if (o.isMesh) o.castShadow = o.receiveShadow = true; }); archUp.add(g);
}
/* 弧形墙：轮廓多边形竖向拉伸 */
function arcWall(w, yb, yt, i){
  if (yt - yb <= .001) return;
  const shp = new THREE.Shape(); arcOutline(w).forEach(([x, y], k) => shp[k ? 'lineTo' : 'moveTo'](wx(x), -wz(y)));
  const geo = new THREE.ExtrudeGeometry(shp, {depth:yt - yb, bevelEnabled:false, curveSegments:1}); geo.rotateX(-Math.PI/2); geo.translate(0, yb, 0);
  const o = new THREE.Mesh(geo, [capMat, wallMat]); o.castShadow = o.receiveShadow = true; o.userData.wall = i; archUp.add(o);
  arcRects(w).forEach(r => colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])]));
  return o;
}
/* 拱形门洞上方的墙：矩形减去半圆，沿墙厚拉伸 */
function archLintel([x0, y0, x1, y1], apex, top){
  const hz = (x1 - x0) >= (y1 - y0), L = M(hz ? x1 - x0 : y1 - y0), T = M(hz ? y1 - y0 : x1 - x0), r = L/2, spring = Math.max(.3, apex - r);
  if (top <= spring + .01) return;
  const sh = new THREE.Shape(); sh.moveTo(-L/2, spring); sh.lineTo(-L/2, top); sh.lineTo(L/2, top); sh.lineTo(L/2, spring);
  sh.absarc(0, spring, r, 0, Math.PI, false);
  const geo = new THREE.ExtrudeGeometry(sh, {depth:T, bevelEnabled:false, curveSegments:24}); geo.translate(0, 0, -T/2);
  const o = new THREE.Mesh(geo, [wallMat, wallMat]); o.castShadow = o.receiveShadow = true;
  o.position.set(wx((x0 + x1)/2), 0, wz((y0 + y1)/2)); if (!hz) o.rotation.y = Math.PI/2; archUp.add(o);
  // 拱券侧边的门套
  const trim = new THREE.Mesh(new THREE.TorusGeometry(r, .02, 6, 32, Math.PI), mat('#f4f2ee', {roughness:.5})); trim.scale.z = T/0.04*1.05;
  trim.position.set(0, spring, 0); const g = new THREE.Group(); g.add(trim); g.position.copy(o.position); g.rotation.y = o.rotation.y; archUp.add(g);
}
/* 门套：两侧立框 + 顶框（凸出墙面 1cm，漫游时门洞轮廓清晰） */
function doorTrim([x0, y0, x1, y1], h){
  const hz = (x1 - x0) >= (y1 - y0), L = M(hz ? x1 - x0 : y1 - y0), T = M(hz ? y1 - y0 : x1 - x0) + .02, tm = mat('#f4f2ee', {roughness:.5}), w = .06;
  const g = new THREE.Group(); g.position.set(wx((x0 + x1)/2), 0, wz((y0 + y1)/2)); if (!hz) g.rotation.y = Math.PI/2;
  [-1, 1].forEach(sd => g.add(box(w, h, T, tm, sd*(L/2 - w/2 + .005), 0, 0)));
  g.add(box(L + .01, w, T, tm, 0, h - w/2, 0));
  g.children.forEach(o => { o.castShadow = false; }); archUp.add(g);
}
export const edgeMat = new THREE.LineBasicMaterial({color:0x5f6d82}), skirtMat = new THREE.MeshStandardMaterial({color:'#7b8796', roughness:.6});
export function shapeOf(poly, flip){ const s = new THREE.Shape(); poly.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y))); return s; }

export function buildArch(){
  clearGroup(archFloor); clearGroup(archUp); lampG.clear(); doors.length = 0; slides3d.length = 0; curtains3d.length = 0; colliders = []; selKey = null;
  const b = P().bounds; K.ox = b.x + b.w/2; K.oy = b.y + b.h/2;               // 户型中心 → 世界原点
  const ext = Math.max(b.w, b.h)/2000 + 1; Object.assign(sun.shadow.camera, {left:-ext, right:ext, top:ext, bottom:-ext}); sun.shadow.camera.updateProjectionMatrix();
  K.H = ceilH(); const top = Math.min(opt.cut, K.H), H = K.H;
  P().rooms.forEach(r => {
    const m = floorMat(state.rooms[r.id].mat), bay = r.counted === false;
    const geo = bay ? new THREE.ExtrudeGeometry(shapeOf(r.poly), {depth:.45, bevelEnabled:false}) : new THREE.ShapeGeometry(shapeOf(r.poly));
    geo.rotateX(-Math.PI/2);
    const fl = new THREE.Mesh(geo, bay ? [m, mat('#e9e4da')] : m);
    fl.receiveShadow = true; fl.userData.room = r.id;
    if (bay){ fl.castShadow = true; archUp.add(fl); } else archFloor.add(fl);
    // 天花：法线朝下，只在室内仰视时可见
    const cg = new THREE.ShapeGeometry(shapeOf(r.poly, true)); cg.rotateX(Math.PI/2);
    const ceil = new THREE.Mesh(cg, mat('#fbfaf7', {roughness:1})); ceil.position.y = H; ceil.visible = top >= H; archUp.add(ceil);
    if (r.at){
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, .02, 32), new THREE.MeshStandardMaterial({color:'#fff', emissive:'#fff2d6', emissiveIntensity:.3}));
      lamp.position.set(wx(r.at[0]), H - .012, wz(r.at[1])); lamp.visible = top >= H; lamp.userData = {room:r.id, show:top >= H}; lampG.add(lamp);
      const pl = new THREE.PointLight(0xffd9a8, 0, 7, 1.6); pl.position.set(wx(r.at[0]), H - .25, wz(r.at[1])); pl.userData.room = r.id; lampG.add(pl);
    }
  });
  [...P().doors.filter((d, i) => !isDem('door', i)), ...P().slides.filter((d, i) => !isDem('slide', i))].forEach(d => { const [x0, y0, x1, y1] = d.rect; const s = box(M(x1-x0), .012, M(y1-y0), mat('#d8d0c0', {roughness:.3}), wx((x0+x1)/2), 0, wz((y0+y1)/2)); s.castShadow = false; archFloor.add(s); });
  P().walls.forEach((w, i) => {
    if (state.demolished.includes('w'+i)) return;
    if (isArc(w)){ arcWall(w, 0, w[4] === 'low' ? Math.min(1, top) : top, i); return; }
    const o = wallBox(w, 0, w[4] === 'low' ? Math.min(1, top) : top); if (o) o.userData.wall = i;
    colliders.push([wx(w[0]), wz(w[1]), wx(w[2]), wz(w[3])]);
  });
  buildWallSkins(top);
  // 门洞、飘窗洞口上方过梁
  const liveDoors = P().doors.filter((d, i) => !isDem('door', i)), liveSlides = P().slides.filter((d, i) => !isDem('slide', i));   // 已拆除的门洞不再生成
  liveDoors.filter(d => d.style === 'arch').forEach(d => archLintel(d.rect, 2.25, top));
  liveDoors.forEach(d => doorTrim(d.rect, d.style === 'arch' ? Math.min(top, 2.25 - M(Math.max(d.rect[2] - d.rect[0], d.rect[3] - d.rect[1]))/2) : Math.min(2.1, top)));
  [...liveDoors.filter(d => d.style !== 'arch').map(d => [d.rect, 2.1]), ...liveSlides.map(s => [s.rect, s.v ? 2.4 : 2.1]), ...(P().lintels || [])]
    .forEach(([r, h]) => { if (top > h) wallBox(r, h, top); });
  P().wins.forEach((r, i) => {
    if (isDem('win', i)) return;
    const st = r[5] || {}, sill = r[4] ?? .9, head = st.head === 'ceil' || st.full ? top : Math.min(2.4, H - .2);
    if (st.low === 'cabinet') partCabinet(r, Math.min(sill, top), i);    // 单开门 + 上窗下柜：双面储物柜代替窗下墙
    else { const o = wallBox(r, 0, Math.min(sill, top)); if (o) o.userData.win = i; }
    if (top > head){ const o = wallBox(r, head, top); if (o) o.userData.win = i; }
    colliders.push([wx(r[0]), wz(r[1]), wx(r[2]), wz(r[3])]);
    const gTop = Math.min(head, top); if (gTop <= sill) return;
    const [x0, y0, x1, y1] = r, hz = (x1-x0) >= (y1-y0), L = M(hz ? x1-x0 : y1-y0), gh = gTop - sill, cx = wx((x0+x1)/2), cz = wz((y0+y1)/2);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .01, gh, hz ? .01 : L), glassMat); pane.position.set(cx, sill + gh/2, cz); pane.userData.win = i; archUp.add(pane);
    const n = Math.max(1, Math.round(L/.9));
    for (let k = 0; k <= n; k++){ const t = -L/2 + k*L/n, mu = new THREE.Mesh(new THREE.BoxGeometry(hz ? .04 : .06, gh, hz ? .06 : .04), frameMat);
      mu.position.set(cx + (hz ? t : 0), sill + gh/2, cz + (hz ? 0 : t)); mu.castShadow = true; mu.userData.win = i; archUp.add(mu); }
    [sill + .02, gTop - .02].forEach(y => { const tr = new THREE.Mesh(new THREE.BoxGeometry(hz ? L : .06, .04, hz ? .06 : L), frameMat); tr.position.set(cx, y, cz); archUp.add(tr); });
  });
  P().doors.forEach((d, i) => {
    if (d.style === 'arch' || isDem('door', i)) return;
    const pivot = new THREE.Group(), L = M(d.len), dh = Math.min(2.05, top);
    pivot.position.set(wx(d.h[0]), 0, wz(d.h[1]));
    const leaf = box(L, dh, .04, mat(d.entry ? '#2d3e57' : '#eef0f2', {roughness:.5}), L/2);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), metal()); knob.position.set(L - .07, Math.min(1, dh - .05), 0); knob.scale.z = 2.2;
    pivot.add(leaf, knob);
    const ang = v => Math.atan2(-v[1], v[0]), door = {pivot, a0:ang(d.c), a1:ang(d.o), open:true};
    if (door.a1 - door.a0 > Math.PI) door.a1 -= Math.PI*2; if (door.a0 - door.a1 > Math.PI) door.a1 += Math.PI*2;
    door.cur = door.a1; pivot.rotation.y = door.cur; leaf.userData.door = knob.userData.door = door;
    doors.push(door); archUp.add(pivot);
  });
  P().slides.forEach(({rect:[x0, y0, x1, y1], v}, si) => {
    if (isDem('slide', si)) return;
    const L = M(v ? y1-y0 : x1-x0), ph = Math.min(v ? 2.4 : 2.1, top), pl = L*.55;
    const sl = {panels:[], travel:L - pl, open:false, cur:0, v, rect:[x0, y0, x1, y1], i:si};
    [[-1, -.02], [1, .02]].forEach(([sd, off]) => {
      const c = sd < 0 ? -L/2 + pl/2 : L/2 - pl/2, x = v ? wx((x0+x1)/2) + off : wx(x0) + L/2 + c, z = v ? wz(y0) + L/2 + c : wz((y0+y1)/2) + off;
      const g = new THREE.Group(); g.position.set(x, 0, z); g.userData.base = [x, z];
      const p = new THREE.Mesh(new THREE.BoxGeometry(v ? .02 : pl, ph, v ? pl : .02), glassMat); p.position.y = ph/2; g.add(p);
      [ph - .03, .03].forEach(y => { const fr = new THREE.Mesh(new THREE.BoxGeometry(v ? .04 : pl, .05, v ? pl : .04), frameMat); fr.position.y = y; g.add(fr); });
      [-1, 1].forEach(e => { const fr = new THREE.Mesh(new THREE.BoxGeometry(.04, ph, .04), frameMat); fr.position.set(v ? 0 : e*pl/2, ph/2, v ? e*pl/2 : 0); g.add(fr); });
      const hd = new THREE.Mesh(new THREE.BoxGeometry(v ? .03 : .02, .3, v ? .02 : .03), metal()); hd.position.set(v ? 0 : -sd*(pl/2 - .06), 1.05, v ? -sd*(pl/2 - .06) : 0); g.add(hd);
      g.traverse(o => { o.userData.slide = sl; });
      sl.panels.push(g); archUp.add(g);
    });
    // 轨道
    const tr = box(v ? .08 : L, .01, v ? L : .08, frameMat, v ? wx((x0+x1)/2) : wx((x0+x1)/2), 0, v ? wz((y0+y1)/2) : wz((y0+y1)/2)); tr.castShadow = false; archUp.add(tr);
    slides3d.push(sl);
  });
  (P().curtains || []).forEach((c, i) => buildCurtain(c, i, top));
  (P().slats || []).forEach((c, i) => buildSlats(c, i, top));
  applyLight(); applyGrow();
}

export /* 墙面饰面：每面墙（房间轮廓上紧贴墙体的边段）贴一层薄片，材质逐面可选；同时生成阴角线 / 踢脚线（漫游时增强立体感） */
function buildWallSkins(top){
  const lines = [];
  P().rooms.forEach(r => {
    if (r.counted === false) return;
    for (const {edge:e, t0, t1} of wallRuns(r)){
      const len = t1 - t0, m = wallFinishMat(faceMat(r.id, e.key));
      const cx = e.a[0] + e.ux*(t0 + len/2) - e.nx*3, cy = e.a[1] + e.uy*(t0 + len/2) - e.ny*3;
      const geo = new THREE.PlaneGeometry(M(len), top);
      const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, (t0 + uv.getX(k)*len)/1000, uv.getY(k)*top);   // UV 以米计
      const o = new THREE.Mesh(geo, m); o.position.set(wx(cx), top/2, wz(cy));
      o.rotation.y = Math.atan2(e.nx, e.ny) + Math.PI;                 // 平面法线朝向房间内侧
      o.receiveShadow = true; o.userData.face = {room:r.id, key:e.key}; archUp.add(o);
      // 踢脚线（8cm 高、1cm 厚）
      const sk = new THREE.Mesh(new THREE.BoxGeometry(M(len), .08, .012), skirtMat);
      sk.position.set(wx(cx - e.nx*6), .04, wz(cy - e.ny*6)); sk.rotation.y = o.rotation.y; sk.userData.face = o.userData.face; archUp.add(sk);
      // 阴角线：墙段两端竖线 + 顶部横线
      const p0 = [e.a[0] + e.ux*t0 - e.nx*5, e.a[1] + e.uy*t0 - e.ny*5], p1 = [e.a[0] + e.ux*t1 - e.nx*5, e.a[1] + e.uy*t1 - e.ny*5];
      lines.push(wx(p0[0]), 0, wz(p0[1]), wx(p0[0]), top, wz(p0[1]), wx(p1[0]), 0, wz(p1[1]), wx(p1[0]), top, wz(p1[1]), wx(p0[0]), top - .002, wz(p0[1]), wx(p1[0]), top - .002, wz(p1[1]));
    }
  });
  if (lines.length){
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    const ls = new THREE.LineSegments(g, cornerMat); ls.userData.walkOnly = true; ls.visible = opt.mode === 'walk'; archUp.add(ls);
  }
}
const cornerMat = new THREE.LineBasicMaterial({color:0x5f5a52, transparent:true, opacity:.55});

const MAX_LAMP_LIGHTS = 12;                                          // 点光源太多会拖慢渲染：超出的灯只发光不照明
function buildFurn(){
  clearGroup(furnG);
  const gs = state.furniture.map(f => buildFurniture(f));
  // 台面摆件（台灯、音箱、微波炉、花瓶）：放到下方家具的台面上（向下打一条射线，取 1.25m 以下最高的水平面）
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  gs.forEach((g, i) => {
    if (g.userData.mount !== 'top') return;
    const f = state.furniture[i]; let y = 0;
    gs.forEach((h, j) => {
      if (j === i || h.userData.mount === 'top' || h.userData.mount === 'ceil' || h.userData.mount === 'wall') return;
      h.updateMatrixWorld(true); ray.set(new THREE.Vector3(wx(f.cx), 1.25, wz(f.cy)), down);
      for (const hit of ray.intersectObject(h, true)){ const n = hit.face?.normal.clone().transformDirection(hit.object.matrixWorld); if (n && n.y > .9){ y = Math.max(y, hit.point.y); break; } }
    });
    g.position.y = y;
  });
  // 灯的光源：夜景时打开；主照明（吸顶 / 吊灯 / 筒灯…）优先
  let n = 0;
  gs.map((g, i) => [g, state.furniture[i]]).filter(([g]) => g.userData.lamp?.at).sort(([a], [b]) => b.userData.lamp.k - a.userData.lamp.k).forEach(([g]) => {
    if (n++ >= MAX_LAMP_LIGHTS) return;
    const L = g.userData.lamp, pl = new THREE.PointLight(0xffd9a8, 0, L.dist, 1.6); pl.position.set(...L.at); pl.userData.lampK = L.k; g.add(pl);
  });
  gs.forEach(g => { if (g.userData.mount === 'ceil') g.userData.walkOnly = true; furnG.add(g); });
  furnG.children.forEach(o => { if (o.userData.walkOnly) o.visible = opt.mode === 'walk'; });
  syncRoomLamps();
  furnG.visible = opt.furn; selKey = null; applyLight(); applyGrow();
}
/** 房间里放了主照明灯具时，关掉这间房自动生成的顶灯 */
function syncRoomLamps(){
  const lit = new Set(state.furniture.filter(f => MAIN_LIGHTS.includes(f.type)).map(f => P().rooms.find(r => pointInPoly([f.cx, f.cy], r.poly))?.id).filter(Boolean));
  lampG.children.forEach(o => { o.userData.off = lit.has(o.userData.room); if (!o.isPointLight) o.visible = !o.userData.off && o.userData.show; });
}

export function buildLabels(){
  labelG.children.slice().forEach(o => { o.element.remove(); labelG.remove(o); });
  P().rooms.filter(r => r.at).forEach(r => {
    const el = document.createElement('div'); el.className = 'rlabel';
    el.innerHTML = `${esc(nm(state.rooms[r.id].name))}<small>${area(r.poly).toFixed(1)}m²</small>`;
    // 点房间名字 = 点房间地面：选中并飞过去（标签浮在画面上，不能交给射线拾取）
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', e => { e.stopPropagation(); if (anim || opt.mode !== 'orbit') return; select({kind:'room', id:r.id}); flyToRoom(r.id); });
    const o = new CSS2DObject(el); o.position.set(wx(r.at[0]), Math.min(opt.cut, ceilH()) + .15, wz(r.at[1])); o.visible = labelG.visible; labelG.add(o);
  });
}

// 只重建变化的部分
export function sync(force){
  if (!inited || (!active && !force)) return;
  const pl = JSON.stringify(state.plan), a = pl + JSON.stringify([state.rooms, state.demolished, opt.cut]), f = pl + JSON.stringify(state.furniture), l = JSON.stringify([state.rooms, opt.cut]);
  if (force || a !== sigArch){ sigArch = a; buildArch(); syncRoomLamps(); }
  if (force || f !== sigFurn){ sigFurn = f; buildFurn(); }
  if (force || l !== sigLabels){ sigLabels = l; buildLabels(); }
}

// CSS2DRenderer 只看标签自身的 visible，不继承父级，所以逐个设置
export function showLabels(v){ labelG.visible = v; labelG.children.forEach(o => o.visible = v); }
export function applyGrow(){
  if (!inited) return;
  archUp.scale.y = Math.max(grow, .001);
  furnG.scale.y = Math.max(furnGrow, .001);
  lampG.visible = grow > .99;
}

/* ======================= 日照 / 夜景 ======================= */
export function applyLight(){
  sun.position.set(2, 24, 3); sun.target.position.set(0, 0, 0);
  sun.intensity = opt.night ? .05 : 1.5;
  hemi.intensity = opt.night ? .12 : .85; fillLight.intensity = opt.night ? .04 : (opt.mode === 'walk' ? .75 : .45);
  scene.background = new THREE.Color(opt.night ? 0x0d1220 : 0xe9edf2);
  ground.material.color.set(opt.night ? 0x1a2030 : 0xe3e8ee);
  // 白天把点光源整个隐藏（强度为 0 也会进着色器计算，隐藏的才会被渲染器跳过）
  lampG.children.forEach(o => { if (o.isPointLight){ o.visible = opt.night && !o.userData.off; o.intensity = 6; } else o.material.emissiveIntensity = opt.night ? 2 : .3; });
  furnG?.traverse(o => { if (o.isPointLight && o.userData.lampK){ o.visible = opt.night; o.intensity = o.userData.lampK; } });
  renderer.toneMappingExposure = opt.night ? 1.25 : 1.05;
  K.envK = opt.night ? .15 : 1; matCache.forEach(m => { if (m.envMap) m.envMapIntensity = m.userData.env*K.envK; });
}

/* ======================= 相机位姿 / 动画 ======================= */
export const ease = t => t < .5 ? 4*t*t*t : 1 - (-2*t + 2)**3/2;
export const clamp01 = t => Math.max(0, Math.min(1, t));
export const pose = (t, p) => ({t, p});
// 与当前 2D 视口完全重合的正俯视位姿：透视相机在该高度下，地面可视高度 = 2D 视口高度
export function planPose(){
  const cx = view.x0 + SW()/2/view.s, cy = view.y0 + SH()/2/view.s, visH = SH()/view.s/1000;
  const dist = visH / 2 / Math.tan(FOV/2*Math.PI/180), t = new THREE.Vector3(wx(cx), 0, wz(cy));
  return pose(t, new THREE.Vector3(t.x, dist, t.z + 1e-4));
}
export function isoFrom(P){
  const d = THREE.MathUtils.clamp(P.p.y, 5, 30), dir = new THREE.Vector3(.3, .82, .49).normalize();
  return pose(P.t.clone(), P.t.clone().addScaledVector(dir, d));
}
const planScale = () => Math.max(.5, Math.max(P().bounds.w, P().bounds.h)/15600);      // 相对默认户型的尺寸比例
export const isoWhole = () => pose(new THREE.Vector3(0, 0, 0), new THREE.Vector3(5.5, 15.5, 10).multiplyScalar(planScale()));
export const topWhole = () => pose(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 19*planScale(), 1e-4));
export const curPose = () => pose(orbit.target.clone(), camera.position.clone());
// 以目标点为中心做球坐标插值：镜头沿弧线倾斜环绕，而不是直线穿越
export function camTween(A, B, e){
  const t = A.t.clone().lerp(B.t, e);
  const sa = new THREE.Spherical().setFromVector3(A.p.clone().sub(A.t)), sb = new THREE.Spherical().setFromVector3(B.p.clone().sub(B.t));
  let dth = sb.theta - sa.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius)*e, sa.phi + (sb.phi - sa.phi)*e, sa.theta + dth*e);
  camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s)); camera.lookAt(t); orbit.target.copy(t);
}
export function setPose(P){ camera.position.copy(P.p); orbit.target.copy(P.t); camera.lookAt(P.t); }
export function animate(dur, fn){ return new Promise(res => { anim = {t0:performance.now(), dur, fn, res}; }); }
export const wait = ms => new Promise(r => setTimeout(r, ms));
export function flyTo(B, dur = 900){ fly = {t0:performance.now(), dur, A:curPose(), B}; }
export function flyToRoom(id){
  const r = P().rooms.find(r => r.id === id), xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
  const t = new THREE.Vector3(wx((Math.min(...xs)+Math.max(...xs))/2), .6, wz((Math.min(...ys)+Math.max(...ys))/2));
  const size = M(Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys)));
  const dir = camera.position.clone().sub(orbit.target).setY(0); if (dir.lengthSq() < .01) dir.set(.6, 0, .8); dir.normalize();
  const dist = size*1.3 + 2.2;
  flyTo(pose(t, new THREE.Vector3(t.x + dir.x*dist*.7, dist*1.05, t.z + dir.z*dist*.7)));
}

/* ======================= 进入 / 退出 3D ======================= */
export async function enter(){
  init(); active = true;
  renderer.setSize(SW(), SH()); labelRenderer.setSize(SW(), SH()); camera.aspect = SW()/SH(); camera.updateProjectionMatrix();
  sync(true);
  opt.mode = 'orbit'; orbit.enabled = false; showLabels(false);
  const A = planPose(), B = isoFrom(A);
  grow = 0; furnGrow = 0; applyGrow(); setPose(A);
  stage.classList.add('animating');
  startLoop(); renderer.render(scene, camera);
  stage.classList.add('is3d');                       // 交叉淡入：此刻 3D 画面与 2D 平面完全重合
  await wait(420);
  await animate(1700, t => {
    camTween(A, B, ease(clamp01(t/.85)));
    grow = ease(clamp01((t - .1)/.55));
    furnGrow = ease(clamp01((t - .45)/.5));
    applyGrow();
  });
  orbit.enabled = true; showLabels(opt.labels);
  stage.classList.remove('animating');
}
export async function exit(){
  if (opt.mode === 'walk'){ walkCtl.unlock(); stopTouchWalk(); $('#hint3d').textContent = HINT_ORBIT(); $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); orbit.target.copy(camera.position).addScaledVector(dir, 3).setY(0); opt.mode = 'orbit'; syncModeBtns();
    camera.fov = FOV; camera.updateProjectionMatrix(); }
  fly = null; orbit.enabled = false; showLabels(false); stage.classList.add('animating');
  const A = curPose(), B = planPose();
  await animate(1300, t => {
    camTween(A, B, ease(clamp01((t - .1)/.9)));
    furnGrow = 1 - ease(clamp01(t/.45));
    grow = 1 - ease(clamp01((t - .2)/.6));
    applyGrow();
  });
  stage.classList.remove('is3d');                    // 此刻 3D 已压平为正俯视，与 2D 重合后淡出
  await wait(450);
  active = false; cancelAnimationFrame(raf); raf = 0;
  stage.classList.remove('animating');
  grow = furnGrow = 1; applyGrow();
}

/* ======================= 选择 / 拾取 ======================= */
export const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
ray.params.Line.threshold = .01;                          // 线段默认命中容差是 1m，会把墙边的辅助线当成障碍
/** 射线命中是否有效：自身及所有父级都可见，且不是辅助线条（漫游用的棱线 / 阴角线等） */
const pickable = h => { if (h.object.isLine) return false; for (let o = h.object; o; o = o.parent) if (!o.visible) return false; return true; };
export function pick(e){
  if (!e) ptr.set(0, 0);
  else { const r = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1); }
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects([...(opt.furn ? [furnG] : []), archUp, archFloor], true).filter(pickable);
  for (const h of hits){
    let o = h.object;
    const pt = {x:h.point.x*1000 + K.ox, y:h.point.z*1000 + K.oy};
    if (o.userData.slide) return {slide:o.userData.slide, dist:h.distance};
    if (o.userData.curtain) return {curtain:o.userData.curtain, dist:h.distance};
    if (o.userData.slat !== undefined) return {slat:o.userData.slat};
    if (o.userData.win !== undefined) return {win:o.userData.win, point:pt};
    if (o.material === glassMat) continue;
    if (o.userData.door) return {door:o.userData.door, dist:h.distance};
    if (o.userData.wall !== undefined) return {wall:o.userData.wall, point:pt};
    if (o.userData.face) return {face:o.userData.face, point:pt, normal:h.face?.normal};
    if (o.userData.room) return {room:o.userData.room};
    while (o && !o.userData.fid && o !== scene) o = o.parent;
    if (o?.userData.fid) return {fid:o.userData.fid};
    return null;                                     // 被墙体挡住
  }
  return null;
}
// 屏幕点 → 地面（y = 0）上的户型坐标 mm；s = 该处每 mm 对应的屏幕像素，用于拖放时的幽灵图大小
export const ground0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
export function groundAt(x, y){
  if (!active || anim) return null;
  const r = renderer.domElement.getBoundingClientRect(), hit = new THREE.Vector3();
  ptr.set((x - r.left)/r.width*2 - 1, -(y - r.top)/r.height*2 + 1);
  ray.setFromCamera(ptr, camera);
  if (!ray.ray.intersectPlane(ground0, hit) || hit.distanceTo(camera.position) > 60) return null;
  // 视线先碰到墙体（或飘窗台）时，落点取碰到的位置，而不是穿过墙落到看不见的墙后
  const wall = ray.intersectObjects([archUp, archFloor], true).find(h => h.object.material !== glassMat && pickable(h));
  if (wall && wall.distance < hit.distanceTo(camera.position) - .01) hit.set(wall.point.x, 0, wall.point.z);
  const px = v => new THREE.Vector2(v.x*r.width/2, v.y*r.height/2), a = px(hit.clone().project(camera));
  const s = Math.max(a.distanceTo(px(hit.clone().add(new THREE.Vector3(1, 0, 0)).project(camera))),
                     a.distanceTo(px(hit.clone().add(new THREE.Vector3(0, 0, 1)).project(camera)))) / 1000;
  return {x:hit.x*1000 + K.ox, y:hit.z*1000 + K.oy, s};
}
export function updateSel(){
  const k = ui.sel?.kind, key = k === 'furn' ? ui.sel.id : k === 'wall' ? 'w' + ui.sel.i + ':' + sigArch.length : k === 'win' ? 'n' + ui.sel.i + ':' + sigArch.length : '';
  if (key !== selKey){
    selKey = key;
    if (selHelper){ scene.remove(selHelper); selHelper.geometry.dispose(); selHelper = null; }
    let g = null;
    if (k === 'furn') g = furnG.children.find(g => g.userData.fid === ui.sel.id);
    else if (k === 'wall') g = archUp.children.find(o => o.userData.wall === ui.sel.i);
    else if (k === 'win') g = archUp.children.find(o => o.userData.win === ui.sel.i && o.isMesh);
    if (g){ selHelper = new THREE.BoxHelper(g, k === 'furn' ? 0x4c6ef5 : 0xf76b15); scene.add(selHelper); }
  }
  if (selHelper) selHelper.update();
}

/* ======================= 漫游 ======================= */
// 触屏漫游：左下虚拟摇杆移动，在画面上拖动转向（iPad 不支持鼠标指针锁定）
export const HINT_ORBIT = () => COARSE ? tr('单指拖动画面 · 双指缩放 / 旋转 · 点选家具后可拖动摆放 · 点门开关', '1 finger pans · 2 fingers zoom / rotate · select furniture to drag it · tap doors to open')
  : tr('拖动平移 · 右键或 Shift+拖动旋转 · 滚轮缩放 · 点房间飞过去 · 选中家具后拖动摆放', 'Drag pans · right-drag or Shift+drag rotates · scroll zooms · click a room to fly there · drag selected furniture');
export const HINT_TOUCHWALK = () => tr('左下摇杆移动 · 拖动画面转向 · 双指缩放视野 · 点门开关', 'Joystick moves · drag to look · pinch to zoom · tap doors to open');
export const HINT_WALK = () => tr('WASD 移动 · 鼠标转向 · 滚轮缩放视野 · Shift 快走 · E 开关门 · Esc 暂停', 'WASD moves · mouse looks · scroll zooms · Shift runs · E opens doors · Esc pauses');
export function syncHint3d(){ $('#hint3d').textContent = opt.mode === 'orbit' ? HINT_ORBIT() : touchWalk ? HINT_TOUCHWALK() : HINT_WALK(); }
export let touchWalk = false;
export const joy = {x:0, y:0, id:null}, eul = new THREE.Euler(0, 0, 0, 'YXZ');
export function lookBy(dx, dy){
  eul.setFromQuaternion(camera.quaternion);
  const k = .005*camera.fov/WALK_FOV;                  // 视场越窄转得越慢，保持跟手
  eul.y += dx*k; eul.x = THREE.MathUtils.clamp(eul.x + dy*k, -1.35, 1.35);
  camera.quaternion.setFromEuler(eul);
}
export function startTouchWalk(){
  touchWalk = true;
  $('#walkOverlay').style.display = 'none'; $('#joy').style.display = 'block'; $('#walkExit').style.display = 'block';
  syncHint3d();
}
export function stopTouchWalk(){
  touchWalk = false; joy.x = joy.y = 0; joy.id = null; $('#joy i').style.transform = '';
  $('#joy').style.display = 'none'; $('#walkExit').style.display = 'none';
}
export function bindJoystick(){
  const el = $('#joy'), knob = $('#joy i'), R = 50;
  const upd = e => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
    const L = Math.hypot(dx, dy); if (L > R){ dx *= R/L; dy *= R/L; }
    joy.x = dx/R; joy.y = dy/R; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; el.setPointerCapture(e.pointerId); upd(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === joy.id) upd(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
/** VR 看房的视场：默认 75°，滚轮 / 双指 / +- 键在 40°–100° 间缩放 */
export const WALK_FOV = 75;
export function walkZoom(k){ if (opt.mode !== 'walk') return; camera.fov = Math.max(40, Math.min(100, camera.fov*k)); camera.updateProjectionMatrix(); }
export function setMode(m){
  if (anim) return;
  opt.mode = m; syncModeBtns();
  if (m === 'walk'){
    select(null);
    if (opt.cut < 99){ opt.cut = 99; syncCutBtns(); sync(); }
    orbit.enabled = false; fly = null;
    camera.fov = WALK_FOV; camera.updateProjectionMatrix();          // 人眼视角要广：鸟瞰用的 45° 在室内会像「管中窥豹」
    const ws = P().walkStart; camera.position.set(wx(ws.x), 1.6, wz(ws.y)); camera.lookAt(wx(ws.lx), 1.5, wz(ws.ly));   // 入户门外
    $('#walkOverlay').style.display = 'flex';
    syncHint3d();
  } else {
    walkCtl.unlock(); stopTouchWalk(); orbit.enabled = true;
    camera.fov = FOV; camera.updateProjectionMatrix();
    $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    syncHint3d();
    orbit.target.set(0, 0, 0); flyTo(isoWhole());
  }
  showLabels(opt.labels && m === 'orbit');
  [archUp, furnG].forEach(G => G.traverse(o => { if (o.userData.walkOnly) o.visible = m === 'walk'; }));
  applyLight();
}
export function blocked(x, z, r = .22){
  for (const [x0, z0, x1, z1] of colliders) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return true;
  for (const sl of slides3d) if (sl.cur < .6){ const [x0, y0, x1, y1] = sl.rect; if (x > wx(x0) - r*.5 && x < wx(x1) + r*.5 && z > wz(y0) - r*.5 && z < wz(y1) + r*.5) return true; }   // 关着的推拉门挡路
  for (const d of doors){
    const a = d.pivot.rotation.y, px = d.pivot.position.x, pz = d.pivot.position.z, ex = px + Math.cos(a)*.9, ez = pz - Math.sin(a)*.9;
    const t = clamp01(((x-px)*(ex-px) + (z-pz)*(ez-pz)) / ((ex-px)**2 + (ez-pz)**2));
    if (Math.hypot(x - (px + t*(ex-px)), z - (pz + t*(ez-pz))) < r*.8) return true;
  }
  return false;
}
export function stepWalk(dt){
  if (!walkCtl.isLocked && !touchWalk) return;
  const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * dt, fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(fwd); if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
  if (keys.KeyD || keys.ArrowRight) mv.add(right); if (keys.KeyA || keys.ArrowLeft) mv.sub(right);
  if (touchWalk){ mv.addScaledVector(fwd, -joy.y).addScaledVector(right, joy.x); }
  const mag = Math.min(1, mv.length());        // 摇杆推得越远走得越快
  if (mag < .05) return;
  mv.normalize().multiplyScalar(sp * mag);
  const p = camera.position;
  if (!blocked(p.x + mv.x, p.z)) p.x += mv.x;
  if (!blocked(p.x, p.z + mv.z)) p.z += mv.z;
}
addEventListener('keydown', e => {
  if (!active || e.target.matches?.('input,select,textarea')) return;
  keys[e.code] = true;
  if (opt.mode === 'walk' && e.code === 'KeyE'){ const h = pick(); if (h?.door && h.dist < 2.5) h.door.open = !h.door.open; if (h?.slide && h.dist < 2.5) h.slide.open = !h.slide.open; }
});
addEventListener('keyup', e => keys[e.code] = false);

/* ======================= 工具栏 ======================= */
export function syncModeBtns(){ document.querySelectorAll('#modes3d .btn').forEach(b => b.classList.toggle('on', b.dataset.mode === opt.mode)); }
export function syncCutBtns(){ document.querySelectorAll('[data-cut]').forEach(b => b.classList.toggle('on', +b.dataset.cut === opt.cut)); }
export function syncWalkTexts(){
  const t = COARSE
    ? [tr('点击开始，从入户门进入', 'Tap to start at the front door'), tr('左下摇杆移动 · 在画面上拖动转向', 'Joystick moves · drag on screen to look'),
       tr('点门开关 · 点「退出 VR」回到鸟瞰', 'Tap doors to open · "Exit VR" returns to orbit')]
    : [tr('点击开始，从入户门进入', 'Click to start at the front door'),
       tr('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 移动 · 鼠标转向 · <kbd>Shift</kbd> 快走', '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · mouse looks · <kbd>Shift</kbd> runs'),
       tr('<kbd>E</kbd> 开关正前方的门 · <kbd>Esc</kbd> 暂停', '<kbd>E</kbd> opens the door ahead · <kbd>Esc</kbd> pauses')];
  t.forEach((h, i) => $('#wo' + (i + 1)).innerHTML = h);
  syncHint3d();
}
export function bindUI(){
  document.querySelectorAll('#modes3d .btn').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  // 触屏设备用摇杆漫游；桌面端锁定鼠标，锁定失败时也退回到摇杆
  $('#walkOverlay').onclick = () => COARSE ? startTouchWalk() : walkCtl.lock();
  document.addEventListener('pointerlockerror', () => { if (active && opt.mode === 'walk') startTouchWalk(); });
  $('#walkExit').onclick = () => setMode('orbit');
  // VR 看房缩放：滚轮（锁定指针时监听 document）、+/- 键
  document.addEventListener('wheel', e => { if (!active || opt.mode !== 'walk') return; if (!walkCtl.isLocked && !host.contains(e.target)) return; e.preventDefault(); walkZoom(Math.exp(Math.max(-100, Math.min(100, e.deltaY))*.0015)); }, {passive:false});
  addEventListener('keydown', e => { if (!active || opt.mode !== 'walk') return; if (e.key === '+' || e.key === '=') walkZoom(1/1.1); if (e.key === '-') walkZoom(1.1); });
  bindJoystick();
  syncWalkTexts();
  $('#vIso').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); else flyTo(isoWhole()); };
  $('#vTop').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); flyTo(topWhole()); };
  document.querySelectorAll('[data-cut]').forEach(b => b.onclick = () => { if (opt.mode === 'walk') return; opt.cut = +b.dataset.cut; syncCutBtns(); sync(); });
  document.querySelectorAll('#toggles3d .btn').forEach(b => b.onclick = () => {
    const k = b.dataset.t; opt[k] = !opt[k]; b.classList.toggle('on', opt[k]);
    if (k === 'furn'){ furnG.visible = opt.furn; if (!opt.furn && ui.sel?.kind === 'furn') select(null); }
    if (k === 'labels') showLabels(opt.labels && opt.mode === 'orbit' && !anim);
    if (k === 'night') applyLight();
  });
}

/* ======================= 主循环 ======================= */
export const clock = new THREE.Clock();
export function startLoop(){ if (!raf){ clock.getDelta(); raf = requestAnimationFrame(loop); } }
export function loop(){
  raf = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  if (anim){ const t = clamp01((now - anim.t0)/anim.dur); anim.fn(t); if (t >= 1){ const r = anim.res; anim = null; r(); } }
  else if (fly){ const t = clamp01((now - fly.t0)/fly.dur); camTween(fly.A, fly.B, ease(t)); if (t >= 1) fly = null; }
  else if (opt.mode === 'orbit') orbit.update();
  else stepWalk(dt);
  doors.forEach(d => { const tg = d.open ? d.a1 : d.a0; d.cur += (tg - d.cur) * Math.min(1, dt*6); d.pivot.rotation.y = d.cur; });
  curtains3d.forEach(c => { c.cur += ((c.open ? 1 : 0) - c.cur)*Math.min(1, dt*4); c.cloth.scale.x = 1 - c.cur*.8; });   // 帘子收拢到一侧
  slides3d.forEach(sl => {                                              // 推拉门：第二扇沿轨道滑到第一扇后面
    sl.cur += ((sl.open ? 1 : 0) - sl.cur) * Math.min(1, dt*5);
    const g = sl.panels[1], [bx, bz] = g.userData.base, off = -sl.travel*sl.cur;
    g.position.set(sl.v ? bx : bx + off, 0, sl.v ? bz + off : bz);
  });
  updateSel(); updateCompass();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

export // 指北针：北向（平面图上方顺时针 north°）相对当前视线方向的屏幕角度
const _f = new THREE.Vector3();
function updateCompass(){
  const el = document.getElementById('compassArrow'); if (!el) return;
  camera.getWorldDirection(_f); _f.y = 0;
  if (_f.lengthSq() < 1e-4) _f.set(0, 1, 0).applyQuaternion(camera.quaternion).setY(0);   // 正俯视：屏幕上方 = 相机的 up 方向
  _f.normalize();
  const t = (P().north || 0)*Math.PI/180, nx = Math.sin(t), nz = -Math.cos(t), rx = -_f.z, rz = _f.x;
  const a = Math.atan2(nx*rx + nz*rz, nx*_f.x + nz*_f.z)*180/Math.PI;
  el.setAttribute('transform', `rotate(${a.toFixed(1)})`);
}
/** 高清离屏截图：按目标宽度临时提高像素比渲染一帧（不含选中框），并给出房间标签的屏幕位置 */
export function capture(width = 2880){
  const pr = renderer.getPixelRatio(), hv = selHelper?.visible;
  if (selHelper) selHelper.visible = false;
  renderer.setPixelRatio(width/SW()); renderer.render(scene, camera);
  const src = renderer.domElement, cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  cv.getContext('2d').drawImage(src, 0, 0);
  renderer.setPixelRatio(pr); if (selHelper) selHelper.visible = hv; renderer.render(scene, camera);
  const labels = [];
  if (opt.labels && opt.mode === 'orbit') P().rooms.filter(r => r.at).forEach(r => {
    const v = new THREE.Vector3(wx(r.at[0]), Math.min(opt.cut, ceilH()) + .15, wz(r.at[1])).project(camera);
    if (v.z < 1 && Math.abs(v.x) < .97 && Math.abs(v.y) < .95) labels.push({text:nm(state.rooms[r.id].name), sub:area(r.poly).toFixed(1) + 'm²', x:(v.x + 1)/2, y:(1 - v.y)/2});
  });
  return {canvas:cv, labels};
}

export function relang(){ syncWalkTexts(); if (inited) buildLabels(); }

export const View3D = {enter, exit, relang, sync:() => sync(), capture, exportVR:(...a) => import('./vrexport.js').then(m => m.exportVR(...a)), groundAt, flyToRoom:id => active && !anim && flyToRoom(id), walking:() => active && opt.mode === 'walk'};
