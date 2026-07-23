const { withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Make expo-iap's Kotlin-2.2.0-built native (`openiap-google:2.5.0`) consumable
 * by Expo SDK 53, which compiles with Kotlin 2.0.21 (its expo-root-project
 * plugin only knows Kotlin versions up to 2.0.21, so the compiler can't be
 * raised). Two parts:
 *
 * 1. Pin every `kotlin-stdlib` variant back to 2.0.21 — openiap drags it up to
 *    2.2.0 transitively, and the 2.0.21 compiler rejects 2.2.0 stdlib metadata.
 * 2. Add `-Xskip-metadata-version-check` to every Kotlin compile task so the
 *    2.0.21 compiler will read openiap's own 2.2.0 module metadata instead of
 *    failing:
 *      "Module was compiled with an incompatible version of Kotlin. The binary
 *       version of its metadata is 2.2.0, expected version is 2.0.0."
 *    Metadata is only consumed at compile time; the JVM bytecode is
 *    version-agnostic, so skipping the check is safe for a normally-consumed
 *    (non-inline) library API like a billing wrapper.
 *
 * Remove this once the app moves to an Expo SDK whose Kotlin >= openiap's.
 */
const KOTLIN = '2.0.21';
const SNIPPET = `
allprojects {
    configurations.all {
        resolutionStrategy.eachDependency { details ->
            if (details.requested.group == "org.jetbrains.kotlin" && details.requested.name.startsWith("kotlin-stdlib")) {
                details.useVersion "${KOTLIN}"
            }
        }
    }
    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        kotlinOptions {
            freeCompilerArgs += ["-Xskip-metadata-version-check"]
        }
    }
}
`;

module.exports = function withKotlinStdlibPin(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withKotlinStdlibPin: expected a groovy root build.gradle');
    }
    if (!cfg.modResults.contents.includes('Xskip-metadata-version-check')) {
      cfg.modResults.contents += SNIPPET;
    }
    return cfg;
  });
};
