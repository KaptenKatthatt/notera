// updateToast.js: the small card that offers a new version, shows the download and asks to restart.
// The state comes from the main process (src/main/updater.js) through api.onUpdateStatus.

/**
 * @param {{ api: any, t: () => (key: string, vars?: object) => string }} ctx
 */
export function createUpdateToast(ctx) {
  const $ = (sel) => document.querySelector(sel);
  const { api } = ctx;
  let update = { state: 'idle' };
  let hidden = false;

  function render() {
    const box = $('#update-toast');
    if (!box) return;
    const t = ctx.t();
    const st = update.state;
    const visible = !hidden && ['available', 'downloading', 'downloaded', 'error'].includes(st);
    box.hidden = !visible;
    if (!visible) return;
    const go = $('#update-go'), later = $('#update-later'), bar = $('#update-bar');
    later.textContent = t('update.later');
    go.hidden = st === 'downloading';
    later.hidden = st === 'downloading';
    bar.hidden = st !== 'downloading';
    bar.firstElementChild.style.width = `${update.percent || 0}%`;
    box.dataset.state = st;
    if (st === 'available') { $('#update-text').textContent = t('update.available', { version: update.version }); go.textContent = t('update.download'); }
    else if (st === 'downloading') { $('#update-text').textContent = t('update.downloading', { version: update.version, percent: update.percent || 0 }); }
    else if (st === 'downloaded') { $('#update-text').textContent = t('update.ready', { version: update.version }); go.textContent = t('update.restart'); }
    else if (st === 'error') { $('#update-text').textContent = t('update.downloadError'); go.textContent = t('update.download'); }
  }

  function onStatus(next) {
    if (next.state !== update.state) hidden = false;
    update = next;
    render();
  }

  async function go() {
    if (update.state === 'available' || update.state === 'error') await api.downloadUpdate();
    else if (update.state === 'downloaded') await api.installUpdate();
  }

  async function later() {
    if (update.state === 'available') await api.dismissUpdate();
    hidden = true;
    render();
  }

  $('#update-go').addEventListener('click', () => void go());
  $('#update-later').addEventListener('click', () => void later());
  api.onUpdateStatus(onStatus);

  return { render, onStatus, get state() { return update; } };
}
