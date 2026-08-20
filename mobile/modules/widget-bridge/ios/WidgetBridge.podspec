Pod::Spec.new do |s|
  s.name           = 'WidgetBridge'
  s.version        = '1.0.0'
  s.summary        = 'Phone side of the home-screen widgets: app-group payload writer.'
  s.description    = 'Local Expo module that stores the widget JSON payload in the shared app group and asks WidgetKit to reload the Autonomic home-screen widgets.'
  s.author         = 'Autonomic'
  s.homepage       = 'https://autonomic.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'WidgetKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
