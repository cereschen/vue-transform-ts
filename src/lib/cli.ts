#!/usr/bin/env node

import * as yargs from 'yargs';
import path from 'path'
import { start } from '..';
const yarg = yargs.usage('Transform vue files to class ts vue files.\nUsage: vue2ts [options] <root directory>')
  .example('vue2ts src', 'The default output directory  is root directory name +"Ts"')
  .example('vue2ts src  dist', 'Output directory  is dist')
  .detectLocale(false)
  .demand(['_'])
  // .alias('o', 'out').describe('o', 'Output directory').string("o")
  .alias('h', 'help').help('h')
  .alias('V', 'version').version('V', require('../../package.json').version);

main();

async function main(): Promise<void> {
  const argv = yarg.argv;


  if (argv.h) {
    yarg.showHelp();
    return;
  }
  let rootPath: string = '';
  let outPath: string = '';
  if (argv._ && argv._[0]) {
    if (!path.isAbsolute(argv._[0])) {
      rootPath = path.join(process.cwd(), String(argv._[0]))
    } else {
      rootPath = String(argv._[0])
    }

    if (argv._[1]) {
      if (!path.isAbsolute(argv._[1])) {
        outPath = path.join(process.cwd(), String(argv._[1]))
      } else {
        outPath = String(argv._[1])
      }
    }
    start(rootPath, outPath)
  } else {
    yarg.showHelp();
    return;
  }

};
