// Picker — the level sheet: one fold per act, one cell per level.
//
// Grouped by act because the run is grouped by act: an act shares a palette and a
// board mix, so what a player is being asked to do changes at those seams and nowhere
// else. Everything here touches the DOM; the run and the progress store are handed in.

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const pad = (id) => String(id).padStart(2, '0');

/** What an act's summary chip says about where the player is in it. */
export function tallyLabel(tally) {
  return tally.complete
    ? `done · ${tally.earned}/${tally.possible}★`
    : `${tally.done}/${tally.total} · ${tally.earned}★`;
}

/** What a level cell's tooltip says. */
export function cellTitle(level, progress) {
  const head = `${pad(level.id)} — ${level.teaches}`;
  if (!progress.done(level.id)) return `${head} · not finished`;
  const left = progress.best(level.id);
  return `${head} · finished with ${left} swap${left === 1 ? '' : 's'} to spare (${progress.stars(level.id)}/3)`;
}

/**
 * Build the sheet.
 * @param {HTMLElement} root
 * @param {object} run - from loadRun().
 * @param {object} progress
 * @param {(level: object) => void} onPick
 * @returns {{repaint: Function, open: Function, close: Function, isOpen: Function}}
 */
export function mountPicker(root, run, progress, onPick) {
  const cells = new Map();
  const folds = [];
  let current = null;

  const sheet = el('div', 'sheet');
  sheet.hidden = true;
  const box = el('div', 'sheetbox');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Pick a level');

  const head = el('div', 'sheethead');
  head.append(el('span', null, 'Pick a level'));
  const close = el('button', 'x', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', 'close');
  head.append(close);
  box.append(head);

  const acts = el('div', 'acts');
  for (const act of run.acts) {
    const fold = el('details', 'act-group');
    fold.open = true;
    const summary = el('summary');
    summary.append(el('span', 'act-no', act.no));
    summary.append(el('span', 'act-name', act.name));
    const first = act.levels[0].id;
    const last = act.levels[act.levels.length - 1].id;
    summary.append(el('span', 'range', `${pad(first)}–${pad(last)}`));
    const chip = el('span', 'tally');
    summary.append(chip);
    fold.append(summary);

    const grid = el('div', 'lvlgrid');
    for (const spec of act.levels) {
      const level = run.levels.find((l) => l.id === spec.id);
      const cell = el('button', 'cell');
      cell.type = 'button';
      cell.append(el('span', 'no', pad(level.id)));
      cell.append(el('span', 'stars'));
      cell.addEventListener('click', () => {
        api.close();
        onPick(level);
      });
      grid.append(cell);
      cells.set(level.id, cell);
    }
    fold.append(grid);
    acts.append(fold);
    folds.push({ act, fold, chip });
  }
  box.append(acts);
  sheet.append(box);
  root.append(sheet);

  close.addEventListener('click', () => api.close());
  sheet.addEventListener('click', (event) => {
    if (event.target === sheet) api.close(); // the backdrop, not the box
  });

  const api = {
    /** Paint what the player has done. Called on open, so it is never stale. */
    repaint(currentId = current) {
      current = currentId;
      for (const level of run.levels) {
        const cell = cells.get(level.id);
        cell.className = `cell${progress.done(level.id) ? ' done' : ''}`;
        cell.setAttribute('aria-current', String(level.id === current));
        // Filled stars only: at this size a hollow star reads as a filled one, so the
        // count has to be legible by length rather than by shape.
        cell.querySelector('.stars').textContent = '★'.repeat(progress.stars(level.id));
        cell.title = cellTitle(level, progress);
      }
      for (const { act, fold, chip } of folds) {
        const tally = progress.tally(act.levels);
        chip.textContent = tallyLabel(tally);
        fold.classList.toggle('finished', tally.complete);
      }
    },
    open() {
      api.repaint();
      sheet.hidden = false;
    },
    close() {
      sheet.hidden = true;
    },
    isOpen: () => !sheet.hidden,
  };
  return api;
}
