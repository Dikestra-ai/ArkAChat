---
id: frontend-008
title: "QR Code Contact Pairing Flow"
status: done
priority: high
tags: [android, web, qr-code, pairing, ux]
dependencies: [frontend-006, frontend-007]
assignee: developer
created: 2026-01-20T21:00:00Z
estimate: 3h
complexity: 2
area: frontend
---

# QR Code Contact Pairing Flow

## Context
Implement the complete user flow for adding contacts via QR code scanning.
This combines Shield key exchange with SimpleX queue creation.

## Objectives
- Seamless QR code generation and scanning
- Clear user feedback during pairing process
- Handle pairing errors gracefully
- Support both camera scanning and image upload

## Tasks
- [ ] Design pairing flow UI/UX
- [ ] Android: Implement camera-based QR scanner
- [ ] Android: Implement QR code generation screen
- [ ] Web: Implement webcam-based QR scanner
- [ ] Web: Implement QR code generation component
- [ ] Add loading states during pairing
- [ ] Add success/error feedback
- [ ] Handle duplicate contact detection
- [ ] Support QR code image upload (gallery)

## User Flow

### Initiator (Creating Invitation)
1. User taps "Add Contact" button
2. User enters their display name (or uses default)
3. App generates QR code containing:
   - SimpleX invitation URI (with queue address)
   - Shield public key for encryption
   - Display name
   - Timestamp
4. QR code displayed with "Share" option
5. Waits for responder to scan

### Responder (Scanning Invitation)
1. User taps "Scan QR Code" button
2. Camera opens with scanning frame
3. User scans initiator's QR code
4. App parses invitation data
5. App shows confirmation: "Add [Name] as contact?"
6. User confirms
7. App creates reciprocal connection:
   - Subscribes to initiator's queue
   - Creates own queue for receiving
   - Exchanges Shield keys
8. Contact added, chat opens

### Pairing Complete
- Both parties now have:
  - Each other's SimpleX queue addresses
  - Shared Shield encryption keys
  - Forward secrecy via RatchetSession

## Technical Details

### Android Implementation
```kotlin
// QRScannerScreen.kt
@Composable
fun QRScannerScreen(
    onQRScanned: (String) -> Unit,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            launcher.launch(Manifest.permission.CAMERA)
        }
    }

    if (hasCameraPermission) {
        CameraPreview(
            onQRDetected = onQRScanned,
            lifecycleOwner = lifecycleOwner
        )
    } else {
        PermissionDeniedContent(onRequestPermission = {
            launcher.launch(Manifest.permission.CAMERA)
        })
    }
}

// Using ML Kit for QR detection
@Composable
fun CameraPreview(
    onQRDetected: (String) -> Unit,
    lifecycleOwner: LifecycleOwner
) {
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    val barcodeScanner = remember { BarcodeScanning.getClient() }

    AndroidView(
        factory = { ctx ->
            PreviewView(ctx).apply {
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            }
        },
        modifier = Modifier.fillMaxSize()
    ) { previewView ->
        cameraProviderFuture.addListener({
            val cameraProvider = cameraProviderFuture.get()

            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }

            val imageAnalyzer = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
                .also { analysis ->
                    analysis.setAnalyzer(Executors.newSingleThreadExecutor()) { imageProxy ->
                        processImage(imageProxy, barcodeScanner, onQRDetected)
                    }
                }

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                imageAnalyzer
            )
        }, ContextCompat.getMainExecutor(context))
    }
}
```

### Web Implementation
```typescript
// AddContactModal.tsx
export function AddContactModal({ isOpen, onClose }: Props) {
    const [mode, setMode] = useState<'choose' | 'generate' | 'scan'>('choose');
    const [invitation, setInvitation] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { createInvitation, acceptInvitation } = useChatBridge();

    const handleGenerate = async () => {
        setIsLoading(true);
        try {
            const inv = await createInvitation('My Name');
            setInvitation(inv);
            setMode('generate');
        } finally {
            setIsLoading(false);
        }
    };

    const handleScan = async (qrData: string) => {
        setIsLoading(true);
        try {
            const contact = await acceptInvitation(qrData);
            if (contact) {
                toast.success(`Added ${contact.displayName} as contact`);
                onClose();
            }
        } catch (error) {
            toast.error('Failed to add contact');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            {mode === 'choose' && (
                <div className="space-y-4">
                    <h2>Add Contact</h2>
                    <Button onClick={handleGenerate}>
                        Show My QR Code
                    </Button>
                    <Button onClick={() => setMode('scan')}>
                        Scan QR Code
                    </Button>
                </div>
            )}
            {mode === 'generate' && invitation && (
                <QRGenerator data={invitation} />
            )}
            {mode === 'scan' && (
                <QRScanner onScan={handleScan} />
            )}
            {isLoading && <LoadingOverlay />}
        </Modal>
    );
}
```

## Error Handling
- Invalid QR code format → Show "Invalid QR code" message
- Expired invitation → Show "Invitation expired" message
- Network error → Show "Network error, please try again"
- Duplicate contact → Show "Contact already exists"
- Camera permission denied → Show permission request UI

## Acceptance Criteria
- [ ] QR code generates within 1 second
- [ ] QR scanning works in various lighting conditions
- [ ] Pairing completes within 5 seconds on good network
- [ ] Clear loading states during pairing
- [ ] Error messages are user-friendly
- [ ] Works on both Android and Web
