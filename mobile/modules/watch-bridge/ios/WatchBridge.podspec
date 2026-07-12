Pod::Spec.new do |s|
  s.name           = 'WatchBridge'
  s.version        = '1.0.0'
  s.summary        = 'Phone side of the Apple Watch companion: WCSession bridge to JS.'
  s.description    = 'Local Expo module owning the WatchConnectivity session for the Autonomic journal. Receives stand-test results from the watch app and relays entitlement/profile context back.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Link WatchConnectivity.
  s.frameworks = 'WatchConnectivity'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
