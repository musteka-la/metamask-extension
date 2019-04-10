module.exports = {
  'ignore': ['ui/css.js'],
  'presets': [
    [
      '@babel/env',
      {
        'debug': true,
        'targets': {
          'browsers': [
            '>0.25%',
            'not ie 11',
            'not op_mini all',
          ],
        },
      },
    ],
    '@babel/react',
  ],
  'plugins': [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-transform-async-to-generator',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-object-rest-spread',
  ],
}
