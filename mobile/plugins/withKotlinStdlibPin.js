const { withProjectBuildGradle } = require('expo/config-plugins');

/**
 * Make expo-iap's Kotlin-2.2.0-built native (`openiap-google:2.5.0`) consumable
 * by Expo SDK 53, which *compiles* with Kotlin 2.0.21 (its expo-root-project
 * plugin only knows Kotlin versions up to 2.0.21, so the compiler can't be
 * raised). Two parts:
 *
 * 1. Pin every `kotlin-stdlib` variant UP to 2.2.0 — the stdlib openiap's
 *    bytecode was compiled against. This direction matters: the Kotlin 2.2.0
 *    compiler emits calls to `kotlin.coroutines.jvm.internal.SpillingKt`
 *    (added in stdlib 2.1.0) in every suspend function, and openiap has ~108
 *    such call sites. Holding the stdlib at 2.0.21 builds clean and then dies
 *    on first use with
 *      java.lang.NoClassDefFoundError: Failed resolution of:
 *        Lkotlin/coroutines/jvm/internal/SpillingKt;
 *    which for us was a launch crash (initIap runs from the root layout).
 *    Pinning up is safe: nothing else in the tree asks above 2.0.21, and the
 *    stdlib is backward-compatible.
 * 2. Add `-Xskip-metadata-version-check` to every Kotlin compile task so the
 *    2.0.21 compiler will read the 2.2.0 module metadata (openiap's own, and
 *    now the stdlib's) instead of failing:
 *      "Module was compiled with an incompatible version of Kotlin. The binary
 *       version of its metadata is 2.2.0, expected version is 2.0.0."
 *    Metadata is only consumed at compile time; the JVM bytecode is
 *    version-agnostic, so skipping the check is safe for a normally-consumed
 *    (non-inline) library API like a billing wrapper.
 *
 * A green `:app:bundleRelease` does NOT validate this — the failure mode is
 * runtime class resolution. Verify by launching the built APK/AAB on a device.
 *
 * Remove this once the app moves to an Expo SDK whose Kotlin >= openiap's.
 */
const KOTLIN = '2.2.0';
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
