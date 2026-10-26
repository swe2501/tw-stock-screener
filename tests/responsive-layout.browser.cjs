const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const web = path.resolve(__dirname, '../apps/web');
const output = process.env.RWD_OUTPUT || path.join(os.tmpdir(), 'codex-rwd-qa');
const chartLibrary = process.env.CHART_LIBRARY_PATH;
const chartData = process.env.RWD_CHART_DATA;
if (!chartLibrary || !chartData) throw Error('Set CHART_LIBRARY_PATH and RWD_CHART_DATA to local read-only fixtures');
fs.mkdirSync(output, { recursive: true });

async function inspect(page, label) {
  const metrics = await page.evaluate(() => {
    const width = innerWidth;
    const overflow = [...document.querySelectorAll('body *')].filter(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') return false;
      if (rect.right <= width + 1 && rect.left >= -1) return false;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(parent).overflowX)) return false;
      }
      return true;
    }).map(element => ({ element: element.tagName + '#' + element.id + '.' + String(element.className), right: Math.round(element.getBoundingClientRect().right) }));
    return { width, scrollWidth: document.documentElement.scrollWidth, overflow };
  });
  console.log(label, JSON.stringify(metrics));
  await page.screenshot({ path: path.join(output, label + '.png'), fullPage: false });
  return metrics;
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const reports = [];
  try {
    for (const width of [375, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce', hasTouch: width < 1000 });
      await page.addInitScript(() => {
        localStorage.setItem('sb_token', 'fixture');
        localStorage.setItem('sb_user', JSON.stringify({ id: 'fx', email: 'swe250165@gmail.com' }));
      });
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'unpkg.com' && url.pathname.includes('lightweight-charts')) return route.fulfill({ path: chartLibrary, contentType: 'text/javascript' });
        if (url.pathname === '/api/chart') return route.fulfill({ path: chartData, contentType: 'application/json' });
        if (url.pathname === '/api/auth') return route.fulfill({ json: { enabled: false } });
        if (url.pathname === '/auth/v1/user') return route.fulfill({ json: { id: 'fx', email: 'swe250165@gmail.com' } });
        if (url.origin === 'https://rwd.fixture.test') {
          const file = path.resolve(web, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
          if (file.startsWith(web + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return route.fulfill({ path: file });
        }
        return route.fulfill({ json: [] });
      });
      await page.goto('https://rwd.fixture.test/');
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(700);
      if (width <= 900) {
        const headerBox = await page.locator('body > header').first().boundingBox();
        const navBox = await page.locator('#mainNav').boundingBox();
        assert(navBox.y >= headerBox.y + headerBox.height - 1 && navBox.y <= headerBox.y + headerBox.height + 24, 'mobile navigation follows header without offset or overlap');
      }
      reports.push(await inspect(page, width + '-home'));
      const group = page.locator('#mainNav .mn-grp').filter({ has: page.locator('.mn-menu') }).first();
      await group.locator('.mn-item').first().click();
      await group.hover();
      const menu = group.locator('.mn-menu');
      await menu.waitFor({ state: 'visible' });
      const box = await menu.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1, 'navigation dropdown fits viewport');
      await menu.locator('a').first().click();
      await page.waitForTimeout(200);
      reports.push(await inspect(page, width + '-navigation'));
      await page.evaluate(() => _showView('screen'));
      await page.waitForTimeout(200);
      reports.push(await inspect(page, width + '-screen'));
      await page.locator('.sc-panel[data-cat="shape"] .sc-hd a').click();
      await page.locator('#no_black_years').fill('24');
      assert.equal(await page.locator('#no_black_years').inputValue(), '24');
      reports.push(await inspect(page, width + '-form'));
      await page.evaluate(() => _showView('greed'));
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        document.getElementById('gdBody').innerHTML = '<tr><td>測試行情名稱與較長欄位內容</td><td>12345.67</td><td>12345.67</td><td>12345.67</td><td>12345.67</td><td>12345.67</td></tr>';
      });
      const tableScroll = await page.locator('#greedView .gd-scroll').evaluate(element => {
        element.scrollLeft = element.scrollWidth;
        return { width: element.clientWidth, content: element.scrollWidth, moved: element.scrollLeft };
      });
      assert(tableScroll.content <= tableScroll.width || tableScroll.moved > 0, 'wide table can scroll to last column');
      reports.push(await inspect(page, width + '-table'));
      await page.evaluate(() => openChart('1236', '宏亞', ''));
      await page.waitForFunction(() => window.AcademyChartBridge?.get().candles?.length > 100);
      await page.waitForTimeout(500);
      reports.push(await inspect(page, width + '-chart'));
      const close = page.locator('#chartModal .modal-close');
      await close.click();
      await page.waitForFunction(() => !document.getElementById('chartModal').classList.contains('open'));
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
    assert(reports.every(report => report.scrollWidth <= report.width + 1 && !report.overflow.length), 'visible content stays within viewport or a local scroll container');
    console.log('PASS: 375 / 768 / 1440px, navigation dropdown selection, form input, table scrolling, real chart rendering and close. Screenshots: ' + output);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
