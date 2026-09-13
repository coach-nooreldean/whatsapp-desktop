/*
 * Which of two versions is the newer one.
 *
 * The whole of the update check that can be tested without the internet, and
 * the half that has anything to get wrong: a tag comes off a GitHub release as
 * text, in whatever shape a release was tagged in, and the answer decides
 * whether a user is told there is something to install. Being wrong in one
 * direction nags somebody who is already up to date; in the other it keeps
 * quiet about a release that is out.
 */
'use strict';

const { compare, isNewer, parse } = require('../src/update.js');

let failures = 0;
const check = (label, got, want) => {
  if (got === want) { console.log('  ok   ' + label); return; }
  failures++;
  console.log('  FAIL ' + label +
              '\n         got  ' + JSON.stringify(got) +
              '\n         want ' + JSON.stringify(want));
};

/* --------------------------------------------------------------- the tags */

for (const [scenario, tag, want] of [
  ['a tag with leading v is parsed to semantic version', 'v1.6.6', '1.6.6'],
  ['a tag without leading v is normalized to semantic version', '1.6.6', '1.6.6'],
  ['a missing minor/patch part counts as zero', '1.7', '1.7.0'],
  ['an empty tag string normalizes to 0.0.0', '', '0.0.0'],
]) {
  check(scenario, parse(tag).parts.join('.'), want);
}

/* ------------------------------------------------------------ the answers */

/* A client ahead of the latest release (e.g. checkout build) must never be told to go back.
   String order would read 1.10.0 as older than 1.9.9, so semantic comparison is required. */
for (const [scenario, latest, current, want] of [
  ['the release tag after this one is newer', 'v1.6.7', '1.6.6', true],
  ['the running version itself is not newer', 'v1.6.6', '1.6.6', false],
  ['a running version ahead of the latest release is not considered newer', 'v1.6.6', '1.7.0', false],
  ['minor version ten is recognized as newer than nine', 'v1.10.0', '1.9.9', true],
  ['a major version bump is recognized as newer than higher minor/patch', 'v2.0.0', '1.99.99', true],
  ['a pre-release candidate is newer than the previous stable version', '1.6.7-rc1', '1.6.6', true],
  ['a package revision suffix is not considered a newer version', '1.6.6-1', '1.6.6', false],
]) {
  check(scenario, isNewer(latest, current), want);
}

/* A release candidate is not the release. Nobody is told to install one. */
check('a pre-release is older than the version it waits for',
      compare('1.6.7-rc1', '1.6.7'), -1);

console.log(failures ? `\n${failures} failed` : '\nupdate checks pass');
process.exit(failures ? 1 : 0);
