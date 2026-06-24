import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { uploadVideo } from "../api";
import {
  ALLOWED_VIDEO_TYPES,
  MAX_RECORDING_SECONDS,
  MAX_VIDEO_BYTES,
} from "../constants";
import type { User } from "../types";

type CreateVideoProps = {
  currentUser: User | null;
  onVideoPosted: () => void;
};

type RecordingState =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "preview"
  | "uploading";

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read video metadata"));
    };
    video.src = objectUrl;
  });
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("quicktime")) return "mov";
  return "webm";
}

export function CreateVideo({ currentUser, onVideoPosted }: CreateVideoProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function stopStreamTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
  }

  function clearTimers() {
    if (recordingTimerRef.current !== null) {
      window.clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (elapsedIntervalRef.current !== null) {
      window.clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    else {
      clearTimers();
      stopStreamTracks();
      setRecordingState("idle");
    }
  }

  function resetCreation() {
    clearTimers();
    stopStreamTracks();
    setPreviewUrl(null);
    setRecordedBlob(null);
    setSelectedFile(null);
    setElapsedSeconds(0);
    setRecordingState("idle");
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  useEffect(() => {
    return () => {
      clearTimers();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function startRecording() {
    if (!currentUser) return setError("Select a user first");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      return setError("Camera recording is not supported in this browser");
    }

    setError(null);
    setPreviewUrl(null);
    setSelectedFile(null);
    setRecordedBlob(null);
    chunksRef.current = [];
    setRecordingState("requesting_permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (liveVideoRef.current) liveVideoRef.current.srcObject = stream;

      const preferredMime = MediaRecorder.isTypeSupported("video/webm") ? "video/webm" : "";
      const recorder = new MediaRecorder(stream, preferredMime ? { mimeType: preferredMime } : undefined);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearTimers();
        stopStreamTracks();
        const mimeType = (recorder.mimeType || "video/webm").split(";")[0];
        if (!ALLOWED_VIDEO_TYPES.has(mimeType)) {
          setRecordingState("idle");
          return setError("This browser records in a video format the app cannot upload.");
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size === 0) {
          setRecordingState("idle");
          return setError("The recording was empty. Please try again.");
        }
        setRecordedBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
        setRecordingState("preview");
      };
      recorder.start(1000);
      setElapsedSeconds(0);
      setRecordingState("recording");
      elapsedIntervalRef.current = window.setInterval(() => {
        setElapsedSeconds((value) => Math.min(value + 1, MAX_RECORDING_SECONDS));
      }, 1000);
      recordingTimerRef.current = window.setTimeout(stopRecording, MAX_RECORDING_SECONDS * 1000);
    } catch {
      clearTimers();
      stopStreamTracks();
      setRecordingState("idle");
      setError("Could not access camera or microphone");
    }
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setSelectedFile(null);

    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      return setError("Unsupported video type. Please upload a WebM, MP4, or MOV file.");
    }
    if (file.size > MAX_VIDEO_BYTES) return setError("Video must be 50 MB or smaller.");

    try {
      const duration = await getVideoDuration(file);
      if (duration > MAX_RECORDING_SECONDS + 0.5) {
        return setError("Uploaded video must be 30 seconds or shorter.");
      }
    } catch {
      // Size and MIME remain enforced here and on the backend when metadata is unavailable.
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRecordingState("preview");
  }

  async function postVideo() {
    if (!currentUser) return setError("Select a user first");
    const uploadSource = selectedFile ?? recordedBlob;
    if (!uploadSource) return setError("Record or select a video first");

    setRecordingState("uploading");
    setError(null);
    try {
      const extension = extensionForMimeType(uploadSource.type);
      const filename = selectedFile?.name ?? `recording-${Date.now()}.${extension}`;
      await uploadVideo(currentUser.id, uploadSource, filename);
      resetCreation();
      onVideoPosted();
    } catch (caught) {
      setRecordingState("preview");
      setError(caught instanceof Error ? caught.message : "Failed to upload video");
    }
  }

  const disabled = !currentUser || recordingState === "uploading";

  return (
    <section className="create-video" aria-labelledby="create-heading">
      <p className="step-label">02 / CREATE</p>
      <h2 id="create-heading">Make a reel</h2>
      {!currentUser && <p>Select or create a user before posting.</p>}

      {(recordingState === "recording" || recordingState === "requesting_permission") && (
        <div className="capture-stage">
          <video ref={liveVideoRef} autoPlay muted playsInline />
          <span className="recording-badge">
            <i /> {recordingState === "recording" ? `REC 0:${String(elapsedSeconds).padStart(2, "0")}` : "OPENING CAMERA"}
          </span>
        </div>
      )}

      {recordingState === "preview" && previewUrl && (
        <div className="capture-stage">
          <video src={previewUrl} controls playsInline />
          <span className="preview-badge">PREVIEW</span>
        </div>
      )}

      {recordingState === "idle" && (
        <div className="creation-actions">
          <button className="action-card" type="button" onClick={startRecording} disabled={disabled}>
            <span className="action-icon">●</span>
            <strong>Record</strong>
            <small>Camera + mic · 30 sec</small>
          </button>
          <button
            className="action-card"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
          >
            <span className="action-icon">↑</span>
            <strong>Upload</strong>
            <small>MP4, WebM or MOV</small>
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        className="visually-hidden"
        type="file"
        accept="video/webm,video/mp4,video/quicktime"
        onChange={handleFileSelected}
        disabled={disabled}
      />

      {recordingState === "recording" && (
        <button className="wide-button stop-button" type="button" onClick={stopRecording}>Stop recording</button>
      )}
      {recordingState === "preview" && (
        <div className="preview-actions">
          <button className="secondary-button" type="button" onClick={resetCreation}>Discard</button>
          <button type="button" onClick={postVideo}>Post reel</button>
        </div>
      )}
      {recordingState === "uploading" && <p className="uploading-message">Posting your reel…</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
