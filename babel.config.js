module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // Jest's CommonJS module system can't execute native dynamic `import()`.
    // Rewrite it to `require()` only when running under Jest.
    env: {
      test: {
        plugins: ['babel-plugin-dynamic-import-node'],
      },
    },
  }
}