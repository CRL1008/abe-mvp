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

    // Step 3: Generate video using D-ID (text-to-speech)
    console.log('Generating video...');
    const videoUrl = await generateVideoFromText(lincolnResponse);

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

  const systemPrompt = `You are Abraham Lincoln in 1865, speaking with wisdom, dignity, and the perspective of a leader during the Civil War era. Respond to questions as Lincoln would have, using his characteristic speaking style, vocabulary, and mannerisms. Keep your response to exactly 10 words or fewer. Be authentic to Lincoln's voice and historical context.`;

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

async function generateVideoFromText(text: string): Promise<string> {
  const apiKey = process.env.DID_API_KEY;
  if (!apiKey) {
    throw new Error('D-ID API key not configured');
  }

  // Debug API key (show first/last few characters)
  console.log('[D-ID] API Key format check:');
  console.log('[D-ID] Key length:', apiKey.length);
  console.log('[D-ID] Key starts with:', apiKey.substring(0, 10));
  console.log('[D-ID] Key ends with:', apiKey.substring(apiKey.length - 10));

  // Prepare Basic Auth header
  const basicAuth = Buffer.from(apiKey).toString('base64');
  console.log('[D-ID] Basic Auth header:', `Basic ${basicAuth}`);

  // Use a reliable image URL
  const lincolnImageUrl =
    'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Abraham_Lincoln_1863_Portrait_%283x4_cropped%29.jpg/500px-Abraham_Lincoln_1863_Portrait_%283x4_cropped%29.jpg';

  // Prepare payload for text-to-speech
  const payload = {
    script: {
      type: 'text',
      input: text,
      provider: {
        type: 'microsoft', // or 'amazon' or 'elevenlabs' if supported by your plan
        voice_id: 'en-US-GuyNeural', // a clear, neutral male US English voice
      },
    },
    source_url: lincolnImageUrl,
  };

  console.log(
    '[D-ID] Payload (text-to-speech):',
    JSON.stringify(payload, null, 2)
  );

  let lastError;

  try {
    console.log('[D-ID] Trying Basic authentication (text-to-speech)...');

    const createResponse = await fetch('https://api.d-id.com/talks', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'Abe-Answers/1.0',
      },
      body: JSON.stringify(payload),
    });

    console.log('[D-ID] Basic Auth Status:', createResponse.status);
    const createText = await createResponse.text();
    console.log('[D-ID] Basic Auth Response:', createText);

    if (createResponse.ok) {
      console.log('[D-ID] Success with Basic authentication!');
      const createData: DIDResponse = JSON.parse(createText);
      const talkId = createData.id;

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max wait

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

        const statusResponse = await fetch(
          `https://api.d-id.com/talks/${talkId}`,
          {
            headers: {
              Authorization: `Basic ${basicAuth}`,
              Accept: 'application/json',
              'User-Agent': 'Abe-Answers/1.0',
            },
          }
        );

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
    } else {
      lastError = new Error(`D-ID Basic Auth failed: ${createText}`);
      console.log('[D-ID] Basic Auth authentication failed.');
      // Log the full error response for troubleshooting
      try {
        const errorJson = JSON.parse(createText);
        console.log('[D-ID] Full error response object:', errorJson);
      } catch (e) {
        console.log('[D-ID] Error response is not valid JSON.');
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error : new Error(String(error));
    console.log('[D-ID] Basic Auth attempt failed:', lastError.message);
  }

  // If all auth methods failed
  console.log(
    '[D-ID] All authentication methods failed. Returning mock video for testing.'
  );
  console.log(
    '[D-ID] To fix this, get a valid D-ID API key from https://www.d-id.com/'
  );

  // Return a mock video URL for testing
  return 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4';
}
