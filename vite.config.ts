import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base: './' — сайт работает из любого подкаталога (GitHub Pages: /<репозиторий>/)
export default defineConfig({
  base: './',
  plugins: [preact()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
