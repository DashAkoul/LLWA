#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  deploy-edge.sh — انتشار Worker بک‌اند روی Cloudflare
#
#  نکته‌های عملیاتی (تجربهٔ گران‌قیمت):
#    • دامنهٔ اختصاصی از `routes` با `custom_domain = true` ساخته می‌شود؛
#      Worker خودش رکورد DNS را می‌سازد. توکن OAuth نیازی به dns:write ندارد.
#    • اگر پشت پروکسی محلی هستید و آپلود script شکست خورد (`fetch failed`
#      یا `Proxy response (502)`)، `HTTPS_PROXY` را برای این دستور خالی کنید.
#    • رازها یک‌بار با `wrangler secret put` ست می‌شوند و در فایل نمی‌آیند.
#
#  استفاده:
#    bash scripts/deploy-edge.sh
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/workers/edge"

echo "▶ ۱/۴  بررسی نوع‌ها …"
npm run typecheck

echo "▶ ۲/۴  تست‌ها …"
npm test

echo "▶ ۳/۴  بیلد خشک (بدون انتشار) …"
npx wrangler deploy --dry-run --outdir=dist >/dev/null

echo "▶ ۴/۴  انتشار …"
npx wrangler deploy

echo
echo "✓ بک‌اند منتشر شد."
echo "  API:  https://api.infolange.ir"
echo
echo "یادآوری رازها (اگر تازه ساخته‌اید، یک‌بار اجرا کنید):"
echo "  npx wrangler secret put JWT_SECRET"
echo "  npx wrangler secret put SUPABASE_URL"
echo "  npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY"
echo "  npx wrangler secret put SUPABASE_ANON_KEY"
echo "  npx wrangler secret put GEMINI_API_KEY"
echo "  npx wrangler secret put PROVIDER_ENCRYPTION_KEY"
echo "  npx wrangler secret put ADMIN_PANEL_PASSWORD"
echo "  npx wrangler secret put GOOGLE_CLIENT_IDS"
