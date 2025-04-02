import prompts from 'prompts';
import { rmSync, renameSync } from 'node:fs';
import path from 'path';


const projects = ['core', 'query-typeorm', 'query-graphql', ];
const targets = ['nestjs-query-core', 'nestjs-query-typeorm', 'nestjs-query-graphql', ]

async function run() {
  const { dir } = await prompts({
    type: 'text',
    name: 'dir',
    message: 'target folder?',
  });

  projects.forEach((p, i) => {
    const oldPath = path.resolve('dist/packages', p, 'src');
    const newPath = path.resolve(dir, 'node_modules/@rezonate', targets[i],);
    const newPathSrc = path.resolve(newPath, 'src');
    rmSync(newPathSrc, {recursive: true, force: true})
    renameSync(oldPath, newPathSrc);
  })
}

run();