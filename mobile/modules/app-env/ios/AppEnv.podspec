Pod::Spec.new do |s|
  s.name           = 'AppEnv'
  s.version        = '1.0.0'
  s.summary        = 'Facts about this binary: receipt environment, MetricKit crash log, background time.'
  s.description    = 'Local Expo module exposing whether the build runs with a sandbox receipt (used to relax the paywall in TestFlight), the MetricKit crash diagnostics written for the JS crash drain, and UIApplication background tasks.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'MetricKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
