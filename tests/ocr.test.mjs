// 户型图文字解析：OCR 原始结果 → 房间名 / 面积（包括常见误读）
import {roomName, areaOf} from '../src/import/ocr.js';
let fail = 0;
const eq = (got, want, what) => { const ok = got === want; if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what} → ${got}${ok ? '' : `（期望 ${want}）`}`); };
eq(roomName('厨房'), '厨房', '厨房');
eq(roomName('耻室'), '卧室', '误读「耻室」');
eq(roomName('卧室B'), '卧室B', '保留编号 B');
eq(roomName('中室A'), '卧室A', '只认出「室」+ 编号');
eq(roomName('卫生间B'), '卫生间B', '卫生间B');
eq(roomName('书房一'), '书房', '尾部噪声「一」不当编号');
eq(roomName('二过道、二|作时'), '过道', '夹杂噪声');
eq(roomName('有'), null, '单字噪声');
eq(roomName('2972'), null, '纯数字');
eq(areaOf('4.3mn'), 4.3, '4.3mn');
eq(areaOf('20.1m:'), 20.1, '20.1m:');
eq(areaOf('8.37'), 8.3, '「8.3㎡」把 ㎡ 读成 7');
eq(areaOf('2.6f'), 2.6, '「2.6㎡」的 ㎡ 读成 f');
eq(areaOf('卫生间'), null, '没有数字');
eq(areaOf('3723'), null, '尺寸数字不是面积');
if (fail){ console.log(`${fail} 项失败`); process.exit(1); }
