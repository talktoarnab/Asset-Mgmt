#!/usr/bin/env node
/**
 * Bundles the API Lambda into artifacts/api/index.mjs.
 * Terraform's archive_file data source zips this directory (see infra/lambda_api.tf).
 */
import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outdir = resolve(root, 'artifacts', 'api');

await rm(resolve(root, 'artifacts'), { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [resolve(root, 'src/handlers/api.ts')],
  outfile: resolve(outdir, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  minify: true,
  sourcemap: false,
  banner: {
    js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);",
  },
  logLevel: 'info',
});

console.log('bundled api -> artifacts/api/index.mjs');
