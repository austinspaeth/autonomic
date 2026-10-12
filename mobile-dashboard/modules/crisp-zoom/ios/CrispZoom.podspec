Pod::Spec.new do |s|
  s.name           = 'CrispZoom'
  s.version        = '1.0.0'
  s.summary        = 'A view whose contents stay sharp under a scale transform.'
  s.description    = 'Local Expo module: a container that raises the drawing resolution of everything inside it to match the zoom it is shown at, so a zoomed board is redrawn rather than stretched.'
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
