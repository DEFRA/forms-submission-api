/**
 * @type {import('eslint').ESLint.ConfigData}
 */
module.exports = {
  ignorePatterns: ['.server', 'src/__fixtures__', 'coverage'],
  overrides: [
    {
      extends: [
        'standard',
        'eslint:recommended',
        'plugin:import/recommended',
        'plugin:import/typescript',
        'plugin:jsdoc/recommended-typescript-flavor',
        'plugin:n/recommended',
        'plugin:promise/recommended',
        'plugin:@typescript-eslint/strict-type-checked',
        'plugin:@typescript-eslint/stylistic-type-checked',
        'prettier'
      ],
      files: ['**/*.{cjs,js,mjs}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname
      },
      plugins: ['@typescript-eslint', 'import', 'jsdoc', 'n', 'promise'],
      rules: {
        'no-console': 'error',

        // Only show warnings for missing types
        '@typescript-eslint/no-unsafe-argument': 'warn',
        '@typescript-eslint/no-unsafe-assignment': 'warn',
        '@typescript-eslint/no-unsafe-call': 'warn',
        '@typescript-eslint/no-unsafe-member-access': 'warn',
        '@typescript-eslint/no-unsafe-return': 'warn',

        // Check type support for template string implicit `.toString()`
        '@typescript-eslint/restrict-template-expressions': [
          'error',
          {
            allowBoolean: true,
            allowNumber: true
          }
        ],

        // Skip rules handled by TypeScript compiler
        'import/default': 'off',
        'import/extensions': 'off',
        'import/named': 'off',
        'import/namespace': 'off',
        'import/no-named-as-default-member': 'off',
        'import/no-unresolved': 'off',

        // Check import or require statements are A-Z ordered
        'import/order': [
          'error',
          {
            alphabetize: { order: 'asc' },
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
      },
      settings: {
        'import/resolver': {
          node: true,
          typescript: true
        }
      }
    },
    {
      files: ['**/*.{js,mjs}'],
      parserOptions: {
        sourceType: 'module'
      },
      rules: {
        'import/extensions': [
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
    {
      env: {
        'jest/globals': true
      },
      extends: ['plugin:jest/recommended', 'plugin:jest/style'],
      files: ['**/*.test.{cjs,js,mjs}'],
      plugins: ['jest'],
      rules: {
        // Turn off warnings for jest.Expect 'any' types
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',

        // Allow Jest to assert on mocked unbound methods
        '@typescript-eslint/unbound-method': 'off',
        'jest/unbound-method': 'error'
      }
    }
  ],
  root: true
}
