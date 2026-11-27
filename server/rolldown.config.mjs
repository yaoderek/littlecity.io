// Builds the forum server to one file, server/dist/forum.mjs (Global Village). Owner: Forum.
// The game's town decoder comes in from src/ with its '@/' paths; Node's own modules stay outside.
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'rolldown';

export default defineConfig({
  input: fileURLToPath(new URL('./main.ts', import.meta.url)),
  platform: 'node',
  resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
  external: [/^node:/],
  output: { file: fileURLToPath(new URL('./dist/forum.mjs', import.meta.url)), format: 'esm', codeSplitting: false },
});
