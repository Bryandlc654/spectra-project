import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

const app = express();
const server = http.createServer(app);

const ORIGIN = process.env.CORS_ORIGIN || 'https://manage.spectralatam.com';
const PATH = process.env.SIO_PATH || '/socket.io';
const PORT = parseInt(process.env.PORT || '3001', 10);
const EMIT_SECRET = process.env.EMIT_SECRET || '';

const io = new Server(server, {
  cors: {
    origin: ORIGIN,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization'],
    credentials: false
  },
  path: PATH
});

io.on('connection', (socket) => {
  socket.on('join', (data) => {
    const room = data && data.room ? String(data.room) : null;
    if (room) socket.join(room);
  });
  socket.on('leave', (data) => {
    const room = data && data.room ? String(data.room) : null;
    if (room) socket.leave(room);
  });
});

app.use(cors({ origin: ORIGIN }));
app.use(express.json());

app.post('/emit', (req, res) => {
  const apiKey = req.header('x-api-key') || '';
  if (!EMIT_SECRET || apiKey !== EMIT_SECRET) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const channel = req.body?.channel;
  const event = req.body?.event;
  const payload = req.body?.payload;
  if (!channel || !event) {
    res.status(400).json({ error: 'invalid' });
    return;
  }
  io.to(String(channel)).emit(String(event), payload);
  res.json({ ok: true });
});

server.listen(PORT, () => {});
