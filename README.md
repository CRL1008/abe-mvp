# Abe Answers

An AI-powered web application that allows users to ask questions to Abraham Lincoln and receive responses in his voice and likeness.

## Features

- 🎤 Voice recording with 4-second limit
- 🧠 OpenAI Whisper for speech-to-text transcription
- 🤖 GPT-4 for generating Lincoln-style responses (45 words max)
- 🔊 ElevenLabs for presidential voice synthesis
- 🎬 D-ID for animated video generation
- 🔒 Password-protected API access
- 📱 Responsive design for all devices

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Backend**: Vercel Serverless Functions
- **APIs**: OpenAI (Whisper + GPT-4), ElevenLabs, D-ID
- **Deployment**: Vercel

## Prerequisites

Before setting up this project, you'll need:

1. **OpenAI API Key** - For Whisper transcription and GPT-4 responses
2. **ElevenLabs API Key** - For voice synthesis
3. **ElevenLabs Voice ID** - A presidential-sounding voice ID
4. **D-ID API Key** - For video generation
5. **Vercel Account** - For deployment

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url>
cd abe-answers
npm install
```

### 2. Environment Variables

Copy the example environment file and fill in your API keys:

```bash
cp env.example .env
```

Edit `.env` with your actual API keys:

```env
# OpenAI API Key for Whisper transcription and GPT-4 responses
OPENAI_API_KEY=your_openai_api_key_here

# D-ID API Key for video generation
DID_API_KEY=your_did_api_key_here

# ElevenLabs API Key for voice synthesis
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here

# ElevenLabs Voice ID for Abraham Lincoln voice
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id_here

# Access password for API protection
ACCESS_PASSWORD=your_secure_password_here
```

### 3. Local Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### 4. Deploy to Vercel

1. Install Vercel CLI:

```bash
npm i -g vercel
```

2. Deploy:

```bash
vercel
```

3. Add environment variables in Vercel dashboard

## Usage

1. **First Visit**: Enter the access password (stored locally)
2. **Ask a Question**: Click "Start Recording" and speak your question
3. **Wait for Processing**: The app will transcribe, generate response, create audio, and generate video
4. **View Results**: Watch the animated Lincoln respond to your question

## Security Features

- **Password Protection**: All API requests require a valid password
- **No Client-Side API Keys**: All sensitive operations happen server-side
- **Audio Limits**: 4-second recording limit to control costs
- **Response Limits**: 45-word maximum to keep responses concise

## Project Structure

```
abe-answers/
├── src/                    # Frontend React code
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # React entry point
│   └── index.css          # Global styles
├── api/                   # Vercel serverless functions
│   └── ask.ts            # Main API endpoint
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Vite configuration
├── vercel.json           # Vercel deployment config
└── README.md             # This file
```

## Troubleshooting

If you encounter deployment issues:

1. Check that all environment variables are set in Vercel
2. Ensure the repository is properly connected in Vercel settings
3. Verify the build configuration in vercel.json
