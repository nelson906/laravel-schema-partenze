import js from '@eslint/js';
import globals from 'globals';
import importX from 'eslint-plugin-import-x';

export default [
    {
        // Cartelle mai analizzate: dipendenze, build, mirror di _overrides_*
        // (_overrides_quadranti e' una copia di resources/js/quadranti,
        // analizzarla duplicherebbe ogni errore).
        ignores: [
            'node_modules/**',
            'vendor/**',
            'public/build/**',
            'storage/**',
            '_overrides_admin/**',
            '_overrides_quadranti/**',
            'Schemi partenze/**',
        ],
    },

    js.configs.recommended,

    {
        // Sorgenti browser dell'app (moduli ES compilati da Vite).
        files: ['resources/js/**/*.js', 'public/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                Alpine: 'readonly',
                XLSX: 'readonly', // SheetJS caricato da CDN nella view Blade
                axios: 'readonly',
                $: 'readonly',
                jQuery: 'readonly',
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
        plugins: {
            'import-x': importX,
        },
        settings: {
            'import-x/resolver': { node: { extensions: ['.js', '.json'] } },
        },
        rules: {
            // --- import: rotture reali, non stile ---
            // Un import che punta a un file inesistente passa il build Vite
            // solo finche' il ramo non viene eseguito: qui e' errore subito.
            'import-x/no-unresolved': 'error',
            'import-x/named': 'error',
            'import-x/default': 'error',
            'import-x/no-duplicates': 'error',
            'import-x/no-self-import': 'error',
            'import-x/no-cycle': ['error', { maxDepth: 6 }],
            'import-x/no-useless-path-segments': 'error',
            'import-x/first': 'error',
            'import-x/newline-after-import': 'warn',

            // --- correttezza ---
            'array-callback-return': ['error', { allowImplicit: false }],
            'consistent-return': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
            'no-constant-binary-expression': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'warn',
            'require-atomic-updates': 'error',
            'default-case-last': 'error',
            'no-else-return': 'off',
            radix: 'error',
            'no-param-reassign': ['warn', { props: false }],

            'no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            }],
            'no-undef': 'error',
            'no-console': ['warn', { allow: ['warn', 'error', 'debug'] }],
            eqeqeq: ['error', 'smart'],
            'prefer-const': 'error',
            'no-var': 'error',
            'no-implicit-coercion': 'warn',
            'no-shadow': 'warn',
            'no-return-await': 'warn',
        },
    },

    {
        // File di test Vitest: globals dei test + console libera.
        files: ['resources/js/**/*.test.js'],
        languageOptions: {
            globals: {
                ...globals.node,
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly',
                vi: 'readonly',
            },
        },
        rules: {
            'no-console': 'off',
        },
    },

    {
        // File di configurazione Node (vite, vitest, tailwind, postcss).
        files: ['*.config.js', '*.config.mjs'],
        languageOptions: {
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: {
            'no-console': 'off',
        },
    },
];
