#import "BackgroundLaunchHost.h"

@implementation BackgroundLaunchHost

+ (void)initializeReactHostOn:(RCTRootViewFactory *)rootViewFactory
                launchOptions:(nullable NSDictionary *)launchOptions
          bundleConfiguration:(RCTBundleConfiguration *)bundleConfiguration
         devMenuConfiguration:(nullable RCTDevMenuConfiguration *)devMenuConfiguration
{
  // Debug builds get React's default dev menu configuration, as before.
  // Release builds have none (defaultConfiguration returns nil there), and nil
  // is what React itself passes in release, so it goes through unchanged.
  if (devMenuConfiguration == nil) {
    devMenuConfiguration = [RCTDevMenuConfiguration defaultConfiguration];
  }
  [rootViewFactory initializeReactHostWithLaunchOptions:launchOptions
                                    bundleConfiguration:bundleConfiguration
                                   devMenuConfiguration:devMenuConfiguration];
}

@end
