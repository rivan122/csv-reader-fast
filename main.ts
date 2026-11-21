// The harness runs `node /bot/main.ts` (node22): it reads every case from /input/cases.json, answers
// each one with run() from solve.js, and writes /output/answers.json. Outside a container
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.

import { readFileSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(INPUT_DIR + '/cases.json', 'utf8'));
const answers = [];
for (let i = 0; i < cases.length; i++) answers.push(run(cases[i].input));
writeFileSync(OUTPUT_DIR + '/answers.json', JSON.stringify(answers));
