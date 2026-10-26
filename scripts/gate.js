#!/usr/bin/env node
// 门禁真身。本文件不在 fullstack-cli 模板的托管清单里——历次 `chore(upgrade): auto-upgrade by fullstack-cli`
// 只整文件覆盖 scripts/lint.js 与 scripts/hooks/run-precommit.js，所以 .githooks/pre-commit 直接调这里，
// 升级再也不会把门禁冲成静默失效（详见知识库《平台自动修改记录/010》）。
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const cwd = process.cwd();
const SEP = '  ' + '─'.repeat(36);

const STYLELINT_CONFIG_FILES = [
  '.stylelintrc',
  '.stylelintrc.js',
  '.stylelintrc.cjs',
  '.stylelintrc.json',
  'stylelint.config.js',
];

// Node 官方安装与 nvm 把 npm 放在 <node 目录>/node_modules/npm，Homebrew 放在 <prefix>/lib/node_modules/npm；
// 两种布局都优先找 npm-cli.js，用 node 直接执行它，绕开 Windows 的 npm.cmd（shell:false 下 spawn .cmd 报 EINVAL）。
function resolveNpmCli() {
  const nodeDir = path.dirname(process.execPath);
  const candidates = [
    path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  return candidates.find((file) => fs.existsSync(file)) || null;
}

const npmCli = resolveNpmCli();

function failAndExit(step, body) {
  process.stderr.write('\n✗ pre-commit failed: ' + step + '\n');
  process.stderr.write(SEP + '\n');
  if (body && body.length > 0) {
    process.stderr.write(body.replace(/\s+$/, '') + '\n');
  }
  process.stderr.write(SEP + '\n');
  process.stderr.write(
    '  bypass（仅限紧急场景，风险自担，详见 AGENTS.md 开发约定）: git commit --no-verify\n',
  );
  process.exit(1);
}

function runStep(title, args) {
  if (!npmCli) {
    failAndExit(
      title,
      '找不到 npm-cli.js，无法在不经 shell 的情况下启动 npm。\n' +
        '请确认 Node 由官方安装包或 nvm/Homebrew 提供，或手工执行 npm run eslint / type:check / stylelint / test。',
    );
  }

  const res = spawnSync(process.execPath, [npmCli, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  if (res.error) {
    failAndExit(title, String(res.error.message || res.error));
  }
  if (res.status !== 0) {
    const stdout = res.stdout ? res.stdout.toString() : '';
    const stderr = res.stderr ? res.stderr.toString() : '';
    failAndExit(title, stdout + '\n' + stderr);
  }
  console.log('[gate] PASS ' + title);
}

function canRunStylelint() {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return false;
  }
  if (!pkg.scripts || !pkg.scripts.stylelint) return false;
  return STYLELINT_CONFIG_FILES.some((file) => fs.existsSync(path.join(cwd, file)));
}

// 串行、遇红即停：任一步失败立刻退出，test 不再执行。
runStep('eslint', ['run', 'eslint']);
runStep('type:check:server', ['run', 'type:check:server']);
runStep('type:check:client', ['run', 'type:check:client']);
if (canRunStylelint()) {
  runStep('stylelint', ['run', 'stylelint']);
} else {
  console.warn('[gate] SKIP stylelint: missing scripts.stylelint or stylelint config');
}
runStep('test', ['run', 'test', '--', '--silent']);
