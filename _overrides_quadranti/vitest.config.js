import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['resources/js/**/*.test.js'],
        coverage: {
            provider: 'v8',
            include: ['resources/js/quadranti/**'],
            exclude: ['resources/js/quadranti/quadranti.js'],
        },
    },
});
