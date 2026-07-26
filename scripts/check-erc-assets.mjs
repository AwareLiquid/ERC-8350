#!/usr/bin/env node
// Guards the ERC assets copy against drift.
//
// EIP-1 requires test cases to live under `assets/erc-<N>/` and be referenced with a
// relative link, so the vector is necessarily duplicated out of `test-vectors/`. That
// duplication is the whole risk: a stale copy would ship a spec whose published vector
// disagrees with the one every implementation is tested against.

import {readFileSync} from 'node:fs';

const PAIRS = [['test-vectors/v1.json', 'erc/assets/erc-8337/test-vectors-v1.json']];

let failed = false;

for (const [source, copy] of PAIRS) {
  let a, b;
  try {
    a = readFileSync(source, 'utf8');
  } catch (error) {
    console.error(`missing source: ${source} (${error.code})`);
    failed = true;
    continue;
  }
  try {
    b = readFileSync(copy, 'utf8');
  } catch (error) {
    console.error(`missing assets copy: ${copy} (${error.code})`);
    console.error(`  fix: cp ${source} ${copy}`);
    failed = true;
    continue;
  }
  if (a !== b) {
    console.error(`assets copy has drifted: ${copy}`);
    console.error(`  fix: cp ${source} ${copy}`);
    failed = true;
    continue;
  }
  console.log(`in sync: ${copy}`);
}

process.exit(failed ? 1 : 0);
