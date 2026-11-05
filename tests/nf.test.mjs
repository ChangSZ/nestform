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
rmSync(F);
if (fail){ console.log(`${fail} 项失败`); process.exit(1); }
