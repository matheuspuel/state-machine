module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/strict',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  ignorePatterns: [
    '/.vscode/*',
    '/coverage/*',
    '/dist/*',
    '/experiments/*',
    '/node_modules/*',
    '.eslintrc.cjs',
    '.eslintrc.production.cjs',
  ],
  rules: {
    // already checked by typescript
    '@typescript-eslint/no-redeclare': 'off',
    // allow namespace declaration for types
    '@typescript-eslint/no-namespace': ['error', { allowDeclarations: true }],
    // allow explicit unused variables
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      },
    ],
    // allow checking if generic type extends void
    '@typescript-eslint/no-invalid-void-type': 'off',
    // allow non null assertion to overcome typing limitations
    '@typescript-eslint/no-non-null-assertion': 'off',
    // allow use of "any" to overcome typing limitations
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
  },
}
