Pod::Spec.new do |s|
  s.name           = 'BackgroundLaunch'
  s.version        = '1.0.0'
  s.summary        = 'Starts React Native when iOS launches the app in the background with no scene.'
  s.description    = 'Local Expo module working around expo/expo#52878: under the UIScene life cycle React Native is started by the scene delegate, and a background launch (HealthKit background delivery, BGTaskScheduler) connects no scene, so JavaScript never runs. This starts the React host without a view when no scene has done it.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # ExpoAppDelegate / ExpoReactNativeFactoryProvider / ExpoBundleConfiguration.
  s.dependency 'Expo'
  # The updates controller has to choose the bundle BEFORE the host starts, or
  # background JavaScript would run the embedded bundle instead of the latest OTA.
  s.dependency 'EXUpdates'
  s.dependency 'React-RCTAppDelegate'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
