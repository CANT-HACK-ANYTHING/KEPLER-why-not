#include "storage_manager.h"
#include <FS.h>
#include <SPIFFS.h>

#define RECEIPTS_LOG_PATH "/receipts.jsonl"
#define MAX_STORED_RECEIPTS 100

StorageManager::StorageManager() : _isMounted(false) {}

bool StorageManager::begin() {
    Serial.println("[Storage] Mounting SPIFFS flash filesystem...");
    if (!SPIFFS.begin(true)) {
        Serial.println("[Storage] ⚠ SPIFFS Mount Failed! Operating in RAM-buffered fallback mode.");
        _isMounted = false;
        return false;
    }

    _isMounted = true;
    Serial.printf("[Storage] ✓ SPIFFS Mounted successfully. Total: %u KB, Used: %u KB\n",
                  (unsigned int)(SPIFFS.totalBytes() / 1024),
                  (unsigned int)(SPIFFS.usedBytes() / 1024));

    loadIndexFromFlash();
    return true;
}

void StorageManager::loadIndexFromFlash() {
    _memoryIndex.clear();
    if (!_isMounted || !SPIFFS.exists(RECEIPTS_LOG_PATH)) return;

    File file = SPIFFS.open(RECEIPTS_LOG_PATH, "r");
    if (!file) return;

    while (file.available()) {
        String line = file.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) continue;

        // Parse format: [SYNCED|UNSYNCED]##SESSION_ID##{json}
        bool synced = line.startsWith("[SYNCED]");
        int firstDelim = line.indexOf("##");
        int secondDelim = line.indexOf("##", firstDelim + 2);

        if (firstDelim != -1 && secondDelim != -1) {
            String sessId = line.substring(firstDelim + 2, secondDelim);
            String jsonContent = line.substring(secondDelim + 2);

            StoredReceipt receipt;
            receipt.sessionId = sessId;
            receipt.rawJson = jsonContent;
            receipt.isSynced = synced;
            _memoryIndex.push_back(receipt);
        }
    }
    file.close();

    Serial.printf("[Storage] Loaded %d receipts from flash (%d pending Data Mule sync).\n",
                  (int)_memoryIndex.size(), (int)getUnsyncedCount());
}

void StorageManager::persistIndexToFlash() {
    if (!_isMounted) return;

    File file = SPIFFS.open(RECEIPTS_LOG_PATH, "w");
    if (!file) return;

    for (const auto &r : _memoryIndex) {
        String tag = r.isSynced ? "[SYNCED]##" : "[UNSYNCED]##";
        file.print(tag);
        file.print(r.sessionId);
        file.print("##");
        file.println(r.rawJson);
    }
    file.close();
}

bool StorageManager::saveReceipt(const String &sessionId, const String &receiptJson) {
    StoredReceipt r;
    r.sessionId = sessionId;
    r.rawJson = receiptJson;
    r.isSynced = false;

    // Maintain max circular buffer limit
    if (_memoryIndex.size() >= MAX_STORED_RECEIPTS) {
        _memoryIndex.erase(_memoryIndex.begin());
    }

    _memoryIndex.push_back(r);

    if (_isMounted) {
        File file = SPIFFS.open(RECEIPTS_LOG_PATH, "a");
        if (file) {
            file.printf("[UNSYNCED]##%s##%s\n", sessionId.c_str(), receiptJson.c_str());
            file.close();
        }
    }

    Serial.printf("[Storage] Stored receipt for session %s to flash. Total un-synced for mules: %d\n",
                  sessionId.c_str(), (int)getUnsyncedCount());
    return true;
}

String StorageManager::getUnsyncedReceiptsJsonBatch(int maxBatch) {
    String batch = "[";
    int count = 0;

    for (const auto &r : _memoryIndex) {
        if (!r.isSynced) {
            if (count > 0) batch += ",";
            batch += r.rawJson;
            count++;
            if (count >= maxBatch) break;
        }
    }
    batch += "]";
    return batch;
}

void StorageManager::markReceiptsSynced(const String &sessionId) {
    bool modified = false;
    for (auto &r : _memoryIndex) {
        if (sessionId == "ALL" || r.sessionId == sessionId) {
            r.isSynced = true;
            modified = true;
        }
    }
    if (modified) {
        persistIndexToFlash();
        Serial.printf("[Storage] Marked receipt(s) '%s' as SYNCED.\n", sessionId.c_str());
    }
}

size_t StorageManager::getUnsyncedCount() const {
    size_t count = 0;
    for (const auto &r : _memoryIndex) {
        if (!r.isSynced) count++;
    }
    return count;
}

void StorageManager::clearAll() {
    _memoryIndex.clear();
    if (_isMounted && SPIFFS.exists(RECEIPTS_LOG_PATH)) {
        SPIFFS.remove(RECEIPTS_LOG_PATH);
    }
    Serial.println("[Storage] All receipts cleared from flash.");
}
