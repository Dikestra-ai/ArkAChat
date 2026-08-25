package ai.dikestra.arkachat

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.RelativeLayout
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var progressBar: ProgressBar

    // 10.0.2.2 = host machine localhost from inside the Android emulator
    private val webAppUrl = "http://10.0.2.2:3003/chat"
    private val nitrogenUrl = "http://10.0.2.2:8000/chats"

    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        filePathCallback?.onReceiveValue(uris.toTypedArray())
        filePathCallback = null
    }

    private val cameraPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* WebView handles the result via its own permission request */ }

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* optional */ }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Chat content and QR/pairing screens are rendered in this window:
        // block screenshots, screen recording, and the recents thumbnail.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }

        // Build layout programmatically — no XML needed
        val root = RelativeLayout(this).also { setContentView(it) }

        swipeRefresh = SwipeRefreshLayout(this).apply {
            id = View.generateViewId()
            setColorSchemeColors(0xFF2563EB.toInt())
            root.addView(this, RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT,
                RelativeLayout.LayoutParams.MATCH_PARENT
            ))
        }

        // Remote WebView debugging exposes DOM/JS (and the ArkA bridge) to any
        // ADB-attached host — never enable it in release builds.
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true) // chrome://inspect, debug only
        }

        webView = WebView(this).apply {
            swipeRefresh.addView(this)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                // The app loads only http(s) app origins — no file:// content.
                allowFileAccess = false
                mediaPlaybackRequiresUserGesture = false
                // Never silently mix cleartext subresources into the page.
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                cacheMode = WebSettings.LOAD_DEFAULT
                @Suppress("DEPRECATION")
                setSupportMultipleWindows(false)
            }
            scrollBarStyle = View.SCROLLBARS_INSIDE_OVERLAY
            addJavascriptInterface(ArkABridge(this@MainActivity), "ArkA")
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            id = View.generateViewId()
            max = 100
            val lp = RelativeLayout.LayoutParams(
                RelativeLayout.LayoutParams.MATCH_PARENT, 8
            )
            lp.addRule(RelativeLayout.ALIGN_PARENT_TOP)
            root.addView(this, lp)
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                swipeRefresh.isRefreshing = false
                progressBar.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView, url: String) {
                progressBar.visibility = View.GONE
                title = view.title ?: "ArkAChat"
            }

            override fun onReceivedError(
                view: WebView, request: WebResourceRequest, error: WebResourceError
            ) {
                if (request.isForMainFrame) {
                    Log.w("ArkAChat", "WebView error ${error.errorCode}: ${error.description}")
                    // Primary failed — try Nitrogen fallback
                    if (request.url.toString().startsWith("http://10.0.2.2:3003")) {
                        Log.i("ArkAChat", "Falling back to Nitrogen at $nitrogenUrl")
                        view.loadUrl(nitrogenUrl)
                    }
                }
            }

            @SuppressLint("WebViewClientOnReceivedSslError")
            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
                // Only proceed for localhost (dev cert issues in emulator)
                val host = error.url?.let { Uri.parse(it).host } ?: ""
                if (host == "10.0.2.2" || host == "localhost" || host == "127.0.0.1") {
                    handler.proceed()
                } else {
                    handler.cancel()
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress == 100) progressBar.visibility = View.GONE
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                // Deny-by-default. Only the camera may ever be granted, and
                // only to the trusted app origin, and only once the OS-level
                // permission has actually been granted. Everything else
                // (microphone, protected media, ...) is always denied.
                val wantsCameraOnly = request.resources.size == 1 &&
                    request.resources[0] == PermissionRequest.RESOURCE_VIDEO_CAPTURE

                if (!wantsCameraOnly || !isTrustedOrigin(request.origin)) {
                    request.deny()
                    return
                }

                if (ContextCompat.checkSelfPermission(
                        this@MainActivity, Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED
                ) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    // Ask the OS but do NOT grant now; the page can re-request
                    // after the user has granted the OS permission.
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                    request.deny()
                }
            }

            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams
            ): Boolean {
                filePathCallback = callback
                filePickerLauncher.launch("*/*")
                return true
            }
        }

        swipeRefresh.setOnRefreshListener { webView.reload() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack()
                else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(webAppUrl)
        }
    }

    /**
     * A page origin is trusted only if it exactly matches (scheme, host, port)
     * of one of the two configured app origins. Web permission grants
     * (camera) are restricted to these origins.
     */
    private fun isTrustedOrigin(origin: Uri?): Boolean {
        if (origin == null) return false
        val trusted = listOf(Uri.parse(webAppUrl), Uri.parse(nitrogenUrl))
        return trusted.any { app ->
            origin.scheme == app.scheme &&
                origin.host == app.host &&
                origin.port == app.port
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }
}
