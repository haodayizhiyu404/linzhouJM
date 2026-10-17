// tools/push-manifest.js —— 把 content/manifest.json 单文件送上 main（发布上线）
//
// 由 publish.js 交互调用，也可单独补推：node tools/push-manifest.js
//
// 做法（为什么不直接切分支）：
//   ① 在当前分支（dev）正常提交同一文件并推送——两边内容一致，以后合并不打架
//   ② 对 main 走 git 管道：hash-object/update-index/write-tree/commit-tree 直接拼出
//      main 的新提交推上去，全程不 checkout、不动工作区——dev 上改到一半的代码绝对安全
//   ③ 失败只影响本次推送：清单文件留在本地，重跑一次即可
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REL = 'content/manifest.json';
const MSG = v => 'content: 设定清单 v' + v + '\n\nCo-Authored-By: Claude Code <noreply@anthropic.com>';
const errline = e => String((e && e.stderr) || (e && e.message) || e).split('\n')[0];

function push(repoDir, version) {
  const git = (...a) => execFileSync('git', a, { cwd: repoDir, encoding: 'utf8' }).trim();
  if (!fs.existsSync(path.join(repoDir, REL))) throw new Error('清单不存在，请先生成（双击 发布设定.bat）');

  // ① 当前分支提交同一文件（无变化则跳过），保持 dev/main 内容一致
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  git('add', REL);
  try { git('commit', '-m', MSG(version)); console.log('已提交到 ' + branch + '：设定清单 v' + version); }
  catch (e) { console.log('  （' + branch + ' 无新变化，跳过提交）'); }
  try { git('push', 'origin', branch); }
  catch (e) { console.log('  （' + branch + ' 推送失败，不阻断 main 发布：' + errline(e) + '）'); }

  // ② 管道拼 main 提交
  git('fetch', 'origin', 'main');
  const base = git('rev-parse', 'origin/main');
  const blob = git('hash-object', '-w', REL);
  git('read-tree', base);
  try {
    git('update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + REL);   // --add：main 上可能还没有这个文件（首发）
    const tree = git('write-tree');
    if (tree === git('rev-parse', base + '^{tree}')) {
      console.log('main 上已是最新内容，无需推送');
      return false;
    }
    const commit = git('commit-tree', tree, '-p', base, '-m', MSG(version));
    git('push', 'origin', commit + ':refs/heads/main');
  } finally {
    git('read-tree', 'HEAD');   // 暂存区还原回当前分支；工作区全程未被触碰
  }
  console.log('已推送 main：设定清单 v' + version + ' 上线，用户下次打开卡即收到');
  return true;
}

module.exports = { push };

if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..');
  let version = '?';
  try { version = JSON.parse(fs.readFileSync(path.join(ROOT, REL), 'utf8')).version; } catch (e) {}
  try { push(ROOT, version); }
  catch (e) { console.error('推送失败：' + errline(e)); process.exit(1); }
}
