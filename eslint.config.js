import { defineConfig } from 'eslint/config'
import prettierConfig from 'eslint-config-prettier'
import jest from 'eslint-plugin-jest'
import jsdocPlugin from 'eslint-plugin-jsdoc'
import globals from 'globals'
import neostandard from 'neostandard'
import tseslint from 'typescript-eslint'

export default defineConfig([
  // Global ignores
  {
    ignores: [
      '.server',
      'src/__fixtures__',
      'coverage',
      'node_modules',
      'node_modules/.*',
      '**/*.d.ts'
    ]
  },

  // Base neostandard config (replaces standard + n + promise + import plugins)
  ...neostandard({ ts: true, noStyle: true }),

  // TypeScript strict + stylistic type-checked configs
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // JSDoc recommended (base)
  jsdocPlugin.configs['flat/recommended'],

  // Global parser options for type-checked linting
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js']
        },
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  // JS-specific override: use recommended-typescript-flavor for JS files
  {
    files: ['**/*.{cjs,js,mjs}'],
    ...jsdocPlugin.configs['flat/recommended-typescript-flavor']
  },

  // Base config for all JS/CJS/MJS files (after jsdoc flavor so custom rules win)
  {
    files: ['**/*.{cjs,js,mjs}'],
    rules: {
      'no-console': 'error',

      // Don't show warnings for types - let TS handle
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      // Check type support for template string implicit `.toString()`
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowBoolean: true,
          allowNumber: true
        }
      ],

      // Skip rules handled by TypeScript compiler
      'import-x/default': 'off',
      'import-x/extensions': 'off',
      'import-x/named': 'off',
      'import-x/namespace': 'off',
      'import-x/no-named-as-default': 'off',
      'import-x/no-named-as-default-member': 'off',
      'import-x/no-unresolved': 'off',

      // Check import or require statements are A-Z ordered
      'import-x/order': [
        'error',
        {
          alphabetize: { order: 'asc' },
          named: true,
          'newlines-between': 'always'
        }
      ],

      // Check for valid formatting
      'jsdoc/check-line-alignment': [
        'warn',
        'never',
        {
          tags: ['param', 'property', 'typedef', 'returns']
        }
      ],

      // Require hyphens before param description
      // Aligns with TSDoc style: https://tsdoc.org/pages/tags/param/
      'jsdoc/require-hyphen-before-param-description': [
        'warn',
        'always',
        {
          tags: {
            param: 'always',
            property: 'always',
            returns: 'never'
          }
        }
      ],

      // JSDoc blocks are mandatory for classes and methods
      'jsdoc/require-jsdoc': [
        'error',
        {
          enableFixer: false,
          require: {
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionExpression: false,
            MethodDefinition: true
          }
        }
      ],

      // JSDoc @param types are mandatory for JavaScript
      'jsdoc/require-param-description': 'off',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-param': 'off',

      // JSDoc @returns is optional
      'jsdoc/require-returns-description': 'off',
      'jsdoc/require-returns-type': 'off',
      'jsdoc/require-returns': 'off',

      // Skip rules handled by TypeScript compiler
      'n/no-extraneous-require': 'off',
      'n/no-extraneous-import': 'off',
      'n/no-missing-require': 'off',
      'n/no-missing-import': 'off',

      // Prefer rules that are type aware
      'no-unused-vars': 'off',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-unused-vars': ['error'],
      '@typescript-eslint/no-use-before-define': ['error', 'nofunc']
    }
  },

  // CJS override - allow require imports
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },

  // ESM source type override
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      sourceType: 'module'
    },
    rules: {
      'import-x/extensions': [
        'error',
        'always',
        {
          ignorePackages: true,
          pattern: {
            cjs: 'always',
            js: 'always',
            mjs: 'always'
          }
        }
      ]
    }
  },

  // Jest override for test files and stubs
  {
    files: ['**/*.test.{cjs,js,mjs}', '**/__stubs__/**/*.{cjs,js,mjs}'],
    ...jest.configs['flat/recommended'],
    ...jest.configs['flat/style'],
    languageOptions: {
      globals: globals.jest
    },
    rules: {
      ...jest.configs['flat/recommended'].rules,
      ...jest.configs['flat/style'].rules,

      // Turn off warnings for jest.Expect 'any' types
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',

      // Allow Jest to assert on mocked unbound methods
      '@typescript-eslint/unbound-method': 'off',
      'jest/unbound-method': 'error'
    }
  },

  // Prettier must be last
  prettierConfig
])
