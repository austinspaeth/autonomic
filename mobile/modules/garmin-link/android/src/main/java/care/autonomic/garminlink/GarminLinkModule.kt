package care.autonomic.garminlink

import android.content.Context
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Connect IQ companion link, Android side.
 *
 * The API mirrors the iOS module exactly so `src/lib/garmin/receiver.ts` needs
 * no platform branches — but the mechanics underneath are genuinely different,
 * and the difference matters:
 *
 *  - On iOS the companion app is standalone and talks to the watch over BLE
 *    directly; Garmin Connect is only needed to discover devices.
 *  - HERE, Garmin Connect IS the transport. The SDK binds to a service inside
 *    it, so it must be installed AND running for a reading to arrive. That is
 *    Garmin's design, not a limitation we can engineer around.
 *
 * The watch queues and retries until acked, so a Garmin Connect that is asleep
 * delays a reading rather than losing it.
 */
class GarminLinkModule : Module() {

  /** The watch app's Connect IQ id (garmin/manifest.xml), unhyphenated here. */
  private val watchAppId = "D9EF651163FA4339A11E1CED0E8E9036"

  private var connectIQ: ConnectIQ? = null
  private var ready = false
  private val devices = mutableMapOf<String, IQDevice>()

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No react context")

  override fun definition() = ModuleDefinition {
    Name("GarminLink")

    Events("onMessage", "onDeviceStatus", "onNeedsGarminConnect")

    // urlScheme is accepted and ignored: it exists for the iOS URL-callback
    // handshake, which Android does not use. Kept in the signature so the two
    // platforms present one interface to JS.
    AsyncFunction("initialize") { _: String, promise: Promise ->
      val once = Once(promise)
      if (ready) { once.resolve(true); return@AsyncFunction }
      val iq = ConnectIQ.getInstance(context, ConnectIQ.IQConnectType.WIRELESS)
      connectIQ = iq
      iq.initialize(context, /* autoUI = */ false, object : ConnectIQ.ConnectIQListener {
        override fun onSdkReady() {
          ready = true
          once.resolve(true)
        }

        override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus) {
          ready = false
          // Surfaced rather than thrown: a missing Garmin Connect is a state
          // the app explains, not an error it crashes on.
          sendEvent("onNeedsGarminConnect", mapOf("reason" to status.name))
          once.resolve(false)
        }

        override fun onSdkShutDown() {
          ready = false
        }
      })
    }

    // Android has no device picker to launch — the SDK reports paired devices
    // directly. Resolving to the known list keeps the JS flow identical.
    AsyncFunction("showDeviceSelection") {
      // no-op; getDevices() is authoritative here
    }

    AsyncFunction("handleUrl") { _: String ->
      knownDevices()
    }

    AsyncFunction("getDevices") {
      knownDevices()
    }

    AsyncFunction("getAppStatus") { deviceId: String, promise: Promise ->
      val once = Once(promise)
      val iq = connectIQ
      val device = devices[deviceId]
      if (iq == null || device == null) {
        once.resolve(mapOf("installed" to false, "version" to 0, "known" to false))
        return@AsyncFunction
      }
      try {
        iq.getApplicationInfo(watchAppId, device, object : ConnectIQ.IQApplicationInfoListener {
          override fun onApplicationInfoReceived(app: IQApp) {
            once.resolve(mapOf(
              "installed" to true,
              "version" to app.version(),
              "known" to true,
            ))
          }

          override fun onApplicationNotInstalled(applicationId: String) {
            once.resolve(mapOf("installed" to false, "version" to 0, "known" to true))
          }
        })
      } catch (e: Exception) {
        once.resolve(mapOf("installed" to false, "version" to 0, "known" to false))
      }
    }

    AsyncFunction("startListening") { deviceId: String ->
      val iq = connectIQ ?: return@AsyncFunction false
      val device = devices[deviceId] ?: return@AsyncFunction false
      try {
        iq.registerForDeviceEvents(device) { d, status ->
          sendEvent("onDeviceStatus", mapOf(
            "id" to d.deviceIdentifier.toString(),
            "status" to statusName(status),
            "connected" to (status == IQDevice.IQDeviceStatus.CONNECTED),
          ))
        }
        iq.registerForAppEvents(device, IQApp(watchAppId)) { d, _, messageData, _ ->
          // The watch sends one dictionary; the SDK hands it back as a list of
          // decoded objects. Anything that is not a map is ignored rather than
          // guessed at — mapWatchPayload owns validation.
          for (item in messageData) {
            val map = item as? Map<*, *> ?: continue
            val payload = map.entries
              .filter { it.key is String }
              .associate { (it.key as String) to it.value }
              .toMutableMap()
            payload["deviceId"] = d.deviceIdentifier.toString()
            sendEvent("onMessage", payload)
          }
        }
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("stopListening") {
      try {
        connectIQ?.unregisterAllForEvents()
      } catch (e: Exception) {
        // Already torn down.
      }
    }

    AsyncFunction("ackMessage") { deviceId: String, id: String, promise: Promise ->
      val once = Once(promise)
      val iq = connectIQ
      val device = devices[deviceId]
      if (iq == null || device == null) { once.resolve(false); return@AsyncFunction }
      try {
        // This listener runs inside the SDK's BroadcastReceiver for
        // SEND_MESSAGE_STATUS, and it is NOT one-shot: it reports status
        // transitions, and the SDK keeps it registered, so a later ack's
        // status can land on it too (the watch re-delivers until acked, so
        // acks come in bursts). A second resolve throws inside onReceive —
        // "Error receiving broadcast Intent", a process kill. Hence `once`.
        iq.sendMessage(device, IQApp(watchAppId), mapOf("ack" to id)) { _, _, status ->
          once.resolve(status == ConnectIQ.IQMessageStatus.SUCCESS)
        }
      } catch (e: Exception) {
        once.resolve(false)
      }
    }


    AsyncFunction("openStoreForApp") { _: String ->
      try {
        connectIQ?.openStore(watchAppId)
      } catch (e: Exception) {
        // Garmin Connect not available; the JS layer already explains that.
      }
    }

    OnDestroy {
      try {
        connectIQ?.shutdown(context)
      } catch (e: Exception) {
        // Never initialised.
      }
    }
  }

  /**
   * Settles a Promise at most once. expo-modules-core throws on a second
   * settle, on whatever thread it arrives — here a Connect IQ callback or the
   * SDK's own BroadcastReceiver, where no catch of ours can reach it — so a
   * double settle is a process kill (`native.crash` on the Failures tab).
   *
   * Dropping the later settles is right, not merely safe: the FIRST answer is
   * the real one. A second status is the same send being narrated (or another
   * send's status reaching a listener the SDK never unregistered), and an
   * exception after a listener already answered is the SDK unwinding.
   * `onSdkReady` can also fire again when Garmin Connect's service rebinds.
   * Atomic because the callback thread and the caller's thread both touch it.
   */
  private class Once(private val promise: Promise) {
    private val settled = AtomicBoolean(false)
    fun resolve(value: Any?) {
      if (settled.compareAndSet(false, true)) promise.resolve(value)
    }
  }

  private fun knownDevices(): List<Map<String, Any?>> {
    val iq = connectIQ ?: return emptyList()
    return try {
      val list = iq.knownDevices ?: emptyList()
      devices.clear()
      list.map { d ->
        val id = d.deviceIdentifier.toString()
        devices[id] = d
        val status = try { iq.getDeviceStatus(d) } catch (e: Exception) { d.status }
        mapOf(
          "id" to id,
          "name" to (d.friendlyName ?: "Garmin"),
          "model" to "",
          "status" to statusName(status),
          "connected" to (status == IQDevice.IQDeviceStatus.CONNECTED),
        )
      }
    } catch (e: Exception) {
      emptyList()
    }
  }

  /** Mapped onto the iOS status vocabulary so JS sees one set of strings. */
  private fun statusName(status: IQDevice.IQDeviceStatus?): String = when (status) {
    IQDevice.IQDeviceStatus.CONNECTED -> "connected"
    IQDevice.IQDeviceStatus.NOT_CONNECTED -> "notConnected"
    IQDevice.IQDeviceStatus.NOT_PAIRED -> "notFound"
    else -> "unknown"
  }
}
