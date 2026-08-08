package ai.dikestra.arkachat.ui

import android.Manifest
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import ai.dikestra.arkachat.viewmodel.ContactsViewModel
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import kotlinx.coroutines.launch
import java.util.concurrent.Executors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QRScannerScreen(
    onQRScanned: (String) -> Unit,
    onBackClick: () -> Unit,
    viewModel: ContactsViewModel = viewModel(factory = ContactsViewModel.Factory())
) {
    var hasCameraPermission by remember { mutableStateOf(false) }
    var isProcessing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan QR Code") },
                navigationIcon = {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary,
                    navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                )
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color.Black),
            contentAlignment = Alignment.Center
        ) {
            if (hasCameraPermission) {
                CameraPreviewWithScanner(
                    isProcessing = isProcessing,
                    onQRDetected = { rawValue ->
                        if (!isProcessing) {
                            scope.launch {
                                isProcessing = true
                                errorMessage = null
                                val result = viewModel.acceptInvitation(rawValue)
                                result.fold(
                                    onSuccess = { onQRScanned(rawValue) },
                                    onFailure = {
                                        errorMessage = it.message
                                        isProcessing = false
                                    }
                                )
                            }
                        }
                    }
                )

                // Viewfinder overlay
                Column(
                    modifier = Modifier.fillMaxSize(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(260.dp)
                            .border(2.dp, Color.White.copy(alpha = 0.8f), RoundedCornerShape(16.dp))
                    ) {
                        if (isProcessing) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.align(Alignment.Center)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    Text(
                        text = if (isProcessing) "Connecting..." else "Position QR code in the frame",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White,
                        textAlign = TextAlign.Center
                    )

                    errorMessage?.let { error ->
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFFFF6B6B),
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 32.dp)
                        )
                    }
                }
            } else {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(32.dp)
                ) {
                    Icon(
                        Icons.Default.CameraAlt,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = Color.White
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    Text(
                        text = "Camera permission required",
                        style = MaterialTheme.typography.titleMedium,
                        color = Color.White,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Please grant camera access to scan QR codes",
                        style = MaterialTheme.typography.bodyMedium,
                        color = Color.White.copy(alpha = 0.7f),
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    Button(onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }) {
                        Text("Grant Permission")
                    }
                }
            }
        }
    }
}

@Composable
private fun CameraPreviewWithScanner(
    isProcessing: Boolean,
    onQRDetected: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraExecutor = remember { Executors.newSingleThreadExecutor() }
    val reader = remember {
        MultiFormatReader().apply {
            setHints(mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                DecodeHintType.TRY_HARDER to true
            ))
        }
    }

    DisposableEffect(Unit) {
        onDispose { cameraExecutor.shutdown() }
    }

    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { ctx ->
            val previewView = PreviewView(ctx).apply {
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            }

            val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
            cameraProviderFuture.addListener({
                val cameraProvider = cameraProviderFuture.get()

                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }

                val imageAnalysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                    .also { analysis ->
                        analysis.setAnalyzer(cameraExecutor) { imageProxy ->
                            if (!isProcessing) {
                                decodeQR(imageProxy, reader, onQRDetected)
                            } else {
                                imageProxy.close()
                            }
                        }
                    }

                try {
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(
                        lifecycleOwner,
                        CameraSelector.DEFAULT_BACK_CAMERA,
                        preview,
                        imageAnalysis
                    )
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }, ContextCompat.getMainExecutor(ctx))

            previewView
        }
    )
}

private const val TAG = "QRScanner"
private var frameCount = 0

// PlanarYUVLuminanceSource.isRotateSupported = false, so ZXing bitmap rotation is a no-op.
// We must rotate the raw Y-plane bytes manually before creating the source.
private fun rotateYUV90CW(src: ByteArray, w: Int, h: Int): ByteArray {
    // Output dimensions: newW=h, newH=w
    val dst = ByteArray(src.size)
    for (y in 0 until h) {
        for (x in 0 until w) {
            dst[x * h + (h - 1 - y)] = src[y * w + x]
        }
    }
    return dst
}

private fun rotateYUV90CCW(src: ByteArray, w: Int, h: Int): ByteArray {
    val dst = ByteArray(src.size)
    for (y in 0 until h) {
        for (x in 0 until w) {
            dst[(w - 1 - x) * h + y] = src[y * w + x]
        }
    }
    return dst
}

private fun rotateYUV180(src: ByteArray, w: Int, h: Int): ByteArray {
    val dst = ByteArray(src.size)
    val total = w * h
    for (i in 0 until total) dst[i] = src[total - 1 - i]
    return dst
}

private fun decodeQR(
    imageProxy: ImageProxy,
    reader: MultiFormatReader,
    onQRDetected: (String) -> Unit
) {
    try {
        val plane = imageProxy.planes[0]
        val buffer = plane.buffer
        val rowStride = plane.rowStride
        val rawBytes = ByteArray(buffer.remaining())
        buffer.get(rawBytes)

        val rawW = imageProxy.width
        val rawH = imageProxy.height
        val rotation = imageProxy.imageInfo.rotationDegrees

        if (frameCount++ % 30 == 0) {
            Log.d(TAG, "frame: ${rawW}x${rawH} rot=${rotation}° rowStride=$rowStride bufLen=${rawBytes.size}")
        }

        // Compact row-padded buffer to tight rows before rotating
        val bytes: ByteArray
        val width: Int
        val height: Int
        if (rowStride == rawW) {
            bytes = rawBytes
            width = rawW
            height = rawH
        } else {
            // Strip row padding so rotation math is correct
            bytes = ByteArray(rawW * rawH)
            for (row in 0 until rawH) {
                rawBytes.copyInto(bytes, row * rawW, row * rowStride, row * rowStride + rawW)
            }
            width = rawW
            height = rawH
        }

        // Rotate raw bytes so the QR code is upright before ZXing sees it
        val (rotBytes, rotW, rotH) = when (rotation) {
            90  -> Triple(rotateYUV90CW(bytes, width, height),  height, width)
            180 -> Triple(rotateYUV180(bytes, width, height),   width,  height)
            270 -> Triple(rotateYUV90CCW(bytes, width, height), height, width)
            else -> Triple(bytes, width, height)
        }

        Log.d(TAG, "after rotate: ${rotW}x${rotH}")

        val source = PlanarYUVLuminanceSource(
            rotBytes, rotW, rotH, 0, 0, rotW, rotH, false
        )
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        val result = reader.decodeWithState(bitmap)
        Log.i(TAG, "DECODED: ${result.text}")
        onQRDetected(result.text)
    } catch (e: com.google.zxing.NotFoundException) {
        // Normal — no QR in this frame
    } catch (e: Exception) {
        Log.e(TAG, "decodeQR error: ${e.javaClass.simpleName}: ${e.message}")
    } finally {
        reader.reset()
        imageProxy.close()
    }
}
