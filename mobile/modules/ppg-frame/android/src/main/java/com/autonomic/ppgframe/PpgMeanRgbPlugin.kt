package com.autonomic.ppgframe

import com.mrousavy.camera.frameprocessors.Frame
import com.mrousavy.camera.frameprocessors.FrameProcessorPlugin
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * The camera-PPG frame read, done where the frame lives: a strided mean of
 * R/G/B over the centre half of the frame, returned as `[r, g, b]`.
 *
 * It exists because `frame.toArrayBuffer()` cannot be trusted on Android.
 * VisionCamera implements it by locking the frame's HardwareBuffer with
 * `AHARDWAREBUFFER_USAGE_CPU_READ_MASK` — a MASK, not a usage — and a strict
 * gralloc (Galaxy S25 on Android 16, among others) refuses every lock, so not
 * one frame could be read and the camera could never take a reading. This
 * reads the same pixels through `Image.getPlanes()`, the platform's own CPU
 * mapping of an ImageReader image, which is what CameraX itself does and never
 * goes near an AHardwareBuffer lock. It also stops copying a whole frame into
 * JS just to average ~1200 pixels of it.
 *
 * The arithmetic mirrors the JS fallback in `src/lib/ppg/CameraView.tsx`
 * exactly (same crop, same stride rule), so a reading taken through either
 * path sits on the same noise floor. Anything it cannot read THROWS, and the
 * worklet's catch counts it as an unreadable frame — never a silent zero.
 */
class PpgMeanRgbPlugin : FrameProcessorPlugin() {
  override fun callback(frame: Frame, params: Map<String, Any>?): Any {
    val image = frame.image
    val w = image.width
    val h = image.height
    val planes = image.planes
    // Average a fixed ~TARGET_SAMPLES pixels whatever resolution was handed back.
    val stride = max(1, sqrt((w.toDouble() * h) / (4 * TARGET_SAMPLES)).roundToInt())
    val x0 = w shr 2
    val x1 = (3 * w) shr 2
    val y0 = h shr 2
    val y1 = (3 * h) shr 2

    if (planes.size == 1) {
      // pixelFormat "rgb": one RGBA_8888 plane.
      val p = planes[0]
      val buf = p.buffer
      val row = p.rowStride
      val px = p.pixelStride
      var r = 0L; var g = 0L; var b = 0L; var n = 0
      var y = y0
      while (y < y1) {
        var x = x0
        while (x < x1) {
          val i = y * row + x * px
          if (i + 2 < buf.limit()) {
            r += u8(buf, i); g += u8(buf, i + 1); b += u8(buf, i + 2)
            n++
          }
          x += stride
        }
        y += stride
      }
      if (n == 0) throw IllegalStateException("RGBA frame ${w}x$h held no readable pixels")
      return arrayListOf(r.toDouble() / n, g.toDouble() / n, b.toDouble() / n)
    }

    if (planes.size >= 3) {
      // YUV_420_888, in case the pipeline ever hands one over. The conversion
      // is linear, so the RGB of the mean YUV is the mean of the RGB.
      val yp = planes[0]; val up = planes[1]; val vp = planes[2]
      var ys = 0L; var us = 0L; var vs = 0L; var n = 0
      var y = y0
      while (y < y1) {
        var x = x0
        while (x < x1) {
          val yi = y * yp.rowStride + x * yp.pixelStride
          val ui = (y shr 1) * up.rowStride + (x shr 1) * up.pixelStride
          val vi = (y shr 1) * vp.rowStride + (x shr 1) * vp.pixelStride
          if (yi < yp.buffer.limit() && ui < up.buffer.limit() && vi < vp.buffer.limit()) {
            ys += u8(yp.buffer, yi); us += u8(up.buffer, ui); vs += u8(vp.buffer, vi)
            n++
          }
          x += stride
        }
        y += stride
      }
      if (n == 0) throw IllegalStateException("YUV frame ${w}x$h held no readable pixels")
      val yy = ys.toDouble() / n
      val cb = us.toDouble() / n - 128.0
      val cr = vs.toDouble() / n - 128.0
      return arrayListOf(
        clamp(yy + 1.402 * cr),
        clamp(yy - 0.344136 * cb - 0.714136 * cr),
        clamp(yy + 1.772 * cb),
      )
    }

    throw IllegalStateException("unsupported frame: ${planes.size} plane(s), format ${image.format}")
  }

  private fun u8(buf: ByteBuffer, i: Int): Int = buf.get(i).toInt() and 0xFF
  private fun clamp(v: Double): Double = v.coerceIn(0.0, 255.0)

  companion object {
    /** Same figure as TARGET_SAMPLES in CameraView.tsx's worklet — move both. */
    private const val TARGET_SAMPLES = 1200
  }
}
