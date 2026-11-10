"""Check the isometric office preview in Chromium without business services."""
import argparse
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:5173')
    parser.add_argument('--output', default='.local/office2d-check')
    args = parser.parse_args()
    if urlparse(args.url).hostname not in {'127.0.0.1', 'localhost'}:
        raise ValueError('Only localhost is supported')
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1600, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.url + '/scripts/assets/preview.html')
        page.wait_for_function("!document.querySelector('.room-controls button').disabled", timeout=60000)
        page.keyboard.press('Tab')
        page.get_by_role('dialog', name='Papan tugas').wait_for()
        page.keyboard.press('Tab')
        assert page.locator('.office-drawer').evaluate('(drawer) => drawer.contains(document.activeElement)')
        page.keyboard.press('Escape')
        assert page.get_by_role('dialog', name='Papan tugas').count() == 0
        page.reload()
        page.wait_for_function("!document.querySelector('.room-controls button').disabled", timeout=60000)
        page.get_by_text('Tim & tampilan', exact=True).click()
        page.get_by_role('button', name='Profil Pemilik', exact=True).click()
        page.get_by_role('button', name='Ambil kopi', exact=True).click()
        page.get_by_text('Menikmati kopi', exact=True).first.wait_for(timeout=45000)
        page.get_by_role('button', name='Duduk di lounge', exact=True).click()
        page.get_by_text('Beristirahat di lounge', exact=True).first.wait_for(timeout=45000)
        page.get_by_role('button', name='Tutup panel', exact=True).click()
        page.get_by_text('Kontrol kantor', exact=True).click()
        page.get_by_role('button', name='Aktifkan mode tenang', exact=True).click()
        page.screenshot(path=str(output / 'office2d.png'))
        page.get_by_role('button', name='Lanjutkan animasi', exact=True).click()
        page.get_by_role('button', name='Profil Pemilik', exact=True).click()
        page.get_by_role('button', name='Kembali ke ruang pemilik', exact=True).click()
        page.get_by_text('Berada di ruang pemilik', exact=True).first.wait_for(timeout=45000)
        page.get_by_role('button', name='Tutup panel', exact=True).click()
        page.get_by_role('button', name='Aktifkan mode tenang', exact=True).click()
        page.get_by_role('button', name='Profil Administrasi', exact=True).click()
        page.get_by_role('heading', name='Administrasi', exact=True).wait_for()
        page.get_by_text('Animasi karakter', exact=True).click()
        before = page.locator('.office-canvas canvas').evaluate('(canvas) => canvas.toDataURL()')
        page.get_by_role('button', name='Berjalan di tempat', exact=True).click()
        assert page.get_by_role('button', name='Berjalan di tempat', exact=True).get_attribute('aria-pressed') == 'true'
        page.wait_for_timeout(150)
        assert page.locator('.office-canvas canvas').evaluate('(canvas) => canvas.toDataURL()') != before
        page.get_by_role('button', name='Bekerja', exact=True).click()
        assert page.get_by_role('button', name='Bekerja', exact=True).get_attribute('aria-pressed') == 'true'
        page.get_by_role('button', name='Fokus ke ruangan', exact=True).click()
        page.get_by_role('button', name='Tutup panel', exact=True).click()
        page.get_by_role('button', name='Reset kamera', exact=True).click()
        page.route('**/assets/office2d/owner-work.png*', lambda route: route.fulfill(status=404, body='missing'))
        page.reload()
        page.get_by_role('button', name='Muat ulang kanvas visual', exact=True).wait_for(timeout=60000)
        page.unroute('**/assets/office2d/owner-work.png*')
        page.get_by_role('button', name='Muat ulang kanvas visual', exact=True).click()
        page.wait_for_function("!document.querySelector('.room-controls button').disabled", timeout=60000)
        page.evaluate("""async () => {
          const { OfficeSceneManager } = await import('/src/office3d/scene-manager-2d.ts');
          const container = document.createElement('div');
          container.style.cssText = 'width:320px;height:240px;position:absolute;left:-1000px';
          document.body.append(container);
          const events = [];
          const manager = new OfficeSceneManager(container, {
            onSelect() {}, onMetrics() {}, onActivity(activity, moving) { events.push({ activity, moving }); },
            onStatus() {}, onError(message) { throw new Error(message); }
          });
          const check = (condition, message) => { if (!condition) throw new Error(message); };
          try {
            manager.setQuiet(true);
            manager.setQuality(true);
            manager.setDaylight(true);
            await manager.ready;
            manager.setQuiet(false);
            check(manager.visit('lounge'), 'Lounge visit rejected');
            for (let i = 0; i < 1000 && (manager.pending || manager.seating); i++) manager.update(0.1);
            check(manager.destination === 'lounge' && !manager.pending && !manager.seating, 'Lounge visit did not finish');
            check(manager.owner[0] === 640 && manager.owner[1] === 755, 'Walking endpoint changed');
            check(manager.ownerVisual[0] === 540 && manager.ownerVisual[1] === 800, 'Owner is not seated on sofa');
            check(events.at(-1)?.moving === false, 'Arrival was reported before seating');
            check(manager.visit('office'), 'Return visit rejected');
            check(manager.seating && !manager.seating.entering, 'Leaving sofa transition missing');
            for (let i = 0; i < 1000 && (manager.pending || manager.seating); i++) manager.update(0.1);
            check(manager.destination === 'office' && manager.ownerVisual[0] === 490 && manager.ownerVisual[1] === 310, 'Return to office failed');

            container.style.width = '1536px'; container.style.height = '1024px';
            manager.resize(); manager.resetView(); manager.setQuiet(true); manager.setDaylight(true);
            const reference = document.createElement('canvas'); reference.width = 1536; reference.height = 1024;
            const referenceContext = reference.getContext('2d');
            referenceContext.drawImage(manager.images.get('map'), 0, 0);
            const samePixel = (x, y) => {
              const actual = manager.context.getImageData(x, y, 1, 1).data;
              const expected = referenceContext.getImageData(x, y, 1, 1).data;
              return actual.every((value, index) => value === expected[index]);
            };
            for (let frame = 0; frame < 4; frame++) {
              manager.elapsed = (frame + 0.1) / 3; manager.render();
              for (const [x, y] of [[955, 470], [615, 600], [785, 600]]) {
                check(samePixel(x, y), 'Chair back does not cover the seated character');
              }
            }
            for (const name of ['hermes', 'admin', 'communication']) {
              const sheet = manager.images.get(`${name}-work`);
              const sample = document.createElement('canvas'); sample.width = sheet.width; sample.height = sheet.height;
              const sampleContext = sample.getContext('2d'); sampleContext.drawImage(sheet, 0, 0);
              const width = sheet.width / 4;
              for (let frame = 0; frame < 4; frame++) {
                const pixels = sampleContext.getImageData(frame * width, 0, width, sheet.height).data;
                let top = sheet.height, count = 0, sum = 0;
                for (let y = 0; y < sheet.height; y++) for (let x = 0; x < width; x++) {
                  if (pixels[(y * width + x) * 4 + 3] > 200) { top = Math.min(top, y); }
                }
                for (let y = top; y < Math.min(top + 100, sheet.height); y++) for (let x = 0; x < width; x++) {
                  if (pixels[(y * width + x) * 4 + 3] > 200) { sum += x; count++; }
                }
                check(count > 1000 && Math.abs(sum / count - width / 2) < width * 0.08,
                  `${name}: head is missing or not centered in frame ${frame}`);
              }
            }
            manager.setStaffPose('admin', 'idle'); manager.render();
            let visible = false;
            for (let y = 585; y < 610 && !visible; y++) for (let x = 595; x < 635 && !visible; x++) visible = !samePixel(x, y);
            check(visible, 'Chair back incorrectly covers a standing character');
          } finally { manager.dispose(); container.remove(); }
        }""")
        assert not errors, errors
        print('Office load, routes, sofa transition, quiet mode, panels, focus, and retry passed')
        browser.close()


if __name__ == '__main__':
    main()
