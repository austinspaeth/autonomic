#pragma once

#import <Foundation/Foundation.h>
#import <Expo/RCTAppDelegateUmbrella.h>
#import <React/RCTBundleManager.h>
#import <React/RCTDevMenu.h>

NS_ASSUME_NONNULL_BEGIN

/**
 * Starts the React host for `BackgroundLaunch`, in Objective-C, so a missing
 * dev menu configuration stays nil instead of trapping.
 *
 * `-[RCTRootViewFactory initializeReactHostWithLaunchOptions:bundleConfiguration:devMenuConfiguration:]`
 * declares its dev menu configuration non-null, so Swift has to pass a value.
 * But in a release build React compiles the dev menu out and
 * `+[RCTDevMenuConfiguration defaultConfiguration]` returns nil (RCTDevMenu.mm,
 * the `!RCT_DEV_MENU` branch). Swift imports that method as non-optional, checks
 * the result, and traps on nil: `RCTDevMenuConfiguration.default()` crashed every
 * background launch of 2.0.0 (build 98, Autonomic +0xe3e4). Objective-C passes
 * nil straight through, which is exactly what React's own factory does in
 * release, and what Expo's `EXReactRootViewFactory` does on its normal path.
 */
@interface BackgroundLaunchHost : NSObject

+ (void)initializeReactHostOn:(RCTRootViewFactory *)rootViewFactory
                launchOptions:(nullable NSDictionary *)launchOptions
          bundleConfiguration:(RCTBundleConfiguration *)bundleConfiguration
         devMenuConfiguration:(nullable RCTDevMenuConfiguration *)devMenuConfiguration
    NS_SWIFT_NAME(initializeReactHost(on:launchOptions:bundleConfiguration:devMenuConfiguration:));

@end

NS_ASSUME_NONNULL_END
