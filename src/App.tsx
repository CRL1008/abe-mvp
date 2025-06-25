// src/App.tsx
import { useState, useEffect, useRef } from 'react';

interface ApiResponse {
  videoUrl: string;
  transcription: string;
  response: string;
}

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(true);
  const [password, setPassword] = useState('');
  const [storedPassword, setStoredPassword] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check for stored password on component mount
  useEffect(() => {
    const stored = localStorage.getItem('abe-answers-password');
    if (stored) {
      setStoredPassword(stored);
      setShowPasswordModal(false);
    }
  }, []);

  const handlePasswordSubmit = () => {
    if (password.trim()) {
      setStoredPassword(password);
      localStorage.setItem('abe-answers-password', password);
      setShowPasswordModal(false);
      setPassword('');
    }
  };

  const startRecording = async () => {
    try {
      setError(null);
      setVideoUrl(null);
      setTranscription(null);
      setResponse(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });
        await processAudio(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Stop recording after 4 seconds
      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, 4000);
    } catch (err) {
      setError(
        'Failed to access microphone. Please allow microphone access and try again.'
      );
      console.error('Error starting recording:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Convert audio to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = btoa(
        String.fromCharCode(...new Uint8Array(arrayBuffer))
      );

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-access-password': storedPassword || '',
        },
        body: JSON.stringify({
          audio: base64Audio,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const data: ApiResponse = await response.json();

      setVideoUrl(data.videoUrl);
      setTranscription(data.transcription);
      setResponse(data.response);
    } catch (err) {
      console.error('Error processing audio:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to process your question. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecordClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  if (showPasswordModal) {
    return (
      <div className="password-modal">
        <div className="password-content">
          <h2 className="title">Abe Answers</h2>
          <p>Please enter the access password to continue:</p>
          <input
            type="password"
            className="password-input"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handlePasswordSubmit()}
          />
          <button className="password-button" onClick={handlePasswordSubmit}>
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Abraham_Lincoln_1863_Portrait_%283x4_cropped%29.jpg/1280px-Abraham_Lincoln_1863_Portrait_%283x4_cropped%29.jpg"
        alt="Abraham Lincoln"
        className="lincoln-image"
      />

      <h1 className="title">Abe Answers</h1>
      <p className="subtitle">Ask President Lincoln a question</p>

      <div className="instruction">
        Tap below to ask President Lincoln a question.
        {isRecording && <br />}
        {isRecording && (
          <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>
            Recording... (4 seconds max)
          </span>
        )}
      </div>

      <button
        className={`record-button ${isRecording ? 'recording' : ''}`}
        onClick={handleRecordClick}
        disabled={isProcessing}
      >
        {isProcessing
          ? 'Processing...'
          : isRecording
          ? 'Stop Recording'
          : 'Start Recording'}
      </button>

      {error && <div className="error">{error}</div>}

      {isProcessing && (
        <div className="loading">
          <div className="spinner"></div>
          <p>Processing your question...</p>
          <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            This may take a moment as we transcribe, generate, and create your
            response.
          </p>
        </div>
      )}

      {transcription && (
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            padding: '1rem',
            borderRadius: '8px',
            marginTop: '1rem',
            textAlign: 'left',
          }}
        >
          <strong>Your question:</strong> {transcription}
        </div>
      )}

      {response && (
        <div
          style={{
            background: 'rgba(212, 175, 55, 0.1)',
            padding: '1rem',
            borderRadius: '8px',
            marginTop: '1rem',
            border: '1px solid rgba(212, 175, 55, 0.3)',
            textAlign: 'left',
          }}
        >
          <strong>President Lincoln's response:</strong> {response}
        </div>
      )}

      {videoUrl && (
        <div className="video-container">
          <video className="video-player" controls autoPlay muted playsInline>
            <source src={videoUrl} type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      )}
    </div>
  );
}

export default App;
