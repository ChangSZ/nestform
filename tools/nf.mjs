#!/usr/bin/env node
/* =====================================================================
 *  栖构 Nestform 命令行：直接读写方案 JSON（与「文件 → 导出 / 导入方案」同一格式），
 *  供脚本 / AI 助手自动画户型、开门窗、分房间、摆家具、换材质，并检查方案。
 *
 *  坐标：毫米，x 向右、y 向下（上北下南），原点在左上角外墙内皮。
 *  用法：node tools/nf.mjs <命令> <方案.json> [参数]     node tools/nf.mjs help
 * ===================================================================== */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {LIB, MATS, WALL_MATS, defaultState, defaultWall} from '../src/data.js';
import {extractRooms, pointInPoly} from '../src/import/rooms.js';

/* ---------- 参数解析 ---------- */
const argv = process.argv.slice(2), cmd = argv[0], file = argv[1] && !argv[1].startsWith('--') ? argv[1] : null;
const opts = {}, multi = {};
for (let i = 1; i < argv.length; i++){
  const a = argv[i]; if (!a.startsWith('--')) continue;
  const k = a.slice(2), v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  if (k in opts){ (multi[k] ||= [opts[k]]).push(v); } opts[k] = v;
}
const list = k => multi[k] || (opts[k] != null ? [opts[k]] : []);
const pt = s => { const m = String(s).split(',').map(Number); if (m.length !== 2 || m.some(isNaN)) die(`坐标格式应为 x,y（毫米），收到「${s}」`); return m; };
const num = (k, d) => opts[k] == null ? d : +opts[k];
function die(msg){ console.error('✗ ' + msg); process.exit(1); }
const ok = msg => console.log('✓ ' + msg);

/* ---------- 方案读写 ---------- */
const load = () => { if (!file) die('缺少方案文件路径'); if (!existsSync(file)) die(`找不到 ${file}（先用 new 或 default 创建）`); return JSON.parse(readFileSync(file, 'utf8')); };
const save = s => { writeFileSync(file, JSON.stringify(s, null, 2)); };
const R = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const r10 = v => Math.round(v/10)*10;
const area = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0))/2e6;
const isH = r => (r[2] - r[0]) >= (r[3] - r[1]);
let _n = 0; const uid = p => p + Date.now().toString(36) + (++_n);

function emptyPlan(W, D, T){
  const walls = [[-T, -T, W + T, 0, 'e'], [-T, D, W + T, D + T, 'e'], [-T, 0, 0, D, 'e'], [W, 0, W + T, D, 'e']];
  return {v:1, title:null, walls, wins:[], doors:[], slides:[], rooms:[], dims:[], entryMark:null, lintels:[], walkStart:{x:W/2, y:D/2, lx:W, ly:D/2}, bounds:{}, height:2800, north:0};
}
/** 尺寸链 / 画布范围 / 漫游起点：按当前墙和房间重算 */
function refresh(s){
  const pl = s.plan, xs = pl.walls.flatMap(w => [w[0], w[2]]), ys = pl.walls.flatMap(w => [w[1], w[3]]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  pl.bounds = {x:x0 - 1850, y:y0 - 1750, w:x1 - x0 + 3700, h:y1 - y0 + 3500};
  pl.dims = [[true, y0 - 750, x0, [x1 - x0]], [true, y1 + 650, x0, [x1 - x0]], [false, x0 - 800, y0, [y1 - y0]], [false, x1 + 750, y0, [y1 - y0]]];
  const big = pl.rooms.filter(r => r.counted !== false).sort((a, b) => area(b.poly) - area(a.poly))[0];
  if (big) pl.walkStart = {x:big.at[0], y:big.at[1], lx:big.at[0] + 1000, ly:big.at[1]};
  const cnt = pl.rooms.filter(r => r.counted !== false);
  const nB = cnt.filter(r => /卧|儿童房|老人房/.test(r.name)).length, nL = cnt.filter(r => /客厅|餐厅|客餐厅/.test(r.name)).length, nW = cnt.filter(r => /卫/.test(r.name)).length;
  if (cnt.length) Object.assign(pl, {title:`${nB}室${nL}厅${nW}卫`, titleEn:`${nB}BR ${nL}LR ${nW}BA`});
  return s;
}
const findRoom = (s, key) => {
  const pl = s.plan;
  return pl.rooms.find(r => r.id === key || r.name === key || s.rooms[r.id]?.name === key)
      || (/^-?\d+,-?\d+$/.test(key) ? pl.rooms.find(r => pointInPoly(pt(key), r.poly)) : null);
};
const roomName = (s, r) => s.rooms[r.id]?.name || r.name;

/* ---------- 洞口：在墙上切开 ---------- */
/** 找到点 p 所在的墙（含 tol mm 容差）并按洞口宽度切开 → {wall, rect, horiz} */
function cut(s, p, width){
  const pl = s.plan, tol = 60;
  const i = pl.walls.findIndex(w => p[0] >= w[0] - tol && p[0] <= w[2] + tol && p[1] >= w[1] - tol && p[1] <= w[3] + tol);
  if (i < 0) die(`点 ${p} 不在任何墙上（洞口要开在墙上；用 info 查看墙的位置）`);
  const w = pl.walls[i], h = isH(w), len = h ? w[2] - w[0] : w[3] - w[1];
  if (width > len - 100) die(`墙段只有 ${len}mm，放不下 ${width}mm 的洞口`);
  let a = r10((h ? p[0] : p[1]) - width/2);
  a = Math.max(h ? w[0] : w[1], Math.min(a, (h ? w[2] : w[3]) - width));
  const b = a + width, rect = h ? [a, w[1], b, w[3]] : [w[0], a, w[2], b];
  const pieces = h ? [[w[0], w[1], a, w[3]], [b, w[1], w[2], w[3]]] : [[w[0], w[1], w[2], a], [w[0], b, w[2], w[3]]];
  pl.walls.splice(i, 1, ...pieces.filter(q => (q[2] - q[0]) > 20 && (q[3] - q[1]) > 20).map(q => [...q, w[4]]));
  return {rect, horiz:h};
}

/* ---------- 命令 ---------- */
const HELP = `栖构 Nestform 命令行（坐标单位 mm，x 向右、y 向下）
  default <f>                         写出默认样板方案（三室一厅两卫）
  new <f> --size 宽x深 [--wall 240]    新建空户型：一圈外墙（内皮从 0,0 到 宽,深）
  wall <f> --from x,y --to x,y [--thick 120] [--type n|b|e|low]
                                      画一道直墙（按中心线；n 普通 / b 承重 / e 外墙 / low 矮墙）
  door <f> --at x,y [--width 900] [--arch] [--slide] [--entry] [--flip]
                                      在 x,y 所在的墙上开门（--arch 门洞，--slide 推拉门，--entry 入户门）
  window <f> --at x,y [--width 1500] [--sill 0.9] [--full]
                                      在墙上开窗（--full 落地窗）
  rooms <f> [--name x,y=名称 ...]       按墙自动分房间；用 x,y 点给房间命名（未指定的沿用旧名）
  furn <f> --add 类型 --at x,y [--rot 0|90|180|270] [--w mm --d mm] [--name 名称] [--color #hex]
  furn <f> --remove 名称或id           删除家具
  furn <f> --move 名称或id --at x,y [--rot 角度]
  mat <f> --room 名称|x,y [--floor 材质] [--wall 墙面]
  height <f> --mm 2800                设置层高
  info <f> [--json]                   房间 / 面积 / 家具清单 + 检查（家具出界、重叠、挡门）
  catalog [furniture|floors|walls]    列出可用的家具类型、地面材质、墙面材质
  rotate 约定：0 = 靠背（床头 / 柜背）贴上墙（北），90 = 贴右墙（东），180 = 贴下墙（南），270 = 贴左墙（西）`;

const C = {
  help(){ console.log(HELP); },
  default(){ if (!file) die('缺少方案文件路径'); save(defaultState()); ok(`已写出默认方案 → ${file}`); },
  new(){
    const [W, D] = String(opts.size || '').split(/[x×*]/).map(Number); if (!(W > 1000 && D > 1000)) die('--size 应为 宽x深（毫米），如 --size 10000x8000');
    const s = {plan:emptyPlan(W, D, num('wall', 240)), furniture:[], rooms:{}, demolished:[], measures:[]};
    save(refresh(s)); ok(`新建空户型 ${W}×${D}mm → ${file}（下一步：wall 画隔墙、door / window 开洞、rooms 分房间）`);
  },
  wall(){
    const s = load(), [a, b] = [pt(opts.from), pt(opts.to)], t = num('thick', 120)/2, type = opts.type || 'n';
    if (!['n', 'b', 'e', 'low'].includes(type)) die('--type 只能是 n / b / e / low');
    const h = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    const r = h ? [Math.min(a[0], b[0]), a[1] - t, Math.max(a[0], b[0]), a[1] + t] : [a[0] - t, Math.min(a[1], b[1]), a[0] + t, Math.max(a[1], b[1])];
    s.plan.walls.push([...r.map(r10), type]); save(refresh(s));
    ok(`墙 ${r.map(r10).join(',')}（${h ? '横' : '竖'}向，类型 ${type}）。画完隔墙后运行 rooms 重新分房间`);
  },
  door(){
    const s = load(), wd = num('width', opts.slide ? 1600 : 900), {rect, horiz} = cut(s, pt(opts.at), wd), pl = s.plan;
    if (opts.slide){ pl.slides.push({rect, v:!horiz}); save(refresh(s)); return ok(`推拉门 ${rect.join(',')}`); }
    const g0 = horiz ? rect[0] : rect[1], flip = opts.flip ? -1 : 1;
    const d = {name:opts.entry ? '入户门' : opts.arch ? '拱形门洞' : '门', rect, h:horiz ? [g0, flip > 0 ? rect[3] : rect[1]] : [flip > 0 ? rect[2] : rect[0], g0],
      c:horiz ? [1, 0] : [0, 1], o:horiz ? [0, flip] : [flip, 0], len:wd, ...(opts.arch ? {style:'arch'} : {}), ...(opts.entry ? {entry:true} : {})};
    pl.doors.push(d); save(refresh(s)); ok(`${d.name} ${rect.join(',')}（宽 ${wd}mm）`);
  },
  window(){
    const s = load(), wd = num('width', 1500), {rect} = cut(s, pt(opts.at), wd);
    s.plan.wins.push([...rect, opts.full ? .02 : num('sill', .9), ...(opts.full ? [{full:true}] : [])]); save(refresh(s)); ok(`窗 ${rect.join(',')}（宽 ${wd}mm）`);
  },
  rooms(){
    const s = load(), pl = s.plan;
    const rects = [...pl.walls.filter(w => w[4] !== 'low').map(w => w.slice(0, 4)), ...pl.wins.map(w => w.slice(0, 4)), ...pl.doors.map(d => d.rect), ...pl.slides.map(x => x.rect)];
    const found = extractRooms(rects).rooms.filter(r => r.area >= .8e6);
    const names = list('name').map(v => { const [p, n] = String(v).split('='); return {p:pt(p), n}; });
    const old = pl.rooms, oldState = s.rooms; let k = 0;
    pl.rooms = found.map(r => {
      const poly = r.poly.map(p => p.map(Math.round)), at = r.at.map(Math.round);
      const named = names.find(x => pointInPoly(x.p, poly));
      const prev = old.find(o => o.at && pointInPoly(o.at, poly));
      const id = prev?.id && !pl._used?.includes(prev.id) ? prev.id : 'r' + (++k) + Date.now().toString(36).slice(-3);
      (pl._used ||= []).push(id);
      const name = named?.n || (prev && roomName(s, prev)) || '房间' + (k || 1);
      const mat = oldState[prev?.id]?.mat || (/卫|厨/.test(name) ? 'antislip' : /卧|书房/.test(name) ? 'wood' : 'tile800');
      return {id, name, poly, mat, at};
    });
    delete pl._used;
    s.rooms = Object.fromEntries(pl.rooms.map(r => [r.id, {name:r.name, mat:oldState[r.id]?.mat || r.mat, wall:oldState[r.id]?.wall || defaultWall(r.id, r.mat)}]));
    save(refresh(s));
    ok(`分出 ${pl.rooms.length} 个房间：` + pl.rooms.map(r => `${r.name} ${area(r.poly).toFixed(2)}m²`).join('，'));
    const unnamed = pl.rooms.filter(r => /^房间\d+$/.test(r.name)); if (unnamed.length) console.log(`  提示：${unnamed.length} 个房间未命名，用 --name x,y=名称 指定（中心点：${unnamed.map(r => r.at.join(',')).join(' / ')}）`);
  },
  furn(){
    const s = load();
    if (opts.remove){ const i = s.furniture.findIndex(f => f.id === opts.remove || f.name === opts.remove); if (i < 0) die(`没有家具「${opts.remove}」`); const [f] = s.furniture.splice(i, 1); save(s); return ok(`已删除 ${f.name}`); }
    if (opts.move){
      const f = s.furniture.find(f => f.id === opts.move || f.name === opts.move); if (!f) die(`没有家具「${opts.move}」`);
      if (opts.at){ [f.cx, f.cy] = pt(opts.at).map(r10); } if (opts.rot != null) f.rot = +opts.rot % 360; save(s); return ok(`${f.name} → ${f.cx},${f.cy} 旋转 ${f.rot}°`);
    }
    if (!opts.add) die('furn 需要 --add 类型 / --remove / --move');
    const items = LIB.flatMap(c => c.items), it = items.find(i => i[0] === opts.add && (!opts.name || i[1] === opts.name)) || items.find(i => i[0] === opts.add);
    if (!it) die(`没有家具类型「${opts.add}」（用 catalog furniture 查看）`);
    const [cx, cy] = pt(opts.at).map(r10), rot = +(opts.rot || 0) % 360;
    const f = {id:uid('f'), type:it[0], name:opts.name || it[1], cx, cy, w:num('w', it[2]), d:num('d', it[3]), rot, color:opts.color || it[4], ...(it[5] ? {cab:structuredClone(it[5])} : {})};
    if (f.type === 'rug') s.furniture.unshift(f); else s.furniture.push(f);
    save(s); ok(`${f.name}（${f.type}）${f.w}×${f.d} @ ${cx},${cy} 旋转 ${rot}° id=${f.id}`);
  },
  mat(){
    const s = load(), r = findRoom(s, String(opts.room || '')); if (!r) die(`没有房间「${opts.room}」（info 查看房间名）`);
    const st = s.rooms[r.id] ||= {name:r.name, mat:r.mat, wall:'paint_white'};
    if (opts.floor){ if (!MATS[opts.floor]) die(`没有地面材质「${opts.floor}」（catalog floors）`); st.mat = r.mat = opts.floor; }
    if (opts.wall){ if (!WALL_MATS[opts.wall]) die(`没有墙面材质「${opts.wall}」（catalog walls）`); st.wall = opts.wall; delete st.faces; }
    save(s); ok(`${st.name}：地面 ${MATS[st.mat]?.name || st.mat} · 墙面 ${WALL_MATS[st.wall]?.name || st.wall}`);
  },
  height(){ const s = load(), mm = num('mm', 0); if (!(mm >= 2200 && mm <= 6000)) die('--mm 应在 2200–6000'); s.plan.height = mm; save(s); ok(`层高 ${mm}mm`); },
  info(){
    const s = load(), pl = s.plan, issues = [];
    const rooms = pl.rooms.map(r => ({id:r.id, name:roomName(s, r), area:+area(r.poly).toFixed(2), floor:s.rooms[r.id]?.mat || r.mat, wall:s.rooms[r.id]?.wall, counted:r.counted !== false,
      bbox:[Math.min(...r.poly.map(p => p[0])), Math.min(...r.poly.map(p => p[1])), Math.max(...r.poly.map(p => p[0])), Math.max(...r.poly.map(p => p[1]))]}));
    const box = f => { const sw = f.rot % 180 ? f.d : f.w, sh = f.rot % 180 ? f.w : f.d; return [f.cx - sw/2, f.cy - sh/2, f.cx + sw/2, f.cy + sh/2]; };
    const furn = s.furniture.map(f => {
      const b = box(f), room = pl.rooms.find(r => pointInPoly([f.cx, f.cy], r.poly));
      if (!room) issues.push(`家具「${f.name}」(${f.id}) 中心不在任何房间里`);
      else if (![[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].every(p => pointInPoly([Math.min(Math.max(p[0], b[0] + 30), b[2] - 30), Math.min(Math.max(p[1], b[1] + 30), b[3] - 30)], room.poly))) issues.push(`家具「${f.name}」超出了「${roomName(s, room)}」的范围`);
      return {id:f.id, type:f.type, name:f.name, at:[f.cx, f.cy], size:[f.w, f.d], rot:f.rot, room:room ? roomName(s, room) : null};
    });
    const solid = s.furniture.filter(f => !['rug', 'plant', 'baycushion'].includes(f.type));
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++){
      const a = box(solid[i]), b = box(solid[j]), ov = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oh = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
      if (ov > 50 && oh > 50) issues.push(`家具「${solid[i].name}」和「${solid[j].name}」重叠 ${ov}×${oh}mm`);
    }
    for (const d of pl.doors){ const sw = [Math.min(d.h[0], d.h[0] + (d.c[0] + d.o[0])*d.len), Math.min(d.h[1], d.h[1] + (d.c[1] + d.o[1])*d.len), Math.max(d.h[0], d.h[0] + (d.c[0] + d.o[0])*d.len), Math.max(d.h[1], d.h[1] + (d.c[1] + d.o[1])*d.len)];
      for (const f of solid){ const b = box(f); if (Math.min(b[2], sw[2]) - Math.max(b[0], sw[0]) > 100 && Math.min(b[3], sw[3]) - Math.max(b[1], sw[1]) > 100) issues.push(`家具「${f.name}」挡住了「${d.name}」的开门范围`); } }
    const net = rooms.filter(r => r.counted).reduce((a, r) => a + r.area, 0);
    const out = {title:pl.title, netArea:+net.toFixed(2), height:pl.height || 2800, walls:pl.walls.length, doors:pl.doors.length, windows:pl.wins.length, slides:pl.slides.length, rooms, furniture:furn, issues};
    if (opts.json) return console.log(JSON.stringify(out, null, 2));
    console.log(`${pl.title || '户型'} · 套内 ${net.toFixed(2)} m² · 层高 ${out.height}mm · 墙 ${out.walls} · 门 ${out.doors} · 窗 ${out.windows} · 推拉门 ${out.slides}`);
    console.log('房间：'); rooms.forEach(r => console.log(`  ${r.name.padEnd(6, '　')} ${String(r.area).padStart(6)} m²  范围 ${r.bbox.join(',')}  地面 ${r.floor} 墙面 ${r.wall}${r.counted ? '' : '（不计面积）'}`));
    console.log(`家具（${furn.length}）：`); furn.forEach(f => console.log(`  ${f.name}（${f.type}）${f.size.join('×')} @ ${f.at.join(',')} ${f.rot}° → ${f.room || '房间外'}  id=${f.id}`));
    console.log(issues.length ? `问题（${issues.length}）：\n  - ` + issues.join('\n  - ') : '检查通过：没有出界、重叠、挡门的家具');
  },
  catalog(){
    const kind = file || 'furniture';
    if (kind.startsWith('furn')) LIB.forEach(c => console.log(`[${c.cat}] ` + c.items.map(i => `${i[0]}（${i[1]} ${i[2]}×${i[3]}）`).join('、')));
    else if (kind.startsWith('floor')) console.log(Object.entries(MATS).map(([k, m]) => `${k}（${m.name}）`).join('、'));
    else if (kind.startsWith('wall')) console.log(Object.entries(WALL_MATS).map(([k, m]) => `${k}（${m.name}）`).join('、'));
    else die('catalog 只支持 furniture / floors / walls');
  },
};
(C[cmd] || (() => { if (cmd) console.error(`未知命令「${cmd}」\n`); C.help(); process.exit(cmd ? 1 : 0); }))();
