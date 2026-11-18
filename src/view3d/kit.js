import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import {MATS, WALL_MATS} from '../data.js';
import {texCanvas, matInfo, reliefCanvases, reliefOf} from '../materials.js';
// 3D 共享上下文：renderer / 环境贴图 / 公共材质在 index.js 初始化时写入
export const K = {renderer:null, envTex:null, envK:1, glassMat:null, frameMat:null, ox:6000, oy:5300, H:2.8};
export const FOV = 45;                              // 层高 2.8 m
// 户型中心放在世界原点：K.ox / K.oy 随当前户型的画布中心变化（见 index.js buildArch）
export const wx = x => (x - K.ox) / 1000, wz = y => (y - K.oy) / 1000, M = v => v / 1000;
/* ======================= 材质 ======================= */
export const matCache = new Map();
export function mat(color, o = {}){
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)){
    const m = new THREE.MeshStandardMaterial({color, roughness:.7, ...o});
    // 金属 / 光滑表面挂环境反射，墙面等哑光材质不挂，避免整体变亮
    if (K.envTex && (m.metalness > 0 || m.roughness < .4)){ m.envMap = K.envTex; m.userData.env = m.metalness > .5 ? 1 : .5; m.envMapIntensity = m.userData.env*K.envK; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}
export function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rgbK = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v*k))); return `rgb(${f(n>>16&255)},${f(n>>8&255)},${f(n&255)})`; };
// 地面贴图按真实尺寸平铺（UV 单位 = 米）
// 地面 / 墙面贴图与 2D 共用 src/materials.js；UV 单位 = 米
const texMats = {};
function texMat(kind, roughDefault){
  if (texMats[kind]) return texMats[kind];
  const m = matInfo(kind) || MATS.tile800, t = new THREE.CanvasTexture(texCanvas(kind));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1/m.sx, 1/m.sy);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = K.renderer.capabilities.getMaxAnisotropy();
  const tex = (cv, srgb) => { const x = new THREE.CanvasTexture(cv); x.wrapS = x.wrapT = THREE.RepeatWrapping; x.repeat.copy(t.repeat); x.anisotropy = t.anisotropy; if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; };
  // 法线 + 粗糙度贴图（由颜色贴图推出，见 materials.js）：粗糙度贴图的面值是 200/255，材质粗糙度相应放大，保持面的光泽不变
  const rl = reliefCanvases(kind), k = reliefOf(kind);
  return texMats[kind] = new THREE.MeshStandardMaterial({map:t, roughness:Math.min(1, (m.rough ?? roughDefault)*255/200), roughnessMap:tex(rl.rough), normalMap:tex(rl.normal), normalScale:new THREE.Vector2(k, k)});
}
export const floorMat = kind => texMat(MATS[kind] ? kind : 'tile800', .5);
export const wallFinishMat = kind => texMat(WALL_MATS[kind] ? kind : 'paint_white', /tile|marble/.test(kind) ? .25 : .9);

/* ======================= 几何小工具（y = 底面高度） ======================= */
export const asMat = m => typeof m === 'string' ? mat(m) : m;
export const sh = o => { o.castShadow = o.receiveShadow = true; return o; };
export const mesh = (geo, m) => sh(new THREE.Mesh(geo, asMat(m)));
export const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
export function box(w, h, d, m, x = 0, y = 0, z = 0){
  const o = mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h/2, z); return o;
}
export function rbox(w, h, d, m, x = 0, y = 0, z = 0, r = .04){
  const o = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w/2-.001, h/2-.001, d/2-.001)), m); o.position.set(x, y + h/2, z); return o;
}
export function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 28){
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h/2, z); return o;
}
// 旋转体：pts = [[半径, 高度], …] 自下而上，y = 底面
export function lathe(pts, m, x = 0, y = 0, z = 0, seg = 40){
  const o = mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg), m); o.position.set(x, y, z); return o;
}
// 两点之间的圆杆，r0 在 a 端、r1 在 b 端（收分椅腿、斜撑）
export function rod(a, b, r0, m, r1 = r0, seg = 12){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
  o.position.copy(A).add(B).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); return o;
}
// 沿曲线的圆管（水龙头、扶手、灯臂）
export const tube = (pts, r, m, seg = 40) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'), seg, r, 10), m);
// 椭球（靠垫、叶片、豆袋），y = 中心
export function blob(rx, ry, rz, m, x = 0, y = 0, z = 0, seg = 24){
  const o = mesh(new THREE.SphereGeometry(1, seg, Math.round(seg*.7)), m); o.scale.set(rx, ry, rz); o.position.set(x, y, z); return o;
}
// 水平圆环，y = 中心
export function ring(R, r, m, x = 0, y = 0, z = 0){ const o = mesh(new THREE.TorusGeometry(R, r, 10, 48), m); o.rotation.x = Math.PI/2; o.position.set(x, y, z); return o; }
export function rrect(w, d, r){
  const s = new THREE.Shape(), x = -w/2, y = -d/2; r = Math.min(r, w/2 - .001, d/2 - .001);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// 中空圆角框（浴缸、水槽沿、椅背框）：外 w×d、壁厚 t、高 h
export function shell(w, d, h, t, r, m, x = 0, y = 0, z = 0){
  const s = rrect(w, d, r); s.holes.push(rrect(w - 2*t, d - 2*t, Math.max(.004, r - t)));
  const geo = new THREE.ExtrudeGeometry(s, {depth:h, bevelEnabled:false, curveSegments:10}); geo.rotateX(-Math.PI/2);
  const o = mesh(geo, m); o.position.set(x, y, z); return o;
}
export const darker = (hex, k = .8) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
export const lighter = (hex, k = .2) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
// 四条收分腿：inset 为距边距离，r 为腿底半径（顶部略粗）
export const legs = (g, w, d, h, m, inset = .05, r = .02) => [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod([a*(w/2-inset), 0, b*(d/2-inset)], [a*(w/2-inset), h, b*(d/2-inset)], r*.7, m, r)));
export const metal = () => mat('#cfd2d4', {metalness:.9, roughness:.25});
export const chrome = () => mat('#eef0f2', {metalness:1, roughness:.08});
export const hwMat = () => mat('#b9b3a8', {metalness:.85, roughness:.3});
export const blackMetal = () => mat('#2b2b2d', {metalness:.6, roughness:.4});
export const mirror = () => mat('#dfeaee', {metalness:.55, roughness:.06});
export const ceramic = (o = {}) => mat('#fbfbf9', {roughness:.12, ...o});
export const fabric = c => mat(c, {roughness:.96});
export const woodM = c => mat(c, {roughness:.55});
export const screenMat = (glow = '#1a2636') => mat('#0b0e13', {roughness:.1, metalness:.3, emissive:glow, emissiveIntensity:.35});
export const glowMat = (c = '#fff4dc', e = '#ffdca0', k = .5) => mat(c, {emissive:e, emissiveIntensity:k, roughness:.9, side:THREE.DoubleSide});

// 拉手：y 为拉手中心，z 为门板正面
export function pull(g, len, vert, x, y, z){
  const m = hwMat(), o = new THREE.Group();
  o.add(vert ? box(.01, len, .01, m, 0, -len/2, .028) : box(len, .01, .01, m, 0, -.005, .028));
  [-1, 1].forEach(s => o.add(vert ? box(.008, .008, .028, m, 0, s*(len/2 - .015) - .004, .014) : box(.008, .008, .028, m, s*(len/2 - .015), -.004, .014)));
  o.position.set(x, y, z); g.add(o);
}
export function knob(g, x, y, z){ const k = cyl(.011, .014, .02, hwMat(), x, y - .01, z + .01, 16); k.rotation.x = Math.PI/2; g.add(k, blob(.014, .014, .008, hwMat(), x, y, z + .022, 12)); }
// 柜门 / 抽屉面板：x0..x0+w、y0..y0+h 区域内 nx 列 × ny 行，正面朝 +z（z = 柜体正面）
// hd：'bar' 金属拉手 | 'knob' 圆钮 | 'edge' 顶部隐形拉槽 | 'none'；hy：门拉手中心高度（null = 面板中部）
export function fronts(g, x0, y0, w, h, z, nx, ny, m, hd = 'bar', hy = null){
  const gap = .005, pw = w/nx, ph = h/ny, fz = z + .018;
  g.add(box(w, h, .002, '#2a2724', x0 + w/2, y0, z + .001));                     // 缝隙里透出的暗色
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++){
    const cx = x0 + pw*(i + .5), yb = y0 + ph*j, drawer = ph < .4 && pw >= ph;
    g.add(rbox(pw - gap, ph - gap, .018, m, cx, yb + gap/2, z + .009, .003));
    if (hd === 'none') continue;
    if (hd === 'edge'){ g.add(box(pw - .05, .01, .006, '#3c3a37', cx, yb + ph - gap - .018, fz)); continue; }
    if (drawer){ hd === 'knob' ? knob(g, cx, yb + ph/2, fz) : pull(g, Math.min(.3, pw*.45), false, cx, yb + ph/2, fz); continue; }
    const len = Math.min(.45, ph*.35), hx = nx === 1 ? cx + pw/2 - .045 : (i % 2 ? cx - pw/2 + .04 : cx + pw/2 - .04);
    const y = Math.min(yb + ph - .05 - len/2, Math.max(yb + .05 + len/2, hy ?? yb + ph/2));
    hd === 'knob' ? knob(g, hx, y, fz) : pull(g, len, true, hx, y, fz);
  }
}
export const vasePts = (r, h) => [[0, 0], [r*.65, 0], [r, h*.32], [r*.92, h*.62], [r*.42, h*.86], [r*.5, h]];
export function vase(g, x, y, z, r, h, c, R, flowers = true){
  g.add(lathe(vasePts(r, h), mat(c, {roughness:.35, side:THREE.DoubleSide}), x, y, z, 32));
  if (!flowers) return;
  const cols = ['#f3e6d8', '#e8b4a0', '#f6d27a', '#ffffff'];
  for (let k = 0; k < 5; k++){
    const a = k*1.26 + R()*.4, s = .03 + R()*.05, top = [x + Math.cos(a)*s, y + h + .12 + R()*.14, z + Math.sin(a)*s];
    g.add(rod([x, y + h*.6, z], top, .003, '#6f8f4a', .003, 6), blob(.022, .018, .022, cols[k % 4], ...top, 12));
  }
}
export function tableLamp(g, x, y, z, s = 1){
  g.add(lathe([[0, 0], [.06*s, 0], [.075*s, .05*s], [.08*s, .12*s], [.055*s, .2*s], [.018*s, .25*s], [.012*s, .3*s]], ceramic({roughness:.3}), x, y, z, 32));
  g.add(lathe([[.13*s, 0], [.1*s, .18*s]], glowMat('#f6ecd9', '#ffdca0', .35), x, y + .26*s, z, 40), blob(.03*s, .03*s, .03*s, glowMat('#fff', '#ffe2b0', 1), x, y + .31*s, z, 12));
}
export const plate = (g, r, x, y, z) => g.add(lathe([[0, 0], [r*.6, 0], [r*.72, .008], [r, .02]], ceramic({side:THREE.DoubleSide}), x, y, z, 32));


/* ======================= 合并几何 ======================= */
/** 把一件模型里材质相同的 Mesh 合并成一个（顶点先变换到模型根的局部坐标），绘制调用从几十次降到几次。
 *  多材质 / 带子节点的 Mesh 保持原样；镜像（负缩放）的部件翻转三角形绕序，保证正面朝外。 */
const _m = new THREE.Matrix4();
export function compact(g){
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert(), groups = new Map();
  g.traverse(o => {
    if (!o.isMesh || o === g || Array.isArray(o.material) || o.children.length || !o.visible) return;
    const k = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '');
    if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o);
  });
  for (const list of groups.values()){
    if (list.length < 2) continue;
    const geos = list.map(o => {
      const src = o.geometry, geo = src.index ? src.toNonIndexed() : src.clone();
      for (const n of Object.keys(geo.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') geo.deleteAttribute(n);
      geo.morphAttributes = {};
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2), 2));
      _m.multiplyMatrices(inv, o.matrixWorld); geo.applyMatrix4(_m);
      if (_m.determinant() < 0) for (const at of Object.values(geo.attributes)){               // 镜像：交换每个三角形的后两个顶点
        const a = at.array, n = at.itemSize;
        for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++){ const t = a[(i + 1)*n + c]; a[(i + 1)*n + c] = a[(i + 2)*n + c]; a[(i + 2)*n + c] = t; }
      }
      return geo;
    });
    const merged = mergeGeometries(geos, false); geos.forEach(x => x.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow;
    list.forEach(o => { o.removeFromParent(); o.geometry.dispose(); });
    g.add(m);
  }
  return g;
}
