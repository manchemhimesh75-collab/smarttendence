import Foundation
import CoreBluetooth

@objc(BLEBroadcaster)
class BLEBroadcasterModule: RCTEventEmitter, CBPeripheralManagerDelegate, CBCentralManagerDelegate {

    private var peripheralManager: CBPeripheralManager?
    private var centralManager: CBCentralManager?
    
    // New Protocol v2 - 128-bit Service UUID
    private let serviceUUID = CBUUID(string: "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    
    private var isBroadcasting = false
    private var isScanning = false
    
    private var pendingBroadcastData: [String: Any]?
    private var seenNonces: Set<String> = []
    private var pendingScanResolve: RCTPromiseResolveBlock?
    private var pendingScanReject: RCTPromiseRejectBlock?
    private var pendingBroadcastResolve: RCTPromiseResolveBlock?
    private var pendingBroadcastReject: RCTPromiseRejectBlock?

    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String]! {
        return ["onAttendanceReceived", "onScanError", "onBluetoothStateChange"]
    }
    
    // MARK: - Broadcasting (Student)
    
    @objc
    func startBroadcasting(_ payloadJson: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        // Validate JSON payload
        guard let payloadData = payloadJson.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
              validatePayload(json) else {
            reject("ERR_INVALID_PAYLOAD", "Invalid JSON payload", nil)
            return
        }
        
        pendingBroadcastResolve = resolve
        pendingBroadcastReject = reject
        
        // Prepare advertising data with service UUID and service data
        pendingBroadcastData = [
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
            CBAdvertisementDataServiceDataKey: [serviceUUID: payloadData]
        ]
        
        // Lazy Initialization
        if peripheralManager == nil {
            peripheralManager = CBPeripheralManager(delegate: self, queue: nil)
        } else if peripheralManager?.state == .poweredOn {
            startActualBroadcasting()
        }
    }
    
    @objc
    func stopBroadcasting(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        peripheralManager?.stopAdvertising()
        isBroadcasting = false
        resolve(nil)
    }
    
    private func startActualBroadcasting() {
        if let data = pendingBroadcastData, !isBroadcasting {
            peripheralManager?.startAdvertising(data)
            isBroadcasting = true
        }
    }
    
    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            if pendingBroadcastData != nil {
                startActualBroadcasting()
            }
            if isScanning && pendingScanResolve != nil {
                startActualScanning()
            }
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "poweredOn"])
        case .unsupported:
            print("BLE is unsupported on this device (e.g. Simulator).")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unsupported"])
            if let reject = pendingBroadcastReject {
                reject("ERR_BLE_UNSUPPORTED", "BLE is unsupported on this device", nil)
                pendingBroadcastReject = nil
            }
            if let reject = pendingScanReject {
                reject("ERR_BLE_UNSUPPORTED", "BLE is unsupported on this device", nil)
                pendingScanReject = nil
            }
        case .unauthorized:
            print("BLE unauthorized")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unauthorized"])
        case .poweredOff:
            print("BLE powered off")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "poweredOff"])
        case .resetting:
            print("BLE resetting")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "resetting"])
        case .unknown:
            print("BLE unknown state")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unknown"])
        @unknown default:
            print("BLE unknown state")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unknown"])
        }
    }
    
    func peripheralManager(_ peripheral: CBPeripheralManager, didStartAdvertising error: Error?) {
        if let error = error {
            print("Failed to start advertising: \(error)")
            pendingBroadcastReject?("ERR_ADVERTISE_FAILED", error.localizedDescription, error)
        } else {
            print("Advertising started successfully")
            pendingBroadcastResolve?(nil)
        }
        pendingBroadcastResolve = nil
        pendingBroadcastReject = nil
    }
    
    // MARK: - Scanning (Faculty)
    
    @objc
    func startScanning(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        pendingScanResolve = resolve
        pendingScanReject = reject
        seenNonces.removeAll()
        
        // Lazy Initialization
        if centralManager == nil {
            centralManager = CBCentralManager(delegate: self, queue: nil)
        } else if centralManager?.state == .poweredOn {
            startActualScanning()
        }
    }
    
    @objc
    func stopScanning(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        centralManager?.stopScan()
        isScanning = false
        resolve(nil)
    }
    
    private func startActualScanning() {
        if !isScanning {
            centralManager?.scanForPeripherals(withServices: [serviceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
            isScanning = true
        }
    }
    
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            if isScanning && pendingScanResolve != nil {
                startActualScanning()
            }
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "poweredOn"])
        case .unsupported:
            print("BLE Scanning is unsupported on this device.")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unsupported"])
            if let reject = pendingScanReject {
                reject("ERR_BLE_UNSUPPORTED", "BLE is unsupported on this device", nil)
                pendingScanReject = nil
            }
        case .unauthorized:
            print("BLE unauthorized")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unauthorized"])
        case .poweredOff:
            print("BLE powered off")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "poweredOff"])
        case .resetting:
            print("BLE resetting")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "resetting"])
        case .unknown:
            print("BLE unknown state")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unknown"])
        @unknown default:
            print("BLE unknown state")
            sendEvent(withName: "onBluetoothStateChange", body: ["state": "unknown"])
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        // Get service data for our UUID
        guard let serviceDataDict = advertisementData[CBAdvertisementDataServiceDataKey] as? [CBUUID: Data],
              let serviceData = serviceDataDict[serviceUUID],
              let json = try? JSONSerialization.jsonObject(with: serviceData) as? [String: Any],
              validatePayload(json) else {
            return
        }
        
        guard let nonce = json["nonce"] as? String, nonce.count == 32 else { return }
        
        // De-duplicate: only emit once per nonce per scan session
        if !seenNonces.insert(nonce).inserted {
            return
        }
        
        // Add RSSI and device address
        var enrichedJson = json
        enrichedJson["rssi"] = RSSI.intValue
        enrichedJson["deviceAddress"] = peripheral.identifier.uuidString
        
        self.sendEvent(withName: "onAttendanceReceived", body: enrichedJson)
    }
    
    private func validatePayload(_ json: [String: Any]) -> Bool {
        guard json["protocolVersion"] as? Int == 1,
              json["payloadVersion"] as? Int == 1,
              let sessionId = json["sessionId"] as? String, !sessionId.isEmpty,
              let studentId = json["studentId"] as? String, !studentId.isEmpty,
              json["pinWindow"] as? Int != nil,
              json["timestamp"] as? Int64 != nil,
              let nonce = json["nonce"] as? String, nonce.count == 32,
              let signature = json["signature"] as? String, !signature.isEmpty,
              let publicKey = json["publicKey"] as? String, !publicKey.isEmpty else {
            return false
        }
        return true
    }
}