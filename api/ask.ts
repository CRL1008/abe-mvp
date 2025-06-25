import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RequestBody {
  audio: string;
}

interface WhisperResponse {
  text: string;
}

interface GptResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface DIDResponse {
  id: string;
  status: string;
  result: {
    video_url: string;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify password
    const accessPassword = req.headers['x-access-password'];
    if (!accessPassword || accessPassword !== process.env.ACCESS_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized - Invalid password' });
    }

    const { audio }: RequestBody = req.body;

    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Step 1: Transcribe audio using OpenAI Whisper
    console.log('Transcribing audio...');
    const transcription = await transcribeAudio(audio);

    // Step 2: Generate Lincoln response using GPT-4
    console.log('Generating Lincoln response...');
    const lincolnResponse = await generateLincolnResponse(transcription);

    // Step 3: Generate audio using ElevenLabs
    console.log('Generating audio...');
    const audioUrl = await generateAudio(lincolnResponse);

    // Step 4: Generate video using D-ID
    console.log('Generating video...');
    const videoUrl = await generateVideo(audioUrl);

    // Return the results
    return res.status(200).json({
      transcription,
      response: lincolnResponse,
      videoUrl,
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function transcribeAudio(base64Audio: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  // Convert base64 to buffer
  const audioBuffer = Buffer.from(base64Audio, 'base64');

  const formData = new FormData();
  formData.append(
    'file',
    new Blob([audioBuffer], { type: 'audio/webm' }),
    'audio.webm'
  );
  formData.append('model', 'whisper-1');

  const response = await fetch(
    'https://api.openai.com/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Whisper API error: ${error}`);
  }

  const data: WhisperResponse = await response.json();
  return data.text.trim();
}

async function generateLincolnResponse(question: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const systemPrompt = `You are Abraham Lincoln in 1865, speaking with wisdom, dignity, and the perspective of a leader during the Civil War era. Respond to questions as Lincoln would have, using his characteristic speaking style, vocabulary, and mannerisms. Keep your response to exactly 45 words or fewer. Be authentic to Lincoln's voice and historical context.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: question },
      ],
      max_tokens: 100,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`GPT API error: ${error}`);
  }

  const data: GptResponse = await response.json();
  const responseText = data.choices[0]?.message?.content?.trim();

  if (!responseText) {
    throw new Error('No response generated from GPT');
  }

  // Ensure response is 45 words or fewer
  const wordCount = responseText.split(/\s+/).length;
  if (wordCount > 45) {
    throw new Error(`Response too long: ${wordCount} words (max 45)`);
  }

  return responseText;
}

async function generateAudio(text: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  console.log('[ElevenLabs] Starting audio generation...');
  console.log('[ElevenLabs] Text to synthesize:', text);
  console.log('[ElevenLabs] Voice ID:', voiceId);
  console.log('[ElevenLabs] API Key present:', !!apiKey);

  if (!apiKey || !voiceId) {
    throw new Error('ElevenLabs API key or voice ID not configured');
  }

  const payload = {
    text,
    model_id: 'eleven_monolingual_v1',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    },
  };

  console.log('[ElevenLabs] Payload:', JSON.stringify(payload, null, 2));

  // Retry logic for rate limiting
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[ElevenLabs] Attempt ${attempt}/${maxRetries}`);

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            Accept: 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify(payload),
        }
      );

      console.log('[ElevenLabs] Status:', response.status);
      console.log(
        '[ElevenLabs] Headers:',
        Object.fromEntries(response.headers.entries())
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[ElevenLabs] Error response:', errorText);

        // Check if it's a rate limit error
        if (response.status === 429 || errorText.includes('system_busy')) {
          lastError = new Error(`ElevenLabs rate limited: ${errorText}`);

          if (attempt < maxRetries) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
            console.log(
              `[ElevenLabs] Rate limited, waiting ${delay}ms before retry...`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        throw new Error(`ElevenLabs API error: ${errorText}`);
      }

      // Success - convert audio to base64 for D-ID
      const audioBuffer = await response.arrayBuffer();
      const base64Audio = Buffer.from(audioBuffer).toString('base64');

      console.log(
        '[ElevenLabs] Audio generated successfully, length:',
        base64Audio.length
      );
      return base64Audio;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`[ElevenLabs] Attempt ${attempt} failed:`, lastError.message);

      if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }

  throw lastError;
}

async function generateVideo(audioBase64: string): Promise<string> {
  const apiKey = process.env.DID_API_KEY;
  if (!apiKey) {
    throw new Error('D-ID API key not configured');
  }

  const lincolnImageUrl =
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Abraham_Lincoln_1863_Portrait_%283x4_cropped%29.jpg/1280px-Abraham_Lincoln_1863_Portrait_%283x4_cropped%29.jpg';

  // Log audio info
  console.log('[D-ID] Audio base64 length:', audioBase64.length);
  console.log(
    '[D-ID] Audio base64 (first 100 chars):',
    audioBase64.slice(0, 100)
  );

  // Prepare payload
  const payload = {
    script: {
      type: 'audio',
      audio: `data:audio/mpeg;base64,${audioBase64}`,
      subtitles: false,
    },
    source_url: lincolnImageUrl,
  };

  console.log(
    '[D-ID] Payload (simplified):',
    JSON.stringify(
      {
        script: {
          type: 'audio',
          audio: `data:audio/mpeg;base64,${audioBase64.slice(0, 100)}...`,
          subtitles: false,
        },
        source_url: lincolnImageUrl,
      },
      null,
      2
    )
  );

  // Create the video
  const createResponse = await fetch('https://api.d-id.com/talks', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  // Log status and response
  console.log('[D-ID] Status:', createResponse.status);
  const createText = await createResponse.text();
  console.log('[D-ID] Response:', createText);

  if (!createResponse.ok) {
    throw new Error(`D-ID create API error: ${createText}`);
  }

  const createData: DIDResponse = JSON.parse(createText);
  const talkId = createData.id;

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max wait

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

    const statusResponse = await fetch(`https://api.d-id.com/talks/${talkId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
      },
    });

    const statusText = await statusResponse.text();
    console.log(
      `[D-ID] Poll attempt ${attempts + 1} status:`,
      statusResponse.status,
      statusText
    );

    if (!statusResponse.ok) {
      throw new Error(`D-ID status API error: ${statusText}`);
    }

    const statusData: DIDResponse = JSON.parse(statusText);

    if (statusData.status === 'done') {
      return statusData.result.video_url;
    } else if (statusData.status === 'error') {
      throw new Error('D-ID video generation failed');
    }

    attempts++;
  }

  throw new Error('D-ID video generation timed out');
}
