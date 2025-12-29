const base = require('./.eslintrc.js')

module.exports = {
  ...base,
  extends: [...base.extends, 'prettier'],
  plugins: [...(base.plugins ?? []), 'prettier'],
  rules: {
    ...base.rules,
    'prettier/prettier': ['warn'],
  },
}
