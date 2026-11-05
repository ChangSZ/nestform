import {LANG_KEY, LANG, tr, applyStaticLang, setLangVar} from './i18n.js';
import {defaultState, LIB, MATS, WALL_MATS} from './data.js';
import {hooks, fixState, COARSE, $, svg, state, ui, view, snap, commit, undo, redo, setState, ext, mutate} from './store.js';
import {buildDefs} from './plan2d/symbols.js';
import {renderOpenings, renderDims, renderAll} from './plan2d/render.js';
import {clearLayout, drawer, syncPaneBtns} from './ui/panel.js';
import {setTool, syncModeHint} from './actions.js';
import {applyView, fitView, zoomCenter, setRatio} from './plan2d/viewport.js';
import {buildLib} from './ui/library.js';
import {download, exportPNG, exportVR, toast} from './io.js';


/* ======================= 2D / 3D 切换 ======================= */
export let viewMode = '2d', switching = false;
export const is3D = () => viewMode === '3d';
export const TIPS = () => COARSE
  ? {'2d':tr('点或向上拖动素材坞里的家具 / 材质 · 单指拖动平移 · 双指缩放 · 选中家具后底部工具条可旋转 / 复制 / 删除', 'Tap or drag up from the dock · 1 finger pans · pinch zooms · bottom bar rotates / duplicates / deletes'),
     '3d':tr('单指拖动画面 · 双指缩放 / 旋转 · 点房间飞过去 · 点门开关', '1 finger pans · 2 fingers zoom / rotate · tap a room to fly there · tap doors to open')}
  : {'2d':tr('从左侧素材坞拖入家具，或把地面 / 墙面材质拖到房间上 · 滚轮缩放 · 拖动空白处平移 · T 切换 3D', 'Drag furniture from the dock, or drop floor / wall materials on a room · scroll to zoom · drag to pan · T for 3D'),
     '3d':tr('3D 场景与平面方案实时同步 · 右侧面板修改会立即生效 · T 返回 2D', '3D stays in sync with the plan · panel edits apply instantly · T for 2D')};
// three.js 单独打包成一个 chunk：首屏只加载 2D，切到 3D（或浏览器空闲）时再取
let load3DPromise = null;
export function load3D(){
  return load3DPromise ??= import('./view3d/index.js').then(m => { ext.View3D = m.View3D; return m.View3D; }, e => { load3DPromise = null; throw e; });
}
export async function setView(m){
  if (m === viewMode || switching) return;
  switching = true; document.body.classList.add('busy');
  if (!ext.View3D){
    document.body.classList.add('loading3d');
    try { await load3D(); }
    catch(err){ console.error(err); toast(tr('3D 引擎加载失败，请刷新重试', '3D engine failed to load — please reload')); }
    document.body.classList.remove('loading3d');
    if (!ext.View3D){ switching = false; document.body.classList.remove('busy'); return; }
  }
  viewMode = m;
  if (m === '3d'){ if (ui.tool !== 'select') setTool('select'); ui.mA = null; document.body.classList.add('m3d'); await ext.View3D.enter(); }
  else { document.body.classList.remove('m3d'); await ext.View3D.exit(); applyView(); }
  $('#tip').textContent = TIPS()[m];
  switching = false; document.body.classList.remove('busy');
}
/* 全屏：标准 API + Safari（iPad）的 webkit 前缀版本 */
export const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
export function toggleFullscreen(){
  const de = document.documentElement;
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) return toast(tr('当前浏览器不支持网页全屏，可在 Safari 中「添加到主屏幕」后以全屏方式打开', 'Fullscreen is not supported here — in Safari, use "Add to Home Screen" to open it fullscreen'));
    Promise.resolve(req.call(de)).catch(() => toast(tr('无法进入全屏', 'Could not enter fullscreen')));
  }
}
export function syncFullscreen(){
  const on = !!fsEl(), b = $('#fullscreen');
  b.querySelector('span').textContent = on ? tr('退出全屏', 'Exit fullscreen') : tr('全屏', 'Fullscreen');
  b.classList.toggle('on', on);
  b.title = (on ? tr('退出全屏', 'Exit fullscreen') : tr('全屏', 'Fullscreen')) + ' (Shift+F)';
}
export let lastW = 0, lastH = 0;
export function setLang(l){
  setLangVar(l); try { localStorage.setItem(LANG_KEY, l); } catch(e) {}
  applyStaticLang(); syncFullscreen(); syncModeHint(); syncPaneBtns();
  buildLib(); renderOpenings(); renderAll();
  $('#tip').textContent = TIPS()[viewMode];
  ext.View3D?.relang();
}

/* 启动：由 entry.js 在所有模块求值完成后调用（避免循环依赖下的初始化顺序问题） */
const openImport = file => import('./import/dialog.js').then(m => m.openImport(file));
export function boot(){
  $('#importPlan').onclick = () => openImport();
  $('#importPlan2').onclick = () => openImport();
  // 直接把户型图拖到画布上 → 打开导入对话框
  $('#stage').addEventListener('dragover', e => { if ([...e.dataTransfer.items].some(i => i.type.startsWith('image/'))) e.preventDefault(); });
  $('#stage').addEventListener('drop', e => { const f = [...e.dataTransfer.files].find(f => f.type.startsWith('image/')); if (f){ e.preventDefault(); openImport(f); } });
  hooks.renderAll = renderAll; hooks.toast = toast;
  document.querySelectorAll('.menu-pop .btn').forEach(b => b.addEventListener('click', () => b.closest('details').open = false));
  document.querySelectorAll('#viewSeg .btn').forEach(b => b.onclick = () => setView(b.dataset.view));

  document.querySelectorAll('#tools .btn').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  document.querySelectorAll('#layers .btn').forEach(b => b.onclick = () => {
    const k = b.dataset.layer; ui.layers[k] = !ui.layers[k]; b.classList.toggle('on', ui.layers[k]);
    if (k === 'dims') $('#gDims').setAttribute('display', ui.layers.dims ? 'inline' : 'none');
    else if (k !== 'wallSnap') renderAll();
  });
  $('#zoomIn').onclick = () => zoomCenter(1.25);
  $('#zoomOut').onclick = () => zoomCenter(.8);
  $('#fit').onclick = fitView;
  $('#s60').onclick = () => { setRatio(60); toast(tr('已按 1:60 显示', 'Showing at 1:60')); };
  $('#s100').onclick = () => setRatio(100);
  $('#undo').onclick = undo; $('#redo').onclick = redo;
  $('#clearAll').onclick = clearLayout;

  $('#fullscreen').onclick = toggleFullscreen;
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(t => document.addEventListener(t, syncFullscreen));
  // 已从主屏幕以独立 App 方式打开时本就是全屏，隐藏按钮
  if (navigator.standalone || matchMedia('(display-mode: standalone)').matches) $('#fullscreen').hidden = true;
  $('#tgLib').onclick = () => drawer('lib');
  $('#tgPanel').onclick = () => drawer('panel');
  // 触屏上点菜单以外的地方收起「文件」菜单
  document.addEventListener('pointerdown', e => document.querySelectorAll('details.pop[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; }));
  // 同一时间只开一个弹出卡片；语言 / 文件菜单里点完即收起
  document.querySelectorAll('details.pop').forEach(d => d.addEventListener('toggle', () => { if (d.open) document.querySelectorAll('details.pop[open]').forEach(o => o !== d && (o.open = false)); }));
  document.querySelectorAll('#langSel .btn').forEach(b => b.addEventListener('click', () => b.closest('details').open = false));
  matchMedia('(max-width:1100px)').addEventListener('change', () => drawer(null));
  drawer(null);                                  // 恢复上次的面板收起状态
  $('#exportPng').onclick = exportPNG;
  $('#exportVR').onclick = exportVR;
  $('#exportJson').onclick = () => download(tr('栖构-户型方案', 'nestform-plan') + '.json', new Blob([JSON.stringify(state, null, 2)], {type:'application/json'}));
  $('#importJson').onclick = () => $('#fileIn').click();
  $('#fileIn').onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    file.text().then(txt => {
      try { const s = JSON.parse(txt); if (!Array.isArray(s.furniture)) throw 0; const b = snap(); setState(fixState(s)); ui.sel = null; commit(b); renderAll(); toast(tr('方案已导入', 'Plan imported')); }
      catch(err){ toast(tr('文件格式不正确', 'Invalid file format')); }
    });
    e.target.value = '';
  };
  $('#reset').onclick = () => { if (confirm(tr('恢复为默认设计方案？（可撤销）', 'Reset to the default design? (undoable)'))){ const b = snap(); setState(defaultState()); ui.sel = null; commit(b); renderAll(); } };
  // 横竖屏切换、表头换行等都会改变画布尺寸；尺寸从 0 恢复（如首次布局）时重新适应窗口
  // 其余尺寸变化（收起 / 展开面板等）保持画面中心不动
  new ResizeObserver(() => {
    const w = svg.clientWidth, h = svg.clientHeight; if (!w) return;
    if (!lastW) fitView();
    else { view.x0 -= (w - lastW)/2/view.s; view.y0 -= (h - lastH)/2/view.s; applyView(); }
    lastW = w; lastH = h;
  }).observe(svg);

  $('#langSel').onclick = e => { const l = e.target.closest('[data-lang]')?.dataset.lang; if (l && l !== LANG) setLang(l); };

  applyStaticLang(); syncFullscreen();
  buildDefs(); buildLib(); renderOpenings(); renderDims();
  $('#tip').textContent = TIPS()['2d'];
  fitView(); renderAll();
  installAutomation();
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => load3D().catch(() => {}));

}

/* ======================= 自动化接口（脚本 / AI 助手） =======================
 * window.nestform：读写当前方案、切换视图、导出。方案格式与「文件 → 导出方案」相同（见 tools/nf.mjs）。
 * 网址参数 ?plan=方案.json：打开页面时直接载入该方案（同源或允许跨域的地址）。
 */
function installAutomation(){
  const load = s => {
    const data = typeof s === 'string' ? JSON.parse(s) : structuredClone(s);
    if (!Array.isArray(data?.furniture)) throw new Error('不是栖构方案（缺少 furniture 数组）');
    const b = snap(); setState(fixState(data)); ui.sel = null; commit(b); fitView(); renderAll();
  };
  window.nestform = {
    version:1,
    /** 当前方案（深拷贝） */
    get state(){ return structuredClone(state); },
    /** 载入方案（对象或 JSON 字符串），可撤销 */
    load,
    /** 在一次可撤销的修改里改方案：nestform.edit(s => { s.furniture.push(...) }) */
    edit(fn){ mutate(() => fn(state)); },
    /** 切换视图：'2d' | '3d' */
    view:m => setView(m),
    /** 3D 模式：'orbit'（鸟瞰）| 'walk'（VR 看房）；飞到某个房间 */
    flyToRoom:id => ext.View3D?.flyToRoom(id),
    /** 导出图片（2D 平面展示图 / 3D 效果图，取决于当前视图）、VR 看房 HTML、方案 JSON */
    exportImage:() => exportPNG(), exportVR:() => exportVR(),
    exportJSON:() => JSON.stringify(state, null, 2),
    undo, redo,
    /** 可用的家具类型 / 地面材质 / 墙面材质 */
    catalog:{furniture:LIB.flatMap(c => c.items.map(i => ({type:i[0], name:i[1], w:i[2], d:i[3], cat:c.cat}))), floors:Object.keys(MATS), walls:Object.keys(WALL_MATS)},
  };
  const src = new URLSearchParams(location.search).get('plan');
  if (src) fetch(src).then(r => r.ok ? r.json() : Promise.reject(r.status)).then(s => { load(s); toast(tr('已载入方案', 'Plan loaded')); })
    .catch(e => toast(tr(`无法载入方案：${e}`, `Could not load plan: ${e}`)));
}

