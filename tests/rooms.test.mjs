// 用默认户型验证 extractRooms：识别出的房间面积应与手工标注的房间一致
import {defaultPlan} from '../src/data.js';
import {extractRooms} from '../src/import/rooms.js';
const P = defaultPlan();
const rects = [...P.walls.map(w => w.slice(0, 4)), ...P.wins.map(w => w.slice(0, 4)), ...P.doors.map(d => d.rect), ...P.slides.map(s => s.rect)];
const t0 = performance.now();
const {rooms} = extractRooms(rects);
const ms = performance.now() - t0;
const area = poly => Math.abs(poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0]*q[1] - q[0]*p[1]; }, 0)) / 2e6;
const got = rooms.map(r => +(r.area/1e6).toFixed(2)).sort((a, b) => b - a);
const want = P.rooms.map(r => +area(r.poly).toFixed(2)).sort((a, b) => b - a);
console.log('recognized', got.join(' '));
console.log('expected  ', want.join(' '));
console.log('polys ok:', rooms.every(r => Math.abs(area(r.poly) - r.area/1e6) < .01), `${ms.toFixed(1)}ms`);
