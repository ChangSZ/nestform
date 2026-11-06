// 命令行 tools/nf.mjs：从零画一个两室一厅，检查分房间、面积和问题检测
import {execFileSync} from 'node:child_process';
import {mkdirSync, rmSync, readFileSync} from 'node:fs';
mkdirSync('out', {recursive:true});
const F = 'out/nf-test.json', nf = (...a) => execFileSync('node', ['tools/nf.mjs', ...a], {encoding:'utf8'});
let fail = 0; const check = (c, what) => { console.log(`${c ? 'ok  ' : 'FAIL'} ${what}`); if (!c) fail++; };
nf('new', F, '--size', '9000x7000');
nf('wall', F, '--from', '4500,0', '--to', '4500,3600'); nf('wall', F, '--from', '0,3600', '--to', '9000,3600'); nf('wall', F, '--from', '7000,3600', '--to', '7000,7000');
nf('door', F, '--at', '2200,3600'); nf('door', F, '--at', '6200,3600'); nf('door', F, '--at', '7000,5200', '--width', '800'); nf('door', F, '--at', '-120,5800', '--entry', '--width', '1000');
nf('window', F, '--at', '2200,-120', '--width', '1800');
nf('rooms', F, '--name', '2000,1500=主卧', '--name', '6500,1500=次卧', '--name', '3000,5000=客厅', '--name', '8000,5000=卫生间');
nf('furn', F, '--add', 'bed', '--at', '2250,1250'); nf('mat', F, '--room', '主卧', '--floor', 'walnut');
const info = JSON.parse(nf('info', F, '--json'));
check(info.rooms.length === 4, `分出 4 个房间（${info.rooms.map(r => r.name).join('、')}）`);
check(Math.abs(info.rooms.find(r => r.name === '主卧').area - 15.72) < .05, '主卧面积 15.72 m²');
check(info.title === '2室1厅1卫', `标题 ${info.title}`);
check(info.issues.length === 0, '无问题');
check(JSON.parse(readFileSync(F, 'utf8')).rooms[info.rooms.find(r => r.name === '主卧').id].mat === 'walnut', '材质已写入');
nf('furn', F, '--add', 'wardrobe', '--at', '2200,4000');               // 挡在主卧门口
check(JSON.parse(nf('info', F, '--json')).issues.some(s => /挡住/.test(s)), '能发现挡门的家具');
let threw = false; try { execFileSync('node', ['tools/nf.mjs', 'door', F, '--at', '3000,3000'], {stdio:'pipe'}); } catch { threw = true; }
check(threw, '开在墙外的门会报错');
// 窗帘：放在窗附近会吸附到窗的室内一侧、按窗宽铺满（窗 1300–3100，y 0 为外墙内皮）
nf('furn', F, '--add', 'drapes', '--at', '2000,600');
const dr = JSON.parse(readFileSync(F, 'utf8')).furniture.find(f => f.type === 'drapes');
check(dr.w === 1800 + 300 && dr.cx === 2200 && dr.cy === dr.d/2 && dr.rot === 0, `窗帘吸附到窗前（${dr.w}×${dr.d} @ ${dr.cx},${dr.cy} ${dr.rot}°）`);
nf('furn', F, '--add', 'painting', '--at', '2200,3520', '--rot', '180');
check(!JSON.parse(nf('info', F, '--json')).issues.some(s => /挂画/.test(s)), '壁挂物件不算占地重叠');
rmSync(F);
if (fail){ console.log(`${fail} 项失败`); process.exit(1); }
