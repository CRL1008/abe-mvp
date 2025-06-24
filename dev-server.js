import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Mock API endpoint for development
app.post('/api/ask', async (req, res) => {
  try {
    const { audio } = req.body;
    const accessPassword = req.headers['x-access-password'];

    // Check password
    if (!accessPassword || accessPassword !== process.env.ACCESS_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized - Invalid password' });
    }

    if (!audio) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // For development, return a mock response
    console.log('Mock API called with audio length:', audio.length);

    res.status(200).json({
      transcription: 'What is your question about the Civil War?',
      response:
        'The preservation of the Union is paramount. We must remain steadfast in our resolve.',
      videoUrl: 'https://example.com/mock-video.mp4',
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(
    'This is a mock server for development. Set up your .env file for real API calls.'
  );
});
