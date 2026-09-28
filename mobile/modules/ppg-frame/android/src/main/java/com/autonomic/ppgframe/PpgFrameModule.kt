package com.autonomic.ppgframe

import com.mrousavy.camera.frameprocessors.FrameProcessorPluginRegistry
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Registers the `ppgMeanRgb` frame processor plugin with VisionCamera. The
 * registry is a static map that `VisionCameraProxy.initFrameProcessorPlugin`
 * looks names up in, so all this module has to do is make sure the entry is
 * there before JS asks — `install()` is that guarantee, and is idempotent.
 */
class PpgFrameModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PpgFrame")
    OnCreate { register() }
    Function("install") { register() }
  }

  companion object {
    const val PLUGIN = "ppgMeanRgb"
    private var registered = false

    @Synchronized
    fun register(): Boolean {
      if (!registered) {
        FrameProcessorPluginRegistry.addFrameProcessorPlugin(PLUGIN) { _, _ -> PpgMeanRgbPlugin() }
        registered = true
      }
      return true
    }
  }
}
