#pragma once

#include <Arduino.h>
#include <vector>

struct StoredReceipt {
    String sessionId;
    String rawJson;
    bool isSynced;
};

class StorageManager {
public:
    StorageManager();

    /**
     * Mounts SPIFFS/LittleFS flash partition
     */
    bool begin();

    /**
     * Appends a newly signed charging receipt to persistent flash memory
     */
    bool saveReceipt(const String &sessionId, const String &receiptJson);

    /**
     * Retrieves all pending unsynced receipts for Drive-By Data Mules
     */
    String getUnsyncedReceiptsJsonBatch(int maxBatch = 10);

    /**
     * Marks a list of session receipts as synced after mule upload acknowledgment
     */
    void markReceiptsSynced(const String &sessionId);

    /**
     * Returns total count of stranded offline receipts waiting for a Data Mule
     */
    size_t getUnsyncedCount() const;

    /**
     * Clears all receipts (factory reset)
     */
    void clearAll();

private:
    bool _isMounted;
    std::vector<StoredReceipt> _memoryIndex;

    void loadIndexFromFlash();
    void persistIndexToFlash();
};
