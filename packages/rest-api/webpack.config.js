const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

module.exports = {
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  // NxAppWebpackPlugin's default externalDependencies:'all' only scans the
  // *root* node_modules to decide what stays external vs. gets bundled.
  // swagger-ui-dist resolves to a peer-conflict-driven nested copy under
  // this package's own node_modules, so it's invisible to that scan and
  // gets bundled instead — which breaks its __dirname-based lookup of its
  // own sibling static assets (it ends up pointing at dist/, not the real
  // package dir). Force it external here so it stays a real runtime
  // require() against the nested copy the Dockerfile now also copies in.
  externals: [
    ({ request }, callback) => {
      if (/^swagger-ui-dist(\/.*)?$/.test(request)) {
        return callback(null, `commonjs ${request}`);
      }
      callback();
    },
  ],
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: false,
      sourceMap: true,
      mergeExternals: true,
    }),
  ],
};
