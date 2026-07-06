Pod::Spec.new do |s|
  s.name           = 'EcgHealth'
  s.version        = '1.0.0'
  s.summary        = 'Reads Apple Health ECG (HKElectrocardiogram) samples and voltage waveform.'
  s.description    = 'Local Expo module exposing HKElectrocardiogramQuery to JS for the Autonomic journal.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Link HealthKit.
  s.frameworks = 'HealthKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
