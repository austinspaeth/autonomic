Pod::Spec.new do |s|
  s.name           = 'AppEnv'
  s.version        = '1.0.0'
  s.summary        = 'Reports the App Store receipt environment (TestFlight/dev vs App Store).'
  s.description    = 'Local Expo module exposing whether the build runs with a sandbox receipt, used to relax the paywall in TestFlight while enforcing it on the App Store.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
