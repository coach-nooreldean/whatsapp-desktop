/*
 * Font catalogue queries and face selection using fontconfig (fc-list, fc-match).
 */
'use strict';

const { execFileSync } = require('child_process');

/*
 * The catalogue, asked of fontconfig once per process.
 *
 * It has to be asked with FONTCONFIG_FILE taken back OUT of the environment.
 * By the time anything here runs, that variable points at this client's own
 * config -- the one whose whole purpose is to rename Roboto to something else
 * and to answer every generic with one family. A catalogue read through it
 * would be a list of the client's own opinions rather than of what is
 * installed, and `fc-match :lang=ar` through it would answer with whatever the
 * config had already chosen. So every fc-* call below is made against the
 * system configuration, which is what the settings window is really asking
 * about.
 *
 * A missing fc-list is not an error worth stopping for: the lists come back
 * empty, the settings window shows the family the client is already using and
 * nothing else, and every other mechanism here carries on. That is the
 * difference between a font picker that is unavailable and a client that does
 * not start.
 */
const fc = (tool, args) => {
  const env = { ...process.env };
  delete env.FONTCONFIG_FILE;
  try {
    return execFileSync(tool, args, {
      encoding: 'utf8',
      timeout: 8000,
      maxBuffer: 32 * 1024 * 1024,
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return '';
  }
};

/* fontconfig's own numbers: FC_WEIGHT_REGULAR is 80 and FC_WEIGHT_BOLD is 200,
   FC_SLANT_ROMAN is 0 and italic and oblique are 100 and 110, and a width of
   100 is the normal one. They are not CSS numbers and there is no point
   pretending they are -- everything below compares them as fontconfig means
   them and only the answers come out in CSS. */
const REGULAR = 80;
const BOLD = 200;
const ROMAN = 0;
const ITALIC = 100;
const NORMAL_WIDTH = 100;

/* Enough of a face to choose between faces and to name one in `local()`. A
   variable font lists its weight as a range -- "[80 200]" -- with no full name
   at all, and there is no way to ask `local()` for one instance of it, so those
   rows are counted for the family's existence and skipped for everything else. */
const FIELDS = '%{family[0]}\\t%{weight}\\t%{slant}\\t%{width}\\t%{fullname[0]}\\t%{postscriptname}\\n';

const number = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

let catalogue = null;

const scan = () => {
  if (catalogue) return catalogue;

  const faces = new Map();
  for (const line of fc('fc-list', ['-f', FIELDS]).split('\n')) {
    if (!line) continue;
    const [family, weight, slant, width, full, ps] = line.split('\t');
    if (!family) continue;
    if (!faces.has(family)) faces.set(family, []);
    const w = number(weight);
    if (w === null || !(full || ps)) continue;   /* a variable font's own row */
    faces.get(family).push({
      weight: w,
      slant: number(slant) === null ? ROMAN : number(slant),
      width: number(width) === null ? NORMAL_WIDTH : number(width),
      names: [full, ps].filter(Boolean),
    });
  }

  const speaking = lang => new Set(
    fc('fc-list', ['-f', '%{family[0]}\\n', `:lang=${lang}`])
      .split('\n').map(name => name.trim()).filter(Boolean));

  catalogue = { faces, latin: speaking('en'), arabic: speaking('ar') };
  return catalogue;
};

/*
 * Which face of a family to name, for a given weight and slant.
 *
 * There is no CSS that makes a script bold on its own -- `font-weight` is a
 * property and properties cannot be scoped to a writing system -- so "bold
 * Arabic" is not a declaration, it is a different FILE: the family's own bold
 * face, named in `local()` on the @font-face that covers the Arabic range. A
 * family that ships no bold face therefore cannot be made bold at all, and the
 * settings window is told so rather than offering a switch that does nothing.
 * Chromium will not synthesise it either: it fakes bold when the page asks for
 * a weight the family has no face for, and the page here is asking for 400.
 *
 * The width test is what keeps "DejaVu Sans Bold" from coming out as "DejaVu
 * Sans Condensed Bold" -- fontconfig files both under the family name "DejaVu
 * Sans", and the condensed one is a different width of it.
 */
const pick = (family, { bold, italic }) => {
  const faces = scan().faces.get(family) || [];
  if (!faces.length) return { names: [], bold: false, italic: false };

  const wantWeight = bold ? BOLD : REGULAR;
  const wantSlant = italic ? ITALIC : ROMAN;
  const cost = face => Math.abs(face.weight - wantWeight) +
                       Math.abs(face.slant - wantSlant) * 2 +
                       (face.width === NORMAL_WIDTH ? 0 : 40) +
                       (face.names[0] || '').length / 1000;

  const best = faces.slice().sort((a, b) => cost(a) - cost(b))[0];
  return {
    names: best.names,
    /* Whether the face found is the face asked for, which is not the same
       question as whether one was found: the fallback is the regular. */
    bold: best.weight >= (REGULAR + BOLD) / 2,
    italic: best.slant >= ITALIC,
  };
};

/* What the settings window draws its two dropdowns from: the families that can
   draw each script, and whether each of them has a bold and an italic face to
   name. Sorted the way a list of names should be sorted, and deduplicated --
   fontconfig lists one row per face and a family has several. */
const installed = () => {
  const { faces, latin, arabic } = scan();
  const describe = names => [...names]
    .filter(name => faces.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({
      name,
      bold: pick(name, { bold: true, italic: false }).bold,
      italic: pick(name, { bold: false, italic: true }).italic,
    }));
  return { latin: describe(latin), arabic: describe(arabic) };
};

/* The family the system itself would draw a script in, for the case where a
   size or a weight is asked for a script but no family is: without a family to
   name there is no @font-face to hang the size on, and the knob would silently
   do nothing. */
const defaultFor = lang => {
  const answer = fc('fc-match', ['-f', '%{family[0]}', `:lang=${lang}`]).trim();
  return answer || '';
};

module.exports = {
  fc,
  scan,
  pick,
  installed,
  defaultFor,
  REGULAR,
  BOLD,
  ROMAN,
  ITALIC,
  NORMAL_WIDTH,
};
