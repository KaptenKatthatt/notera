import { _electron as electron } from 'playwright';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = '/root/code/notera';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notera-abc-'));
const app = await electron.launch({ args: [root], env: { ...process.env, NOTERA_USER_DATA: path.join(tmp, 'userdata'), NOTERA_TEST: '1' } });
const win = await app.firstWindow();
await win.waitForFunction(() => window.__notera && window.__notera.tabs.length > 0);
const doc = () => win.evaluate(() => window.__notera.view.state.doc.toString());
const focus = () => win.evaluate(() => (document.activeElement ? document.activeElement.className : 'none'));

await win.keyboard.type('# Todo\n\n- [ ] Oklar\n- [x] Klar\n');
console.log('1 doc:', JSON.stringify(await doc()));

await win.evaluate(() => window.notera.setSettings({ viewMode: 'split' }));
await win.waitForSelector('#preview input[type="checkbox"]');
console.log('2 boxes:', await win.locator('#preview input[type="checkbox"]').count());

await win.locator('#preview input[type="checkbox"]').nth(0).click();
await win.waitForFunction(() => window.__notera.view.state.doc.toString().includes('- [x] Oklar'));
console.log('3 doc efter klick:', JSON.stringify(await doc()), '| fokus:', await focus());

await win.evaluate(() => {
  const v = window.__notera.view;
  v.dispatch({ changes: { from: v.state.doc.length, insert: '\nSista ordet' } });
  const to = v.state.doc.length;
  v.dispatch({ selection: { anchor: to - 5, head: to } });
  v.focus();
});
console.log('4 doc:', JSON.stringify(await doc()), '| fokus:', await focus());

await win.keyboard.press('(');
console.log('5 doc:', JSON.stringify(await doc()));
await app.close();
