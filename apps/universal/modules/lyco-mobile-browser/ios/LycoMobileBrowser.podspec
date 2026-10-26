Pod::Spec.new do |s|
  s.name = 'LycoMobileBrowser'
  s.version = '0.1.0'
  s.summary = 'LYCO per-environment website data and explicit proxy routing'
  s.description = s.summary
  s.author = 'LYCO'
  s.homepage = 'https://github.com/lilyco-42/lyco-browser'
  s.platforms = { :ios => '17.0' }
  s.source = { :git => 'https://github.com/lilyco-42/lyco-browser.git' }
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'WebKit', 'Network', 'UIKit'
  s.libraries = 'resolv'
  s.source_files = '*.swift'
  s.vendored_frameworks = 'Frameworks/Lycotunnel.xcframework'
  s.swift_version = '5.9'
end
