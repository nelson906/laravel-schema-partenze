import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/css/app.css',
                'resources/js/app.js',
                'resources/js/quadranti/quadranti.js',
            ],
            refresh: true,
        }),
    ],
    // Source maps abilitate per il debug step-by-step in DevTools.
    // Permettono di vedere i file sorgente originali (quadranti-logic.js,
    // quadranti.js, ecc.) in Sources tab → Cmd+P → cerca per nome.
    build: {
        sourcemap: true,
    },
});
