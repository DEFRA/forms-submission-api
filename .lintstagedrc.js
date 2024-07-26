export default {
  '*.{cjs,js,mjs}': ['eslint --fix', 'prettier --write'],
  '*.{json,md}': 'prettier --write',
  '*.test.{cjs,js,mjs}': 'jest'
}
