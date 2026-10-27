/** 浏览器诊断共用配置；支持环境变量、项目依赖以及当前工作环境。 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadPlaywright() {
  if (process.env.PLAYWRIGHT_MODULE) return import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
  try { return await import('playwright'); }
  catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  const bundled = path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
  if (fs.existsSync(bundled)) return import(pathToFileURL(bundled).href);
  throw new Error('浏览器验收需要 Playwright。执行 npm install --no-save --package-lock=false playwright，或设置 PLAYWRIGHT_MODULE。游戏本身无需安装依赖。');
}

export function browserExecutable() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const bases = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  const candidates = process.platform === 'win32'
    ? bases.flatMap(base => [path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe')])
    : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find(file => fs.existsSync(file));
}

export const baseUrl = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
