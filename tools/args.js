// A flag parser for the measurement tools. Long flags only, no clustering, no
// abbreviations — enough for `--colors 4 6 8` and `--trials 300`, and nothing else.
//
// Boundary code: an unknown flag or an unparseable number is a typo in a command
// somebody is about to trust the output of, so it stops rather than defaulting.

/**
 * @param {string[]} argv
 * @param {Object<string, {type: 'number'|'numbers'|'string'|'strings'|'flag', default: *}>} spec
 * @returns {object} the parsed values, one key per spec entry.
 */
export function parseArgs(argv, spec) {
  const out = Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, v.default]));
  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    const field = spec[name];
    if (!field) throw new Error(`unknown flag: ${token}`);
    i += 1;
    if (field.type === 'flag') {
      out[name] = true;
      continue;
    }
    const values = [];
    while (i < argv.length && !argv[i].startsWith('--')) values.push(argv[i++]);
    if (!values.length) throw new Error(`${token} needs a value`);
    if (field.type === 'numbers') out[name] = values.map(toNumber(token));
    else if (field.type === 'number') out[name] = toNumber(token)(values[0]);
    else if (field.type === 'strings') out[name] = values;
    else [out[name]] = values;
  }
  return out;
}

const toNumber = (flag) => (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${flag} wants a number, got "${raw}"`);
  return n;
};
