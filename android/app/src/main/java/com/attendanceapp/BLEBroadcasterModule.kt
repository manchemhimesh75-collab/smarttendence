package com.attendanceapp

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import androidx.core.content.ContextCompat

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

import org.json.JSONObject

import java.nio.charset.StandardCharsets
import java.util.Collections
import java.util.UUID

/**
 * BLEBroadcasterModule — React Native native module for BLE-based
 * attendance broadcasting and scanning.
 *
 * New Protocol (v2):
 *   Service UUID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
 *   Payload: Base64-encoded JSON with fields:
 *     - protocolVersion: 1
 *     - payloadVersion: 1
 *     - sessionId: string
 *     - studentId: string
 *     - pinWindow: int
 *     - timestamp: long
 *     - nonce: string (32 hex chars)
 *     - signature: string (base64url)
 *     - publicKey: string (base64url)
 *   Advertising interval: ADVERTISE_MODE_LOW_LATENCY (~100 ms)
 */
class BLEBroadcasterModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val MODULE_NAME = "BLEBroadcasterModule"

        // BLE protocol constants - New v2 protocol
        const val SERVICE_UUID_STR = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        const val SERVICE_UUID = UUID.fromString(SERVICE_UUID_STR)

        // Events emitted to React Native JS layer
        const val EVENT_ATTENDANCE_RECEIVED = "onAttendanceReceived"
        const val EVENT_SCAN_ERROR = "onScanError"
        const val EVENT_BLUETOOTH_STATE_CHANGE = "onBluetoothStateChange"
    }

    // ── Bluetooth handles ────────────────────────────────────────────
    private var bluetoothAdapter: BluetoothAdapter? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var scanner: BluetoothLeScanner? = null

    private var advertiseCallback: AdvertiseCallback? = null
    private var scanCallback: ScanCallback? = null

    @Volatile
    private var isAdvertising = false

    @Volatile
    private var isScanning = false

    /** Set of nonces already emitted during the current scan session. */
    private val seenNonces: MutableSet<String> =
        Collections.synchronizedSet(mutableSetOf())

    override fun getName(): String = MODULE_NAME

    // ─────────────────────────────────────────────────────────────────
    //  Bluetooth Initialization Helpers
    // ─────────────────────────────────────────────────────────────────

    /**
     * Ensures the BluetoothAdapter is available and enabled.
     * Returns null and rejects the promise if not.
     */
    private fun ensureBluetoothReady(promise: Promise): BluetoothAdapter? {
        val ctx = reactApplicationContext
        val bluetoothManager =
            ctx.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        if (bluetoothManager == null) {
            promise.reject("ERR_BLE_UNAVAILABLE", "BluetoothManager is not available on this device")
            return null
        }

        val adapter = bluetoothManager.adapter
        if (adapter == null) {
            promise.reject("ERR_BLE_UNAVAILABLE", "Bluetooth is not supported on this device")
            return null
        }

        if (!adapter.isEnabled) {
            promise.reject(
                "ERR_BLE_DISABLED",
                "Bluetooth is turned off. Enable it before using BLE features."
            )
            return null
        }

        bluetoothAdapter = adapter
        return adapter
    }

    /**
     * Checks that the required BLE runtime permissions are granted.
     * On Android 12+ (API 31), BLUETOOTH_ADVERTISE and BLUETOOTH_SCAN are needed.
     * On older versions, ACCESS_FINE_LOCATION is required for scanning.
     */
    private fun checkPermissions(forAdvertise: Boolean, forScan: Boolean, promise: Promise): Boolean {
        val ctx = reactApplicationContext
        val missing = mutableListOf<String>()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+
            if (forAdvertise && ContextCompat.checkSelfPermission(
                    ctx, Manifest.permission.BLUETOOTH_ADVERTISE
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                missing.add("BLUETOOTH_ADVERTISE")
            }
            if (forScan && ContextCompat.checkSelfPermission(
                    ctx, Manifest.permission.BLUETOOTH_SCAN
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                missing.add("BLUETOOTH_SCAN")
            }
            // BLUETOOTH_CONNECT may be needed for some operations
            if (forScan && ContextCompat.checkSelfPermission(
                    ctx, Manifest.permission.BLUETOOTH_CONNECT
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                missing.add("BLUETOOTH_CONNECT")
            }
        } else {
            // Pre-Android 12: location permission required for BLE scanning
            if (forScan && ContextCompat.checkSelfPermission(
                    ctx, Manifest.permission.ACCESS_FINE_LOCATION
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                missing.add("ACCESS_FINE_LOCATION")
            }
        }

        if (missing.isNotEmpty()) {
            promise.reject(
                "ERR_PERMISSION_DENIED",
                "Missing permissions: ${missing.joinToString(", ")}. " +
                    "Request them from the JS layer before calling this method."
            )
            return false
        }
        return true
    }

    // ─────────────────────────────────────────────────────────────────
    //  Payload Encoding / Decoding (Base64 JSON)
    // ─────────────────────────────────────────────────────────────────

    private fun encodePayload(payload: String): ByteArray {
        return payload.toByteArray(StandardCharsets.UTF_8)
    }

    private fun decodePayload(bytes: ByteArray): JSONObject? {
        return try {
            val str = String(bytes, StandardCharsets.UTF_8)
            JSONObject(str)
        } catch (e: Exception) {
            Log.w("BLEBroadcaster", "Failed to decode payload: ${e.message}")
            null
        }
    }

    private fun validatePayload(json: JSONObject): Boolean {
        return try {
            json.has("protocolVersion") &&
            json.getInt("protocolVersion") == 1 &&
            json.has("payloadVersion") &&
            json.getInt("payloadVersion") == 1 &&
            json.has("sessionId") &&
            json.getString("sessionId").isNotEmpty() &&
            json.has("studentId") &&
            json.getString("studentId").isNotEmpty() &&
            json.has("pinWindow") &&
            json.has("timestamp") &&
            json.has("nonce") &&
            json.getString("nonce").length == 32 &&
            json.has("signature") &&
            json.getString("signature").isNotEmpty() &&
            json.has("publicKey") &&
            json.getString("publicKey").isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  startBroadcasting (accepts JSON string)
    // ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun startBroadcasting(payloadJson: String, promise: Promise) {
        if (isAdvertising) {
            promise.reject("ERR_ALREADY_ADVERTISING", "BLE advertising is already active")
            return
        }

        // Validate payload
        val payloadObj = try {
            JSONObject(payloadJson)
        } catch (e: Exception) {
            promise.reject("ERR_INVALID_PAYLOAD", "Invalid JSON payload: ${e.message}", e)
            return
        }

        if (!validatePayload(payloadObj)) {
            promise.reject("ERR_INVALID_PAYLOAD", "Payload validation failed: missing or invalid fields")
            return
        }

        val adapter = ensureBluetoothReady(promise) ?: return
        if (!checkPermissions(forAdvertise = true, forScan = false, promise = promise)) return

        val leAdvertiser = adapter.bluetoothLeAdvertiser
        if (leAdvertiser == null) {
            promise.reject(
                "ERR_BLE_ADVERTISER",
                "BLE Advertiser is not available. The device may not support BLE peripheral mode."
            )
            return
        }

        val payloadBytes = encodePayload(payloadJson)
        
        // Check payload size (BLE MTU limit ~251 bytes for advertising data)
        if (payloadBytes.size > 200) {
            promise.reject("ERR_PAYLOAD_TOO_LARGE", "Encoded payload too large for BLE advertising: ${payloadBytes.size} bytes")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)  // ~100 ms interval
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(false)
            .setTimeout(0)  // Advertise indefinitely until stopped
            .build()

        // Use Service UUID in advertising data
        val serviceUuid = ParcelUuid(SERVICE_UUID)
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceUuid(serviceUuid)
            .addServiceData(serviceUuid, payloadBytes)
            .build()

        val callback = object : AdvertiseCallback() {
            override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
                isAdvertising = true
                advertiser = leAdvertiser
                promise.resolve(null)
            }

            override fun onStartFailure(errorCode: Int) {
                isAdvertising = false
                val errorMsg = when (errorCode) {
                    ADVERTISE_FAILED_DATA_TOO_LARGE ->
                        "Advertise data is too large"
                    ADVERTISE_FAILED_TOO_MANY_ADVERTISERS ->
                        "Too many concurrent advertisers"
                    ADVERTISE_FAILED_ALREADY_STARTED ->
                        "Advertising has already started"
                    ADVERTISE_FAILED_INTERNAL_ERROR ->
                        "Internal BLE advertiser error"
                    ADVERTISE_FAILED_FEATURE_UNSUPPORTED ->
                        "BLE advertising is not supported on this device"
                    else ->
                        "Unknown advertise error (code $errorCode)"
                }
                promise.reject("ERR_ADVERTISE_FAILED", errorMsg)
            }
        }

        advertiseCallback = callback

        try {
            leAdvertiser.startAdvertising(settings, data, callback)
        } catch (e: SecurityException) {
            promise.reject("ERR_PERMISSION_DENIED", "BLE advertising permission denied", e)
        }
    }

    // ─────────────────────────────────────────────────────────────────
    //  stopBroadcasting
    // ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun stopBroadcasting(promise: Promise) {
        if (!isAdvertising) {
            promise.reject("ERR_NOT_ADVERTISING", "BLE advertising is not active")
            return
        }

        try {
            advertiseCallback?.let { cb ->
                advertiser?.stopAdvertising(cb)
            }
        } catch (e: SecurityException) {
            promise.reject("ERR_PERMISSION_DENIED", "BLE advertising permission denied during stop", e)
            return
        } catch (e: Exception) {
            promise.reject("ERR_STOP_ADVERTISING", "Failed to stop advertising: ${e.message}", e)
            return
        } finally {
            isAdvertising = false
            advertiseCallback = null
            advertiser = null
        }

        promise.resolve(null)
    }

    // ─────────────────────────────────────────────────────────────────
    //  startScanning
    // ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun startScanning(promise: Promise) {
        if (isScanning) {
            promise.reject("ERR_ALREADY_SCANNING", "BLE scanning is already active")
            return
        }

        val adapter = ensureBluetoothReady(promise) ?: return
        if (!checkPermissions(forAdvertise = false, forScan = true, promise = promise)) return

        val leScanner = adapter.bluetoothLeScanner
        if (leScanner == null) {
            promise.reject(
                "ERR_BLE_SCANNER",
                "BLE Scanner is not available. Bluetooth may have just been turned off."
            )
            return
        }

        // Reset de-duplication set for this scan session
        seenNonces.clear()

        // Filter by our service UUID
        val scanFilter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(SERVICE_UUID))
            .build()

        val scanSettings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)  // Report results immediately
            .setLegacy(false)   // Use extended advertising if available
            .build()

        val callback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                result ?: return
                handleScanResult(result)
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>?) {
                results?.forEach { handleScanResult(it) }
            }

            override fun onScanFailed(errorCode: Int) {
                val errorMsg = when (errorCode) {
                    SCAN_FAILED_ALREADY_STARTED ->
                        "Scan already started"
                    SCAN_FAILED_APPLICATION_REGISTRATION_FAILED ->
                        "Application registration failed"
                    SCAN_FAILED_INTERNAL_ERROR ->
                        "Internal BLE scanner error"
                    SCAN_FAILED_FEATURE_UNSUPPORTED ->
                        "BLE scanning feature unsupported"
                    else ->
                        "Unknown scan error (code $errorCode)"
                }
                Log.e("BLEBroadcaster", "Scan failed: $errorMsg")
                
                // Emit a scan error event so JS can react
                val params: WritableMap = Arguments.createMap()
                params.putString("error", errorMsg)
                params.putInt("errorCode", errorCode)
                reactApplicationContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit(EVENT_SCAN_ERROR, params)
            }
        }

        scanCallback = callback
        scanner = leScanner

        try {
            leScanner.startScan(listOf(scanFilter), scanSettings, callback)
        } catch (e: SecurityException) {
            promise.reject("ERR_PERMISSION_DENIED", "BLE scan permission denied", e)
            return
        }

        isScanning = true
        promise.resolve(null)
    }

    /**
     * Processes a single BLE scan result: extracts the service data payload,
     * decodes it, validates it, de-duplicates by nonce, and emits the event.
     */
    private fun handleScanResult(result: ScanResult) {
        val scanRecord = result.scanRecord ?: return
        
        // Get service data for our UUID
        val serviceData = scanRecord.getServiceData(ParcelUuid(SERVICE_UUID)) ?: return
        
        val decoded = decodePayload(serviceData) ?: return
        
        if (!validatePayload(decoded)) {
            return
        }

        val nonce = decoded.getString("nonce") ?: return
        
        // De-duplicate: only emit once per nonce per scan session
        if (!seenNonces.add(nonce)) {
            return
        }

        // Add RSSI and device address to the event
        try {
            decoded.put("rssi", result.rssi)
            decoded.put("deviceAddress", result.device.address)
        } catch (e: SecurityException) {
            decoded.put("deviceAddress", "unknown")
        } catch (e: Exception) {
            // Ignore JSON put errors
        }

        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(EVENT_ATTENDANCE_RECEIVED, decoded)
    }

    // ─────────────────────────────────────────────────────────────────
    //  stopScanning
    // ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun stopScanning(promise: Promise) {
        if (!isScanning) {
            promise.reject("ERR_NOT_SCANNING", "BLE scanning is not active")
            return
        }

        try {
            scanCallback?.let { cb ->
                scanner?.stopScan(cb)
            }
        } catch (e: SecurityException) {
            promise.reject("ERR_PERMISSION_DENIED", "BLE scan permission denied during stop", e)
            return
        } catch (e: Exception) {
            promise.reject("ERR_STOP_SCANNING", "Failed to stop scanning: ${e.message}", e)
            return
        } finally {
            isScanning = false
            scanCallback = null
            scanner = null
            seenNonces.clear()
        }

        promise.resolve(null)
    }

    // ─────────────────────────────────────────────────────────────────
    //  React Native event listener bookkeeping
    // ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // Required by React Native's NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // Required by React Native's NativeEventEmitter
    }
}