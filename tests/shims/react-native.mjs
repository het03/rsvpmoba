// Just enough of React Native for the pure logic modules that import it.
export const Platform = { OS: 'android', select: (options) => options.android ?? options.default };
export default { Platform };
