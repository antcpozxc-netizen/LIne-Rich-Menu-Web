// craco.config.js
const path = require('path');

// ระบุ "แพ็กเกจจริง" ที่มีอยู่ใน project เท่านั้น
const modulesToTranspile = [
  '@mui/material',
  '@mui/icons-material',
  '@emotion/react',
  '@emotion/styled',
  'firebase',
  '@firebase/app',
  '@firebase/auth',
  '@firebase/firestore',
  '@firebase/util',
  'date-fns',
  'uuid'
];

// แปลงเป็นพาธของแต่ละแพ็กเกจ (ถ้าไม่มีให้ข้ามไป)
function tryPkgDir(name) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch (_e) {
    return null;
  }
}
const includePaths = modulesToTranspile.map(tryPkgDir).filter(Boolean);

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const oneOfRule = webpackConfig.module.rules.find(r => r.oneOf);
      if (!oneOfRule) return webpackConfig;

      oneOfRule.oneOf.unshift({
        test: /\.(js|mjs|jsx|ts|tsx)$/,
        include: includePaths,
        loader: require.resolve('babel-loader'),
        options: {
          cacheDirectory: true,
          cacheCompression: false,
          presets: [
            [require.resolve('babel-preset-react-app'), { runtime: 'automatic' }]
          ],
          plugins: [
            require.resolve('@babel/plugin-proposal-optional-chaining'),
            require.resolve('@babel/plugin-proposal-nullish-coalescing-operator')
          ]
        }
      });

      return webpackConfig;
    }
  }
};
