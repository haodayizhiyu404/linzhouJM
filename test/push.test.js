// 推送管道专项测试：临时仓库+本地裸 remote，验证不切分支推 main、dev 同步、幂等、工作区不动
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim();
function eq(name, cond) { if (!cond) { console.error('✗ ' + name); process.exit(1); } console.log('✓ ' + name); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lzjm-push-').replace(/\\/g, '/'));
const remote = path.join(tmp, 'remote.git');
const work = path.join(tmp, 'work');

execFileSync('git', ['init', '--bare', remote], { encoding: 'utf8' });
execFileSync('git', ['init', '-b', 'dev', work], { encoding: 'utf8' });
git(work, 'config', 'user.email', 't@t.t'); git(work, 'config', 'user.name', 't');
fs.mkdirSync(path.join(work, 'content'), { recursive: true });
fs.writeFileSync(path.join(work, 'content', 'manifest.json'), '{"version":0,"entries":[]}\n');
fs.writeFileSync(path.join(work, 'code.js'), '// BASECODE\n');
git(work, 'add', '.'); git(work, 'commit', '-m', 'init');
git(work, 'remote', 'add', 'origin', remote.replace(/\\/g, '/'));
git(work, 'push', 'origin', 'dev');
git(work, 'push', 'origin', 'dev:refs/heads/main');

// 模拟：dev 上有未提交的代码改动 + bat 刚生成的新清单
fs.writeFileSync(path.join(work, 'code.js'), '// HALFEDIT-绝不能被推送牵连\n');
fs.writeFileSync(path.join(work, 'content', 'manifest.json'), '{"version":1,"entries":[{"title":"蒋默·档案"}]}\n');
const codeBefore = fs.readFileSync(path.join(work, 'code.js'), 'utf8');

const { push } = require(path.resolve(__dirname, '..', 'tools', 'push-manifest.js'));
const r1 = push(work, 1);
eq('首次推送返回 true', r1 === true);
eq('main 拿到新清单', git(work, 'show', 'origin/main:content/manifest.json').indexOf('蒋默·档案') !== -1);
eq('main 不带 dev 的代码改动', git(work, 'show', 'origin/main:code.js').indexOf('HALFEDIT') === -1 && git(work, 'show', 'origin/main:code.js').indexOf('BASECODE') !== -1);
eq('dev 也提交了同一清单', git(work, 'show', 'origin/dev:content/manifest.json').indexOf('蒋默·档案') !== -1);
eq('当前分支仍是 dev', git(work, 'rev-parse', '--abbrev-ref', 'HEAD') === 'dev');
eq('工作区代码改动原样保留', fs.readFileSync(path.join(work, 'code.js'), 'utf8') === codeBefore);
eq('工作区清单原样保留', fs.readFileSync(path.join(work, 'content', 'manifest.json'), 'utf8').indexOf('蒋默·档案') !== -1);
eq('清单在暂存区无残留', git(work, 'status', '--porcelain', '--', 'content/manifest.json') === '');

// 幂等：内容没变再推 → 不产生新提交
const headBefore = git(work, 'rev-parse', 'origin/main');
const r2 = push(work, 1);
eq('重复推送识别已最新', r2 === false && git(work, 'rev-parse', 'origin/main') === headBefore);

// 再涨一版 → main 再前进一格且历史连续（parent 是上一格）
fs.writeFileSync(path.join(work, 'content', 'manifest.json'), '{"version":2,"entries":[{"title":"蒋默·档案"},{"title":"霖州大学"}]}\n');
push(work, 2);
eq('v2 推送成功', git(work, 'show', 'origin/main:content/manifest.json').indexOf('霖州大学') !== -1);
eq('main 历史连续', git(work, 'rev-parse', 'origin/main^') === headBefore);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('PUSH-TEST ALL PASS');
