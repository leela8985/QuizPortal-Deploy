/**
 * Proctoring System for QuizPortal
 * Features: Face verification, Multiple faces detection, Tab switching detection (already in system?),
 * Unauthorized user detection, real-time monitoring.
 */

const PROCTOR_CONFIG = {
    MODEL_URL: 'https://justadudewhohacks.github.io/face-api.js/models',
    MATCH_THRESHOLD: 0.6,
    CHECK_INTERVAL: 1500, // Check slightly faster
    MAX_VIOLATIONS: 3,     // Be slightly more lenient
    DETECTION_SCORE: 0.4,   // Threshold for detection
    AUDIO_THRESHOLD: 0.15, // Volume threshold (0 to 1)
    AUDIO_CHECK_MS: 500    // Frequency of audio check
};

let proctorState = {
    stream: null,
    isMonitoring: false,
    violations: 0,
    referenceDescriptor: null,
    intervalId: null,
    lastViolationType: null,
    audioContext: null,
    audioAnalyser: null,
    audioInterval: null
};

async function initProctor() {
    console.log("Initializing proctoring system...");
    try {
        // Load TinyFaceDetector as it's more reliable for real-time webcams
        await faceapi.nets.tinyFaceDetector.loadFromUri(PROCTOR_CONFIG.MODEL_URL);
        await faceapi.nets.ssdMobilenetv1.loadFromUri(PROCTOR_CONFIG.MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(PROCTOR_CONFIG.MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(PROCTOR_CONFIG.MODEL_URL);
        console.log("Face API Models loaded successfully");
        return true;
    } catch (err) {
        console.error("Error loading face-api models:", err);
        return false;
    }
}

async function startWebcam(videoElementId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 640, height: 480, frameRate: { ideal: 15 } } 
        });
        const video = document.getElementById(videoElementId);
        video.srcObject = stream;
        proctorState.stream = stream;
        
        // Wait for video metadata to load and play
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                console.log("Webcam stream started and video playing.");
                resolve(true);
            };
        });
    } catch (err) {
        console.error("Error starting webcam:", err);
        return false;
    }
}

function stopWebcam() {
    if (proctorState.stream) {
        proctorState.stream.getTracks().forEach(track => track.stop());
        proctorState.stream = null;
    }
    stopAudioMonitoring();
}

async function startAudioMonitoring(onViolation) {
    try {
        if (proctorState.audioContext) return;
        
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const context = new (window.AudioContext || window.webkitAudioContext)();
        const source = context.createMediaStreamSource(audioStream);
        const analyser = context.createAnalyser();
        
        analyser.fftSize = 256;
        source.connect(analyser);
        
        proctorState.audioContext = context;
        proctorState.audioAnalyser = analyser;
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        proctorState.audioInterval = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
            const average = sum / dataArray.length / 255; // Normalize to 0-1
            
            if (average > PROCTOR_CONFIG.AUDIO_THRESHOLD) {
                console.warn("High audio level detected:", average);
                handleViolation("Suspicious background noise detected!", onViolation, false); // False = non-terminal, let student.js handle count
            }
        }, PROCTOR_CONFIG.AUDIO_CHECK_MS);
    } catch (err) {
        console.error("Audio proctoring error:", err);
    }
}

function stopAudioMonitoring() {
    if (proctorState.audioInterval) {
        clearInterval(proctorState.audioInterval);
        proctorState.audioInterval = null;
    }
    if (proctorState.audioContext) {
        proctorState.audioContext.close();
        proctorState.audioContext = null;
    }
}

async function getFaceDescriptorFromImage(imgUrl) {
    const img = await faceapi.fetchImage(imgUrl);
    const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
    if (!detection) {
        console.warn("No face detected in profile image");
        return null;
    }
    return detection.descriptor;
}

async function verifyIdentity(videoElementId, profileImgUrl) {
    const video = document.getElementById(videoElementId);

    if (!profileImgUrl) {
        return { success: false, message: "No profile photo found. Please upload one in 'My Profile'." };
    }

    try {
        // 1. Get reference descriptor from profile image
        if (!proctorState.referenceDescriptor) {
            console.log("Fetching profile image descriptor...");
            // Correctly handle absolute URLs, data URLs, or relative paths
            let fullUrl = profileImgUrl;
            if (!profileImgUrl.startsWith('http') && !profileImgUrl.startsWith('data:')) {
                fullUrl = window.location.origin + profileImgUrl;
            }
            proctorState.referenceDescriptor = await getFaceDescriptorFromImage(fullUrl);
        }

        if (!proctorState.referenceDescriptor) {
            return { success: false, message: "Could not analyze face in your profile photo. Please upload a clear, front-facing photo." };
        }

        // 2. Try to detect face in webcam (with retries for camera adjustment)
        console.log("Starting webcam face detection retries...");
        let detection = null;
        for (let i = 0; i < 5; i++) {
            // Try TinyFaceDetector first (faster/more robust)
            detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
                                    .withFaceLandmarks()
                                    .withFaceDescriptor();
            
            // If Tiny fails, try SSD (more accurate but slower)
            if (!detection) {
                detection = await faceapi.detectSingleFace(video)
                                        .withFaceLandmarks()
                                        .withFaceDescriptor();
            }

            if (detection) break;
            console.log(`Face detection attempt ${i+1} failed, retrying...`);
            await new Promise(r => setTimeout(r, 500)); // Wait 500ms
        }

        if (!detection) {
            return { success: false, message: "No face detected in webcam. Ensure you are in a well-lit area and face the camera directly." };
        }

        // 3. Compare descriptors
        const distance = faceapi.euclideanDistance(proctorState.referenceDescriptor, detection.descriptor);
        console.log(`Identity verification distance: ${distance.toFixed(4)} (Threshold: ${PROCTOR_CONFIG.MATCH_THRESHOLD})`);

        if (distance < PROCTOR_CONFIG.MATCH_THRESHOLD) {
            return { success: true };
        } else {
            return { success: false, message: "Identity verification failed. The face in the webcam does not match your profile photo." };
        }
    } catch (err) {
        console.error("Verification error:", err);
        return { success: false, message: "Encryption/Processing error during verification." };
    }
}

function startMonitoring(videoElementId, onViolation) {
    if (proctorState.isMonitoring) return;
    proctorState.isMonitoring = true;
    const video = document.getElementById(videoElementId);

    // Start audio monitoring
    startAudioMonitoring(onViolation);

    proctorState.intervalId = setInterval(async () => {
        if (!proctorState.isMonitoring) return;

        try {
            // Use TinyFaceDetector for monitoring too
            const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 }))
                                            .withFaceLandmarks()
                                            .withFaceDescriptors();

            // 1. Multiple Faces
            if (detections.length > 1) {
                handleViolation("Multiple persons detected in the frame.", onViolation, true);
                return;
            }

            // 2. No Face
            if (detections.length === 0) {
                handleViolation("No person detected. Please stay within the camera frame.", onViolation);
                return;
            }

            // 3. Identity Mismatch
            if (proctorState.referenceDescriptor && detections.length === 1) {
                const distance = faceapi.euclideanDistance(proctorState.referenceDescriptor, detections[0].descriptor);
                if (distance >= PROCTOR_CONFIG.MATCH_THRESHOLD + 0.05) { // Slightly more lenient during monitoring
                    handleViolation("Identity mismatch. Terminating exam for security.", onViolation, true);
                    return;
                }
            }
        } catch (e) {
            console.error("Monitoring loop error:", e);
        }
    }, PROCTOR_CONFIG.CHECK_INTERVAL);
}

function handleViolation(message, onViolation, immediateStop = false) {
    proctorState.violations++;
    proctorState.lastViolationType = message;

    console.warn("Violation:", message);

    if (immediateStop || proctorState.violations >= PROCTOR_CONFIG.MAX_VIOLATIONS) {
        stopMonitoring();
        if (onViolation) onViolation(message, true);
    } else {
        if (onViolation) onViolation(message, false);
    }
}

function stopMonitoring() {
    proctorState.isMonitoring = false;
    if (proctorState.intervalId) {
        clearInterval(proctorState.intervalId);
        proctorState.intervalId = null;
    }
    stopWebcam();
}

// Export functions to global scope
window.Proctor = {
    init: initProctor,
    startWebcam,
    stopWebcam,
    verifyIdentity,
    startMonitoring,
    stopMonitoring,
    getState: () => ({ ...proctorState })
};
