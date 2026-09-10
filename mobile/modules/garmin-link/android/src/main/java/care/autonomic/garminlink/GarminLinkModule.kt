package care.autonomic.garminlink

import android.content.Context
import com.garmin.android.connectiq.ConnectIQ
import com.garmin.android.connectiq.IQApp
import com.garmin.android.connectiq.IQDevice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

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
      if (ready) { promise.resolve(true); return@AsyncFunction }
      val iq = ConnectIQ.getInstance(context, ConnectIQ.IQConnectType.WIRELESS)
      connectIQ = iq
      iq.initialize(context, /* autoUI = */ false, object : ConnectIQ.ConnectIQListener {
        override fun onSdkReady() {
          ready = true
          promise.resolve(true)
        }

        override fun onInitializeError(status: ConnectIQ.IQSdkErrorStatus) {
          ready = false
          // Surfaced rather than thrown: a missing Garmin Connect is a state
          // the app explains, not an error it crashes on.
          sendEvent("onNeedsGarminConnect", mapOf("reason" to status.name))
          promise.resolve(false)
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
      val iq = connectIQ
      val device = devices[deviceId]
      if (iq == null || device == null) {
        promise.resolve(mapOf("installed" to false, "version" to 0, "known" to false))
        return@AsyncFunction
      }
      try {
        iq.getApplicationInfo(watchAppId, device, object : ConnectIQ.IQApplicationInfoListener {
          override fun onApplicationInfoReceived(app: IQApp) {
            promise.resolve(mapOf(
              "installed" to true,
              "version" to app.version(),
              "known" to true,
            ))
          }

          override fun onApplicationNotInstalled(applicationId: String) {
            promise.resolve(mapOf("installed" to false, "version" to 0, "known" to true))
          }
        })
      } catch (e: Exception) {
        promise.resolve(mapOf("installed" to false, "version" to 0, "known" to false))
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
      val iq = connectIQ
      val device = devices[deviceId]
      if (iq == null || device == null) { promise.resolve(false); return@AsyncFunction }
      try {
        iq.sendMessage(device, IQApp(watchAppId), mapOf("ack" to id)) { _, _, status ->
          promise.resolve(status == ConnectIQ.IQMessageStatus.SUCCESS)
        }
      } catch (e: Exception) {
        promise.resolve(false)
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
