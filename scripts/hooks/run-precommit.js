#!/usr/bin/env node
// FULLSTACK_PRECOMMIT_V1
'use strict';

// 门禁实现已挪到 scripts/gate.js（不在模板托管清单内），本文件只保留 `npm run precommit` 这个入口。
// 本文件仍会被 chore(upgrade) 整文件覆盖；覆盖后 .githooks/pre-commit 直接走 gate.js，提交门禁不受影响。
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const res = spawnSync(process.execPath, [path.join(__dirname, '..', 'gate.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
});

process.exit(res.status === null ? 1 : res.status);
