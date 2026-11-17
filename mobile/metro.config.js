// Metro — پیکربندی برای مونوریپو.
//
// چرا؟
// ─────
// اپ موبایل خارج از npm workspaces است (تا نسخهٔ React و hoisting با وب
// تداخل نکند)، ولی باید فایل‌های ترجمهٔ مشترک را از `packages/shared`
// بخواند. Metro به‌طور پیش‌فرض فقط پوشهٔ پروژه را می‌بیند، پس آن پوشه را
// به watchFolders اضافه می‌کنیم و یک alias برای `@llwa/shared/*` می‌سازیم.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');
const sharedRoot = path.resolve(workspaceRoot, 'packages/shared/src');

const config = getDefaultConfig(projectRoot);

// فقط بخش لازم از مونوریپو دیده شود (نه کل ریشه — اسکن کامل کند است)
config.watchFolders = [sharedRoot];

// node_modules اپ اولویت دارد
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

// `@llwa/shared/locales` → packages/shared/src/locales
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@llwa/shared': sharedRoot,
};

// فایل‌های .ts در پکیج مشترک باید با babel پردازش شوند
config.resolver.sourceExts = Array.from(
  new Set([...(config.resolver.sourceExts ?? []), 'ts', 'tsx'])
);

module.exports = config;
