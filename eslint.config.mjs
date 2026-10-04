import next from 'eslint-config-next';

const config = [
  ...next,
  {
    rules: {
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  { ignores: ['.next/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
];

export default config;
