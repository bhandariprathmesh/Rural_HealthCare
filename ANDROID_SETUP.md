# RuralCare — Native Android Setup & Build Guide (Capacitor)

This repository operates as a **Hybrid architecture**:
1. **Web Deployment:** Continuously active on Vercel (`https://rural-health-care-roan.vercel.app`) and Render (`https://rural-healthcare-342y.onrender.com`).
2. **Native Android Shell:** Packaged via Capacitor (`com.ruralcare.health`) into a native Android APK/AAB.

---

## 1. Native Plugin Architecture & Wiring

Capacitor unlocks offline capabilities that web browsers cannot perform natively:

| Plugin | Purpose / Tier | Wired Into File | Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **`@capacitor/geolocation`** | **Tier 1: High-Accuracy GPS** | `src/services/nativeSosDispatcher.ts`<br>`src/App.tsx`<br>`src/screens/WorkerDashboard.tsx` | Obtains hardware GPS coordinates `(lat, lng)`. Falls back to browser HTML5 geolocation, then to user profile village name. |
| **`@byteowls/capacitor-sms`** | **Tier 2: Silent SMS Dispatch** | `src/services/nativeSosDispatcher.ts`<br>`src/screens/WorkerDashboard.tsx`<br>`src/App.tsx` | Triggers when cellular internet (REST) fails. Dispatches structured emergency SMS with Patient ID, GPS coordinates, and vitals to emergency dispatch (+919876543210). |
| **`@capacitor-community/bluetooth-le`** | **Tier 3: BLE Peer-to-Peer Relay** | `src/services/nativeSosDispatcher.ts`<br>`src/screens/WorkerDashboard.tsx`<br>`src/App.tsx` | Triggers when zero cellular/tower signal is present. Scans and advertises emergency SOS payloads to nearby RuralCare peer devices (tablets/phones). |
| **`@capacitor/local-notifications`** | **Tier 4: Offline Guidance Card** | `src/services/nativeSosDispatcher.ts` | Pops up an immediate offline first-aid and triage guidance notification to the worker/patient. |

---

## 2. Declared Android Permissions

The following permissions are configured in `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Core Network & Location -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Teleconsultation Audio & Video -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />

<!-- Emergency SOS Tier 2: Silent SMS Fallback -->
<uses-permission android:name="android.permission.SEND_SMS" />

<!-- Emergency SOS Tier 3: Bluetooth LE Peer Relay (Android 12+) -->
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Emergency SOS Tier 3: Bluetooth Legacy (Android 11 and below) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- Emergency SOS Tier 4: Local Notifications (Android 13+) -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

---

## 3. Important Testing Notice: Physical Device Required

> [!WARNING]
> **SMS and Bluetooth LE MUST be tested on a real physical Android device!**
> - **Android Virtual Devices (Emulators):** Emulators do not possess a cellular telephony baseband (cannot send SMS without third-party mock telnet setups) and lack a physical Bluetooth controller (cannot scan or advertise BLE packets).
> - **Testing Checklist on Physical Phone:**
>   1. Ensure a SIM card is present with SMS balance.
>   2. Turn on Bluetooth and Location services.
>   3. Disconnect Mobile Data and Wi-Fi to test the **Tier 2 (SMS)** and **Tier 3 (BLE Relay)** emergency fallbacks.

---

## 4. Setup & Build Commands

### Initial Setup & Sync
```bash
# 1. Install dependencies
npm install

# 2. Build the web distribution
npm run build

# 3. Synchronize native Android platform & plugins
npx cap sync android
```

### Building the APK via CLI
```bash
# Navigate to android directory
cd android

# Build debug APK using Gradle wrapper
./gradlew assembleDebug       # Linux / macOS
.\gradlew.bat assembleDebug   # Windows PowerShell

# Output APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

### Opening in Android Studio
```bash
npx cap open android
```
Inside Android Studio, press **Run 'app'** (`Shift + F10`) to deploy directly to a connected physical phone.
