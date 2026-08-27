Pod::Spec.new do |s|
  s.name           = 'GarminLink'
  s.version        = '1.0.0'
  s.summary        = 'Connect IQ companion link for Garmin watches.'
  s.description    = 'Local Expo module wrapping the Connect IQ Companion SDK so a Garmin watch app can deliver readings straight to Autonomic over BLE.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # The Connect IQ SDK ships as an xcframework; it is vendored rather than
  # fetched, so a build never depends on Garmin's GitHub being reachable.
  s.vendored_frameworks = 'Frameworks/ConnectIQ.xcframework'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
    # The SDK uses Objective-C categories internally.
    'OTHER_LDFLAGS' => '-ObjC'
  }

  # NON-recursive on purpose, and NO exclude_files. A "**" glob walks into
  # Frameworks/ConnectIQ.xcframework/.../Headers and pulls Garmin's own headers
  # into this pod's generated umbrella header, which then fails to find them at
  # build time ("'ConnectIQ.h' file not found"). Our sources are the .swift
  # files sitting beside this podspec; the framework comes in through
  # vendored_frameworks, not as source. An exclude_files on "Frameworks/**/*"
  # also seems to deregister the vendored framework itself — the pod then builds
  # with no FRAMEWORK_SEARCH_PATHS entry and Swift cannot resolve the module.
  s.source_files = "*.{h,m,mm,swift,hpp,cpp}"
end
