import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const schemaRoot = resolve(projectRoot, 'schema');
const publicSchemaRoot = resolve(projectRoot, 'web/public/schema');

function syncSchema() {
  return {
    name: 'sync-schema-into-web-public',
    buildStart() {
      rmSync(publicSchemaRoot, { recursive: true, force: true });
      mkdirSync(resolve(projectRoot, 'web/public'), { recursive: true });
      if (existsSync(schemaRoot)) cpSync(schemaRoot, publicSchemaRoot, { recursive: true });
    },
  };
}

export default defineConfig({
  root: resolve(projectRoot, 'web'),
  plugins: [syncSchema()],
  build: {
    outDir: resolve(projectRoot, 'web/dist'),
    emptyOutDir: true,
  },
});
