#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  deploy-admin.sh — انتشار کنسول مدیریت روی Cloudflare Pages
#
#  چرا Pages و نه Worker؟
#    کنسول یک SPA استاتیک است و Pages برای همین ساخته شده: آپلود سریع،
#    دامنهٔ اختصاصی با گواهی خودکار و هدرهای امنیتی از فایل `_headers`.
#
#  پیش‌نیاز: wrangler لاگین باشد (`npx wrangler whoami`)
#
#  استفاده:
#    bash scripts/deploy-admin.sh
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PROJECT="${PAGES_PROJECT:-llwa-admin}"
BRANCH="${PAGES_BRANCH:-master}"

echo "▶ ۱/۳  بیلد کنسول مدیریت …"
npm run build -w @llwa/admin

if [ ! -f apps/admin/dist/index.html ]; then
  echo "✖ بیلد تولید نشد — apps/admin/dist/index.html وجود ندارد."
  exit 1
fi

echo "▶ ۲/۳  بررسی اتصال به Cloudflare …"
npx wrangler whoami >/dev/null

echo "▶ ۳/۳  آپلود روی پروژهٔ '$PROJECT' …"
npx wrangler pages deploy apps/admin/dist \
  --project-name="$PROJECT" \
  --branch="$BRANCH" \
  --commit-dirty=true

echo
echo "✓ انتشار کامل شد."
echo "  دامنهٔ Pages:      https://${PROJECT}.pages.dev"
echo "  دامنهٔ اختصاصی:    https://admin.infolange.ir"
