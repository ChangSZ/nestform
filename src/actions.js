import {deleteArch, wallOpts, recomputeRooms} from './plan2d/walledit.js';
import {wallChain, wallRun, PREFIX} from './demolish.js';
import {partOf} from './plan2d/partitions.js';
import {syncPartCur} from './ui/library.js';
import {tr, nm} from './i18n.js';
import {uid, F, WINDOW_DRESSING, fitToWindow} from './data.js';
import {pointInPoly} from './import/rooms.js';
import {COARSE, $, svg, state, ui, mutate, getF, P} from './store.js';
import {aabb, norm, snapRects} from './geom.js';
import {renderMeasure, renderSel} from './plan2d/render.js';
import {renderPanel} from './ui/panel.js';
import {toast} from './io.js';

/* ======================= 操作 ======================= */
export function select(sel){ ui.sel = sel; renderSel(); renderPanel(); }
export function rotateSel(d){ if (ui.sel?.kind==='furn') mutate(() => { const f = getF(ui.sel.id); f.rot = norm(f.rot + d); }); }
export function deleteSel(){
  if (ui.sel?.kind==='furn'){ const id = ui.sel.id; ui.sel = null; mutate(() => state.furniture = state.furniture.filter(f => f.id !== id)); }
  else if (['wall', 'win', 'door', 'slide', 'curtain', 'slat'].includes(ui.sel?.kind)){ const s = ui.sel; ui.sel = null; mutate(() => deleteArch(s)); }
}
export function duplicateSel(){
  if (ui.sel?.kind !== 'furn') return;
  const f = getF(ui.sel.id), n = {...f, id:uid(), cx:f.cx+200, cy:f.cy+200};
  ui.sel = {kind:'furn', id:n.id}; mutate(() => state.furniture.push(n));
}
// 新放下的家具若压在墙 / 窗上，沿穿透较浅的方向推出来，刚好贴墙
export function pushOut(f){
  for (let n = 0; n < 4; n++){
    let moved = false;
    for (const r of snapRects()){
      const {hw, hh} = aabb(f), ox = Math.min(f.cx+hw, r[2]) - Math.max(f.cx-hw, r[0]), oy = Math.min(f.cy+hh, r[3]) - Math.max(f.cy-hh, r[1]);
      if (ox <= 0 || oy <= 0) continue;
      if (ox < oy) f.cx = f.cx < (r[0]+r[2])/2 ? r[0]-hw : r[2]+hw;
      else f.cy = f.cy < (r[1]+r[3])/2 ? r[1]-hh : r[3]+hh;
      moved = true;
    }
    if (!moved) return;
  }
}
export function addItem(it, x, y){
  const [type,name,w,d,color] = it, f = F(type,name,Math.round(x/10)*10,Math.round(y/10)*10,w,d,0,color);
  if (it[5]) f.cab = structuredClone(it[5]);                       // 定制柜参数
  // 窗帘：吸附到附近的窗（贴着窗的室内一侧、按窗宽铺满）；附近没有窗就照常放
  if (!(WINDOW_DRESSING.includes(type) && fitToWindow(f, P().wins.filter((w, i) => !state.demolished.includes('n' + i)), (px, py) => P().rooms.some(r => pointInPoly([px, py], r.poly))))) pushOut(f);
  ui.sel = {kind:'furn', id:f.id};
  mutate(() => type==='rug' ? state.furniture.unshift(f) : state.furniture.push(f));
  toast(tr(`已添加「${name}」${w}×${d}`, `Added "${nm(name)}" ${w}×${d}`));
}
export function toggleWall(id){
  const w = P().walls[+id.slice(1)];
  if (w[4]==='b') return toast(tr('承重墙（黑色）不可拆除', 'Load-bearing walls (black) cannot be removed'));
  if (w[4]==='e') return toast(tr('外墙属于建筑外围护结构，不建议拆除', 'Exterior walls are part of the building envelope and should not be removed'));
  // 整道墙：同一直线上首尾相接的墙段 + 中间的门 / 窗 / 推拉门，一起拆除 / 恢复
  const on = state.demolished.includes(id); let ch;
  mutate(() => {
    if (on){ ch = wallChain(+id.slice(1)); const ids = ch.items.map(o => PREFIX[o.kind] + o.i); state.demolished = state.demolished.filter(x => !ids.includes(x)); }
    else { ch = wallRun(+id.slice(1)); state.demolished = [...new Set([...state.demolished, ...ch.items.map(o => PREFIX[o.kind] + o.i)])]; }
    if (P().auto) recomputeRooms();
  });
  const extra = [ch.doors && tr(`${ch.doors} 扇门`, `${ch.doors} door(s)`), ch.wins && tr(`${ch.wins} 扇窗`, `${ch.wins} window(s)`), ch.slides && tr(`${ch.slides} 樘推拉门`, `${ch.slides} sliding door(s)`)].filter(Boolean).join(tr('、', ', '));
  toast(on ? tr('已恢复整道墙体' + (extra ? `（含 ${extra}）` : ''), 'Wall restored' + (extra ? ` (incl. ${extra})` : ''))
           : tr(`已标记拆除 ${Math.round(ch.len)} mm 墙体` + (extra ? `（含 ${extra}）` : ''), `Marked ${Math.round(ch.len)} mm of wall for removal` + (extra ? ` (incl. ${extra})` : '')));
}

export function setTool(t){
  if (t !== 'wall') wallOpts.part = 'wall';                       // 离开墙体工具时恢复成「普通墙」
  ui.tool = t; ui.mA = null; ui.mCur = null;
  svg.setAttribute('class', 'tool-' + t);
  document.querySelectorAll('#tools .btn').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  syncModeHint(); syncPartCur();
  renderMeasure();
}
export function syncModeHint(){
  const hints = {select:'',
    measure:COARSE ? tr('按住拖出测量线，或依次点两点 · 靠近墙面自动吸附 · 点「选择」退出', 'Hold and drag a line, or tap two points · snaps to walls · tap "Select" to exit')
      : tr('点击两点（或按住拖动）测量距离 · 靠近墙面自动吸附 · Shift 锁定水平/垂直 · Esc 取消', 'Click two points (or drag) to measure · snaps to walls · Shift locks horizontal/vertical · Esc cancels'),
    wall:tr(`正在放置「${partOf(wallOpts.part).name}」：空白处拖一条线 · 点墙 / 门 / 窗选中编辑 · Delete 删除 · 左侧「隔断」可换类型`, `Placing: ${partOf(wallOpts.part).name} — drag a line · click walls / doors / windows to edit · Delete removes · change type under Partitions`),
    demolish:tr('点击灰色非承重墙标记拆除，再次点击恢复 · 黑色承重墙不可拆', 'Click a grey non-bearing wall to remove it, click again to restore · black bearing walls cannot be removed')};
  const h = $('#modehint'); h.textContent = hints[ui.tool]; h.classList.toggle('show', !!hints[ui.tool]);
}

