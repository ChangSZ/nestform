// 把户型图文字识别（tesseract.js，Apache-2.0）用到的 worker / wasm 内核 / 中文模型复制到 public/ocr/，
// 运行时本地加载，不依赖外网 CDN。npm run dev / build 前自动执行。
import {cpSync, mkdirSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'public/ocr');
mkdirSync(join(out, 'lang'), {recursive:true});
const nm = p => join(root, 'node_modules', p);
cpSync(nm('tesseract.js/dist/worker.min.js'), join(out, 'worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'])
  cpSync(nm('tesseract.js-core/' + f), join(out, f));
cpSync(join(root, 'vendor/ocr/chi_sim.traineddata.gz'), join(out, 'lang/chi_sim.traineddata.gz'));
// 随这些文件一起分发它们的许可证原文（Apache-2.0）
cpSync(nm('tesseract.js/LICENSE.md'), join(out, 'LICENSE-tesseract.js.md'));
cpSync(nm('tesseract.js-core/LICENSE'), join(out, 'LICENSE-tesseract.js-core'));
if (!existsSync(join(out, 'worker.min.js'))) process.exit(1);
console.log('ocr assets → public/ocr');
