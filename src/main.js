import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Digital Backend API Server Running', timestamp: new Date() });
});

// Default API route
app.get('/api', (req, res) => {
  res.json({ message: 'Welcome to Digital Project API' });
});

app.listen(PORT, () => {
  console.log(`[digital-backend] Server running on http://localhost:${PORT}`);
});
