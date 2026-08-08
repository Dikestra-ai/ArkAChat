package ai.dikestra.arkachat

import android.content.Context
import android.webkit.JavascriptInterface
import android.widget.Toast

class ArkABridge(private val context: Context) {

    @JavascriptInterface
    fun showToast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun getPlatform(): String = "android"

    @JavascriptInterface
    fun getAppVersion(): String = "1.0.0"
}
