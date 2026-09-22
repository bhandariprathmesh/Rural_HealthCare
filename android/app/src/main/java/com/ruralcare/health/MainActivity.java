package com.ruralcare.health;

import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private long lastVolumePressTime = 0;

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Intercept Double-Press of Volume Down or Volume Up for Rapid Emergency SOS
        if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN || keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
            long currentTime = System.currentTimeMillis();
            if (currentTime - lastVolumePressTime < 1000) {
                // Double press detected within 1 second!
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> {
                        getBridge().triggerWindowJSEvent("emergency:hardware_trigger");
                    });
                }
            }
            lastVolumePressTime = currentTime;
        }
        return super.onKeyDown(keyCode, event);
    }
}
