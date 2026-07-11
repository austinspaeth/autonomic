/**
 * Expo config plugin: patch `fmt` for Xcode 26 / newer Clang.
 *
 * React Native 0.79's `fmt` pod marks its FMT_STRING helpers `consteval`,
 * which newer Clang rejects ("call to consteval function ... is not a
 * constant expression"). The FMT_USE_CONSTEVAL macro isn't #ifndef-guarded,
 * so a preprocessor define won't stick — the header itself must be patched
 * after `pod install` downloads it.
 *
 * The local ios/ project carries this patch in its Podfile post_install, but
 * ios/ is untracked and EAS regenerates the Podfile from the template during
 * prebuild — this plugin injects the same patch into that generated Podfile
 * so cloud builds on Xcode 26 images compile. Drop it (and the eas.json
 * image pin) once the app is on an RN version whose fmt supports new Clang.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'fmt-consteval-fix';
const PATCH = `    # ${MARKER}: fmt's FMT_CONSTEVAL breaks under newer Clang (Xcode 26);
    # make it expand empty. Injected by plugins/withFmtConstevalFix.js.
    fmt_base = File.join(__dir__, 'Pods', 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base)
      fmt_src = File.read(fmt_base)
      if fmt_src.include?('#  define FMT_CONSTEVAL consteval')
        fmt_src.sub!('#  define FMT_CONSTEVAL consteval',
                     '#  define FMT_CONSTEVAL /* consteval disabled for newer Clang */')
        File.write(fmt_base, fmt_src)
      end
    end
`;

module.exports = function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfilePath = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let src = fs.readFileSync(podfilePath, 'utf8');
      if (!src.includes(MARKER)) {
        const anchor = 'post_install do |installer|';
        if (!src.includes(anchor)) {
          throw new Error('withFmtConstevalFix: no post_install hook found in the generated Podfile');
        }
        src = src.replace(anchor, `${anchor}\n${PATCH}`);
        fs.writeFileSync(podfilePath, src);
      }
      return cfg;
    },
  ]);
};
