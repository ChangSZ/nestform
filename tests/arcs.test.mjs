// 弧形墙几何：弧长、弧顶位置、端点
import {arcInfo, arcPoints} from '../src/arcs.js';
const w = [0, -60, 4000, 60, 'n', 800];                 // 4m 横墙，向 +y 拱 800mm
const a = arcInfo(w), pts = arcPoints(w), mid = pts[pts.length >> 1];
const ok = (c, m) => { console.log((c ? 'ok  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
ok(Math.abs(pts[0][0]) < 1 && Math.abs(pts.at(-1)[0] - 4000) < 1, `端点 ${pts[0].map(Math.round)} → ${pts.at(-1).map(Math.round)}`);
ok(Math.abs(mid[1] - 800) < 15 && Math.abs(mid[0] - 2000) < 60, `弧顶 ${mid.map(Math.round)}（期望 2000,800）`);
ok(a.len > 4000 && a.len < 4500, `弧长 ${Math.round(a.len)}mm`);
const v = arcPoints([-60, 0, 60, 3000, 'n', -500]), vm = v[v.length >> 1];
ok(Math.abs(vm[0] - 500) < 15, `竖墙拱高 -500 → 弧顶 x=${Math.round(vm[0])}（左法线 = −x，负值弯向 +x）`);
