/* Wake 데스크톱 실행: cd apps/wake && npx -y electron@44.7.2 . */
const path = require('node:path');
const { start } = require('../../kit/desktop/index.cjs');
start(require('./desktop.config.cjs'), { appRoot: __dirname, repoRoot: path.resolve(__dirname, '../..') });
