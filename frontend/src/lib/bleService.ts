import {
  RELAY_SERVICE_UUID,
  TOKEN_WRITE_UUID,
  RECEIPT_NOTIFY_UUID,
  ChargingReceipt
} from "@/types/ble";

export class BleService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private tokenChar: BluetoothRemoteGATTCharacteristic | null = null;
  private receiptChar: BluetoothRemoteGATTCharacteristic | null = null;
  private receiptListener: ((event: Event) => void) | null = null;

  /**
   * Validates if the user's browser environment supports Web Bluetooth API
   */
  static isSupported(): boolean {
    if (typeof window === "undefined") return false;
    return typeof navigator !== "undefined" && "bluetooth" in navigator;
  }

  /**
   * Step 1: Prompt native pairing modal and connect to ESP32 GATT server
   */
  async connect(onDisconnected?: () => void): Promise<string> {
    if (!BleService.isSupported()) {
      throw new Error(
        "Web Bluetooth API is not supported in this browser. Please use Chrome, Edge, or Chrome for Android on HTTPS/localhost."
      );
    }

    try {
      console.log("[WebBLE] Prompting device selection dialog...");
      const nav = navigator as unknown as { bluetooth: Bluetooth };
      
      const device = await nav.bluetooth.requestDevice({
        filters: [
          { namePrefix: "RelayEV" },
          { namePrefix: "ESP32" }
        ],
        optionalServices: [RELAY_SERVICE_UUID]
      });

      this.device = device;

      if (onDisconnected) {
        device.addEventListener("gattserverdisconnected", onDisconnected);
      }

      console.log(`[WebBLE] Connecting to GATT server on ${device.name || "RelayEV Node"}...`);
      if (!device.gatt) {
        throw new Error("GATT server is not available on selected Bluetooth device.");
      }

      const server = await device.gatt.connect();
      this.server = server;

      console.log("[WebBLE] Discovering RelayEV Primary GATT Service...");
      const service = await server.getPrimaryService(RELAY_SERVICE_UUID);

      console.log("[WebBLE] Acquiring Token Write and Receipt Characteristics...");
      this.tokenChar = await service.getCharacteristic(TOKEN_WRITE_UUID);
      this.receiptChar = await service.getCharacteristic(RECEIPT_NOTIFY_UUID);

      console.log("[WebBLE] Connected successfully to RelayEV Node!");
      return device.name || "RelayEV ESP32";
    } catch (err: unknown) {
      console.error("[WebBLE] Connection failed:", err);
      throw err;
    }
  }

  /**
   * Step 2: Push backend-signed JWT session token to ESP32 to close the relay
   */
  async writeSessionToken(sessionToken: string): Promise<void> {
    if (!this.tokenChar) {
      throw new Error("Token characteristic not initialized. Connect to the charger first.");
    }

    console.log("[WebBLE] Writing session token to ESP32 characteristic...");
    const encoder = new TextEncoder();
    const tokenBytes = encoder.encode(sessionToken);

    // Write with response to guarantee the ESP32 received and acknowledged the escrow voucher
    await this.tokenChar.writeValueWithResponse(tokenBytes);
    console.log("[WebBLE] Token written. ESP32 relay energized, charging started!");
  }

  /**
   * Step 3: Subscribe to final charging receipt via GATT notifications
   */
  async subscribeReceipt(onReceiptReceived: (receipt: ChargingReceipt) => void): Promise<void> {
    if (!this.receiptChar) {
      throw new Error("Receipt characteristic not initialized.");
    }

    console.log("[WebBLE] Subscribing to receipt notifications...");
    await this.receiptChar.startNotifications();

    this.receiptListener = (event: Event) => {
      const target = event.target as unknown as { value: DataView };
      const value = target.value;
      const decoder = new TextDecoder("utf-8");
      const jsonStr = decoder.decode(value);

      console.log("[WebBLE] Received raw receipt notification:", jsonStr);
      try {
        const receipt: ChargingReceipt = JSON.parse(jsonStr);
        onReceiptReceived(receipt);
      } catch (e) {
        console.error("[WebBLE] Failed to parse charging receipt JSON:", e);
      }
    };

    this.receiptChar.addEventListener("characteristicvaluechanged", this.receiptListener);
  }

  /**
   * Fallback: Read final receipt directly from GATT memory
   */
  async readReceipt(): Promise<ChargingReceipt> {
    if (!this.receiptChar) {
      throw new Error("Receipt characteristic not initialized.");
    }

    console.log("[WebBLE] Reading receipt characteristic value...");
    const dataView = await this.receiptChar.readValue();
    const decoder = new TextDecoder("utf-8");
    const jsonStr = decoder.decode(dataView);
    return JSON.parse(jsonStr);
  }

  /**
   * Disconnect and clean up event listeners
   */
  disconnect(): void {
    if (this.receiptChar && this.receiptListener) {
      this.receiptChar.removeEventListener("characteristicvaluechanged", this.receiptListener);
      this.receiptListener = null;
    }

    if (this.server && this.server.connected) {
      console.log("[WebBLE] Disconnecting from GATT server...");
      this.server.disconnect();
    }

    this.device = null;
    this.server = null;
    this.tokenChar = null;
    this.receiptChar = null;
  }
}
