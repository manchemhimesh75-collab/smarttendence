module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|react-native-quick-crypto|react-native-get-random-values|@react-native|@react-native-community)/)',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};