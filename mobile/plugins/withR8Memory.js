const { withGradleProperties } = require('expo/config-plugins');

/**
 * Give R8 enough heap. Expo's template ships
 * `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m`, which is fine for a
 * non-minified build but marginal once `enableProguardInReleaseBuilds` is on:
 * R8 runs inside the Gradle daemon and holds the whole merged class hierarchy
 * (React Native + Expo modules + AndroidX + Play Billing) in memory. At 2 GB
 * `:app:minifyReleaseWithR8` intermittently dies with
 *   java.lang.OutOfMemoryError: Java heap space
 * which on EAS reads as an unexplained build failure rather than a config
 * problem. 4 GB clears it with room to spare on both EAS workers and local
 * machines.
 *
 * Also turns on Gradle's parallel + caching flags, which only affect build
 * wall-clock, never the artifact.
 */
const PROPS = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.parallel': 'true',
  'org.gradle.caching': 'true',
};

module.exports = function withR8Memory(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const existing = cfg.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
