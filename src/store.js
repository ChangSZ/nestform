import {tr} from './i18n.js';
import {defaultState, defaultPlan, roomDefaults} from './data.js';

export const STORE = 'nestform-design-v1';
export function load(){
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s && Array.isArray(s.furniture)) return fixState(s); } catch(e) {}
  return null;
}
export function fixState(s){
  if (!s.plan?.walls) s.plan = defaultPlan();                  // 方案文件缺字段时补默认值
  const d = roomDefaults(s.plan), saved = s.rooms || {};
  s.rooms = {}; for (const id of new Set([...Object.keys(d), ...Object.keys(saved)])) s.rooms[id] = {...d[id], ...saved[id]};   // 逐房间合并默认值
  for (const r of Object.values(s.rooms)) r.wall ||= 'paint_white';
  s.demolished = s.demolished || []; s.measures = s.measures || [];
  return s;
}

export const PX_MM = 25.4 / 96;                       // 1 CSS px = 0.2646 mm
export const COARSE = matchMedia('(pointer:coarse)').matches;   // iPad / 手机等触屏为主的设备
export const TAP = COARSE ? 9 : 4;                    // 手指按下后移动超过该像素才算拖动
export const narrow = () => matchMedia('(max-width:1100px)').matches;
export const P = () => state.plan;                    // 当前户型
export const $ = s => document.querySelector(s);
export const svg = $('#plan');


/* ======================= 状态 / 历史 / 存储 ======================= */
export let state = load() || defaultState();
export const ui = {tool:'select', sel:null, mA:null, mCur:null,
  layers:{dims:true, labels:true, furn:true, grid:false, bearing:false, wallSnap:true, underlay:true}};
export let view = {x0:0, y0:0, s:.06};
export const undoStack = [], redoStack = [];

export function save(){ try { localStorage.setItem(STORE, JSON.stringify(state)); } catch(e) {} }
export const snap = () => JSON.stringify(state);
export function commit(before){ undoStack.push(before); if (undoStack.length > 150) undoStack.shift(); redoStack.length = 0; save(); }
export function mutate(fn){ const b = snap(); fn(); commit(b); hooks.renderAll(); }
export function undo(){ if (!undoStack.length) return hooks.toast(tr('没有可撤销的操作', 'Nothing to undo')); redoStack.push(snap()); state = JSON.parse(undoStack.pop()); validateSel(); save(); hooks.renderAll(); }
export function redo(){ if (!redoStack.length) return; undoStack.push(snap()); state = JSON.parse(redoStack.pop()); validateSel(); save(); hooks.renderAll(); }
export function validateSel(){
  if (ui.sel?.kind==='furn' && !getF(ui.sel.id)) ui.sel = null;
  if (ui.sel?.kind==='room' && !state.plan.rooms.some(r => r.id === ui.sel.id)) ui.sel = null;
  if (ui.sel?.kind==='wall' && !state.plan.walls[ui.sel.i]) ui.sel = null;
}
export const getF = id => state.furniture.find(f => f.id === id);

export function setState(s){ state = s; }
// 3D 模块按需加载后挂到这里，其它模块通过 ext.View3D 访问
export const ext = {View3D:null};

// store 保持为依赖图的叶子模块（避免循环依赖下的初始化顺序问题）；渲染 / 提示由 main.js 注入
export const hooks = {renderAll(){}, toast(){}};
