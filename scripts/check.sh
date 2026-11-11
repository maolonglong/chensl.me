#!/usr/bin/env bash
# E2E check: build the fixture site and assert on the generated files.
# Usage: scripts/check.sh   (run through `mise run check` so the pinned Hugo is used)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
fixtures="$root/tests/fixtures/content"
out="$root/tmp/check/public"
log="$root/tmp/check/build.log"
report="$root/tmp/check/report.txt"
mkdir -p "$root/tmp/check"
: > "$report"

failures=0
pass() { echo "PASS  $1" | tee -a "$report"; }
fail() { echo "FAIL  $1" | tee -a "$report"; failures=$((failures + 1)); }
check() { if eval "$2"; then pass "$1"; else fail "$1"; fi; }

cd "$root"
# Fixture content plus the real AI News section, so the adapter under test is the shipped one.
site="$root/tmp/check/content"
rm -rf "$site" && cp -R "$fixtures" "$site" && cp -R "$root/content/news" "$site/news"
export HUGO_DATADIR="$root/tests/fixtures/data"
fixtures="$site"
hugo build --panicOnWarning --cleanDestinationDir -c "$fixtures" -d "$out" > "$log" 2>&1 \
  || { cat "$log"; fail "fixture site builds without warnings"; exit 1; }
pass "fixture site builds without warnings"

post="$out/blog/chinese-long/index.html"
code="$out/blog/code-sample/index.html"
feed="$out/index.xml"
html_files=$(find "$out" -name '*.html')

check "fixture output satisfies deployment constraints" "bash scripts/check-output.sh '$out'"
bad_output="$root/tmp/check/bad-output"
rm -rf "$bad_output" && mkdir -p "$bad_output"
check "deployment rejects an empty output directory" \
  "! bash scripts/check-output.sh '$bad_output' > '$root/tmp/check/empty-output.log' 2>&1 && grep -q 'missing home page' '$root/tmp/check/empty-output.log'"
printf '<h1>Test</h1><script>alert(1)</script>' > "$bad_output/index.html"
check "deployment rejects scripts in output" \
  "! bash scripts/check-output.sh '$bad_output' > '$root/tmp/check/script-output.log' 2>&1 && grep -q 'output contains a script' '$root/tmp/check/script-output.log'"
printf '<h1>Test</h1>' > "$bad_output/index.html"
mkdir -p "$bad_output/tags"
check "deployment rejects taxonomy output" \
  "! bash scripts/check-output.sh '$bad_output' > '$root/tmp/check/taxonomy-output.log' 2>&1 && grep -q 'output contains taxonomy pages' '$root/tmp/check/taxonomy-output.log'"

for f in $html_files; do
  n=$({ grep -o '<h1' "$f" || true; } | wc -l | tr -d ' ')
  [ "$n" -le 1 ] || fail "at most one <h1> in ${f#$out/} (found $n)"
done
pass "at most one <h1> per HTML page"
check "post page has exactly one <h1>" \
  "[ \$(grep -o '<h1' '$post' | wc -l) -eq 1 ]"

check "date rendered at build time in site time zone" \
  "grep -q '<time datetime=\"2026-11-01T09:30:00&#43;08:00\">2026-11-01</time>' '$post'"
check "CJK soft line break joined without space" \
  "grep -q '软换行测试第一行软换行测试第二行' '$post'"
check "CJK emphasis with escaped spaces renders <strong>" \
  "grep -q '<strong>“带引号的强调”</strong>' '$post'"
check "URL-relative link resolved to page permalink" \
  "grep -q 'href=\"/blog/code-sample/\"' '$post'"
check "standalone image becomes figure with caption" \
  "grep -q '<figcaption>图片说明文字</figcaption>' '$post'"
check "first image is eager with fetchpriority high and responsive srcset" \
  "grep -q 'loading=\"eager\" fetchpriority=\"high\"' '$post' && grep -q 'srcset=\"' '$post' && grep -q 'sizes=\"(max-width: 760px) calc(100vw - 40px), 720px\"' '$post'"

missing_size=$(grep -ho '<img [^>]*>' $html_files | grep -v 'width=' || true)
check "every local <img> has width and height" "[ -z \"\$missing_size\" ]"

check "section list pages expose a visible h1" \
  "grep -q '<h1>博客</h1>' '$out/blog/index.html' && grep -q '<h1>AI News</h1>' '$out/news/index.html'"
check "home recent-posts heading is h2" \
  "grep -q '<h2[^>]*>最近的文章</h2>' '$out/index.html'"
check "robots.txt advertises the sitemap" \
  "grep -q 'Sitemap: https://chensl.me/sitemap.xml' '$out/robots.txt'"
check "head links icons, manifest, theme-color, and default og:image" \
  "grep -q 'rel=\"icon\" href=\"/favicon.svg\"' '$out/index.html' && grep -q 'rel=\"manifest\" href=\"/site.webmanifest\"' '$out/index.html' && grep -q 'name=\"theme-color\" content=\"#01242e\"' '$out/index.html' && grep -q 'property=\"og:image\" content=\"https://chensl.me/android-chrome-512x512.png\"' '$out/index.html'"
check "CSS uses light-dark tokens" \
  "grep -q 'light-dark(' '$post'"

check "code blocks use Chroma classes" \
  "grep -q 'class=\"chroma\"' '$code' && grep -q 'class=\"c1\"' '$code'"
check "CSS contains no italic" \
  "! grep -q 'font-style:italic' '$post'"
check "home lists recent posts via shortcode" \
  "grep -q 'href=\"/blog/chinese-long/\"' '$out/index.html'"
check "blog list is newest first" \
  "[ \$(grep -n 'chinese-long' '$out/blog/index.html' | head -1 | cut -d: -f1) -lt \$(grep -n 'code-sample' '$out/blog/index.html' | head -1 | cut -d: -f1) ]"

check "RSS has exactly the two blog posts" \
  "[ \$(grep -c '<item>' '$feed') -eq 2 ]"
check "RSS excludes standalone pages" \
  "! grep -q '/now/' '$feed'"
check "RSS contains full content" \
  "grep -q '这句话必须出现在 RSS 中' '$feed'"
check "RSS image and link URLs are absolute" \
  "grep -q 'src=&#34;https://chensl.me/blog/chinese-long/photo.png&#34;' '$feed' && grep -q 'href=&#34;https://chensl.me/blog/code-sample/&#34;' '$feed'"

news="$out/news/2026-11-07/index.html"
news_feed="$out/news/index.xml"
for page in index.html blog/index.html blog/code-sample/index.html now/index.html news/index.html news/2026-11-07/index.html; do
  expected=/index.xml
  case "$page" in news/*) expected=/news/index.xml ;; esac
  check "correct RSS discovery and subscription in $page" \
    "grep -q '<link rel=\"alternate\" .*href=\"https://chensl.me$expected\"' '$out/$page' && grep -q '<a href=\"$expected\">RSS</a>' '$out/$page'"
done
check "news issue page exists at /news/<date>/" "[ -f '$news' ]"
check "news issue description comes from summary" \
  "grep -q '<meta name=\"description\" content=\"摘要 不是 HTML\">' '$news'"
check "news section description uses newsDescription" \
  "grep -q '<meta name=\"description\" content=\"每天 AI 圈发生了什么：模型、产品和工具的动态摘要\">' '$out/news/index.html'"
check "news alternate feed title uses newsTitle" \
  "grep -q 'href=\"https://chensl.me/news/index.xml\" title=\"~chensl AI News\"' '$out/news/index.html'"
check "news items grouped by tag in first-appearance order" \
  "[ \$(grep -n '<h2>OpenAI</h2>' '$news' | cut -d: -f1) -lt \$(grep -n '<h2>DeepSeek</h2>' '$news' | cut -d: -f1) ] && [ \$(grep -c '<h2>OpenAI</h2>' '$news') -eq 1 ]"
check "news text is escaped, not HTML" \
  "grep -q '摘要 &lt;b&gt;不是 HTML&lt;/b&gt;' '$news'"
check "news list is newest first" \
  "[ \$(grep -n '2026-11-08/' '$out/news/index.html' | head -1 | cut -d: -f1) -lt \$(grep -n '2026-11-07/' '$out/news/index.html' | head -1 | cut -d: -f1) ]"
check "news feed has issues with tag categories, article feed has none" \
  "[ \$(grep -c '<item>' '$news_feed') -eq 2 ] && grep -q '<category>DeepSeek</category>' '$news_feed' && ! grep -q '/news/' '$feed'"

bad_data="$root/tmp/check/bad-data"
rm -rf "$bad_data" && mkdir -p "$bad_data/news"
printf '{"date":"2026-01-01","title":"t","summary":"s","items":[{"title":"t","summary":"s","url":"javascript:alert(1)","tag":"X"}]}' > "$bad_data/news/2026-01-01.json"
check "news item with a non-http URL fails the build" \
  "! HUGO_DATADIR='$bad_data' hugo build -c '$site' -d '$root/tmp/check/bad-public' > /dev/null 2>&1"

for url in https:example.com/report https:///report https://:443/report; do
  printf '{"date":"2026-01-01","title":"t","summary":"s","items":[{"title":"t","summary":"s","url":"%s","tag":"X"}]}' "$url" > "$bad_data/news/2026-01-01.json"
  check "news URL without a hostname fails: $url" \
    "! HUGO_DATADIR='$bad_data' hugo build -c '$site' -d '$root/tmp/check/bad-public' > '$root/tmp/check/bad-url.log' 2>&1 && grep -q 'url must have a hostname' '$root/tmp/check/bad-url.log'"
done

# Negative case: a broken internal link must fail the build.
broken="$root/tmp/check/broken-content"
rm -rf "$broken" && cp -R "$fixtures" "$broken"
printf '\n[坏链接](../does-not-exist/)\n' >> "$broken/blog/code-sample/index.md"
check "broken internal link fails the build" \
  "! hugo build --panicOnWarning -c '$broken' -d '$root/tmp/check/broken-public' > /dev/null 2>&1"

echo "report: $report"
[ "$failures" -eq 0 ] || { echo "$failures check(s) failed"; exit 1; }
