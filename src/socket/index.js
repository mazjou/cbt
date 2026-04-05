const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const pool = require('../db/pool');

let io = null;
const leaderboardTimers = new Map();

function wrapSession(sessionMiddleware) {
  return (socket, next) => sessionMiddleware(socket.request, {}, next);
}

function normalizeRole(role) {
  return String(role || '').toUpperCase();
}

function isPrivilegedRole(role) {
  return ['ADMIN', 'PRINCIPAL', 'TEACHER'].includes(normalizeRole(role));
}

async function canAccessLiveClass(user, liveClassId) {
  const role = normalizeRole(user.role);

  if (role === 'TEACHER') {
    const [[row]] = await pool.query(
      `SELECT id FROM live_classes WHERE id = :id AND teacher_id = :teacherId LIMIT 1`,
      { id: liveClassId, teacherId: user.id }
    );
    return !!row;
  }

  if (role === 'STUDENT') {
    const [[row]] = await pool.query(
      `SELECT id
       FROM live_classes
       WHERE id = :id AND class_id = :classId AND status IN ('SCHEDULED', 'LIVE')
       LIMIT 1`,
      { id: liveClassId, classId: user.class_id }
    );
    return !!row;
  }

  if (['ADMIN', 'PRINCIPAL'].includes(role)) {
    const [[row]] = await pool.query(
      `SELECT id FROM live_classes WHERE id = :id LIMIT 1`,
      { id: liveClassId }
    );
    return !!row;
  }

  return false;
}

async function canAccessChatRoom(user, roomType, roomId) {
  const normalizedType = String(roomType || '').trim().toLowerCase();
  const numericRoomId = Number(roomId);
  const role = normalizeRole(user.role);

  if (!normalizedType || !Number.isInteger(numericRoomId) || numericRoomId <= 0) {
    return false;
  }

  if (normalizedType === 'live') {
    return canAccessLiveClass(user, numericRoomId);
  }

  if (normalizedType === 'class') {
    if (role === 'STUDENT') return Number(user.class_id) === numericRoomId;
    return isPrivilegedRole(role);
  }

  if (normalizedType === 'user' || normalizedType === 'private') {
    if (role === 'STUDENT') return Number(user.id) === numericRoomId;
    return isPrivilegedRole(role);
  }

  return isPrivilegedRole(role);
}

async function getParticipantCount(liveClassId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS count
     FROM live_class_participants
     WHERE live_class_id = :liveClassId AND left_at IS NULL`,
    { liveClassId }
  );

  return Number(row?.count || 0);
}

async function markParticipantJoined(liveClassId, userId) {
  await pool.query(
    `INSERT INTO live_class_participants (live_class_id, user_id, joined_at)
     VALUES (:liveClassId, :userId, NOW())
     ON DUPLICATE KEY UPDATE joined_at = NOW(), left_at = NULL, duration_minutes = NULL`,
    { liveClassId, userId }
  );
}

async function markParticipantLeft(liveClassId, userId) {
  await pool.query(
    `UPDATE live_class_participants
     SET left_at = NOW(),
         duration_minutes = TIMESTAMPDIFF(MINUTE, joined_at, NOW())
     WHERE live_class_id = :liveClassId
       AND user_id = :userId
       AND left_at IS NULL`,
    { liveClassId, userId }
  );
}

async function scheduleLeaderboardBroadcast(ioInstance, liveClassId) {
  if (leaderboardTimers.has(liveClassId)) return;

  const timer = setTimeout(async () => {
    leaderboardTimers.delete(liveClassId);

    try {
      const [leaderboard] = await pool.query(
        `SELECT u.full_name, SUM(lqa.points_earned) AS total_points
         FROM live_quiz_answers lqa
         JOIN users u ON u.id = lqa.user_id
         JOIN live_quizzes lq ON lq.id = lqa.quiz_id
         WHERE lq.live_class_id = :liveClassId
         GROUP BY lqa.user_id, u.full_name
         ORDER BY total_points DESC
         LIMIT 10`,
        { liveClassId }
      );

      ioInstance.to(`live:${liveClassId}`).emit('quiz:leaderboard', leaderboard);
    } catch (error) {
      console.error('Error broadcasting leaderboard:', error.message);
    }
  }, 1500);

  leaderboardTimers.set(liveClassId, timer);
}

async function endQuiz(ioInstance, quizId, liveClassId) {
  try {
    const [[quiz]] = await pool.query(
      `SELECT id, correct_answer, status
       FROM live_quizzes
       WHERE id = :quizId
       LIMIT 1`,
      { quizId }
    );

    if (!quiz || quiz.status === 'ENDED') return;

    await pool.query(
      `UPDATE live_quizzes
       SET status = 'ENDED', ended_at = NOW()
       WHERE id = :quizId AND status <> 'ENDED'`,
      { quizId }
    );

    const [results] = await pool.query(
      `SELECT u.full_name, lqa.answer, lqa.is_correct, lqa.points_earned, lqa.response_time_ms
       FROM live_quiz_answers lqa
       JOIN users u ON u.id = lqa.user_id
       WHERE lqa.quiz_id = :quizId
       ORDER BY lqa.points_earned DESC, lqa.response_time_ms ASC`,
      { quizId }
    );

    ioInstance.to(`live:${liveClassId}`).emit('quiz:ended', {
      quizId,
      correctAnswer: quiz.correct_answer,
      results
    });
  } catch (error) {
    console.error('Error ending quiz:', error.message);
  }
}

async function initializeSocket(server, { redisClient = null, sessionMiddleware = null } = {}) {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  if (redisClient) {
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.IO Redis adapter aktif');
  } else {
    console.log('⚠️ Socket.IO berjalan tanpa Redis adapter');
  }

  if (!sessionMiddleware) {
    throw new Error('sessionMiddleware wajib diberikan ke initializeSocket');
  }

  io.use(wrapSession(sessionMiddleware));

  io.use((socket, next) => {
    const user = socket.request.session?.user;
    if (!user) {
      return next(new Error('Authentication error'));
    }

    socket.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      class_id: user.class_id,
      class_name: user.class_name,
      class_code: user.class_code
    };

    socket.data.liveClassIds = new Set();
    socket.data.lastMessageAt = 0;
    return next();
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.user.full_name} (${socket.user.role})`);

    socket.join(`user:${socket.user.id}`);

    if (normalizeRole(socket.user.role) === 'STUDENT' && socket.user.class_id) {
      socket.join(`class:${socket.user.class_id}`);
    }

    socket.on('chat:join', async (data = {}) => {
      try {
        const roomType = String(data.roomType || '').trim().toLowerCase();
        const roomId = Number(data.roomId);

        if (!roomType || !Number.isInteger(roomId) || roomId <= 0) {
          return socket.emit('chat:error', { message: 'Room chat tidak valid' });
        }

        const allowed = await canAccessChatRoom(socket.user, roomType, roomId);
        if (!allowed) {
          return socket.emit('chat:error', { message: 'Tidak diizinkan mengakses room ini' });
        }

        const roomName = `${roomType}:${roomId}`;
        socket.join(roomName);

        const [messages] = await pool.query(
          `SELECT cm.*, u.full_name, u.role
           FROM chat_messages cm
           JOIN users u ON u.id = cm.sender_id
           WHERE cm.room_type = :roomType AND cm.room_id = :roomId
           ORDER BY cm.created_at DESC
           LIMIT 50`,
          { roomType, roomId }
        );

        socket.emit('chat:history', messages.reverse());
      } catch (error) {
        console.error('Error loading chat history:', error.message);
        socket.emit('chat:error', { message: 'Gagal memuat riwayat chat' });
      }
    });

    socket.on('chat:message', async (data = {}) => {
      try {
        const now = Date.now();
        if (now - socket.data.lastMessageAt < 300) {
          return socket.emit('chat:error', { message: 'Terlalu cepat mengirim pesan' });
        }
        socket.data.lastMessageAt = now;

        const roomType = String(data.roomType || '').trim().toLowerCase();
        const roomId = Number(data.roomId);
        const message = String(data.message || '').trim();
        const receiverId = data.receiverId ? Number(data.receiverId) : null;

        if (!roomType || !Number.isInteger(roomId) || roomId <= 0) {
          return socket.emit('chat:error', { message: 'Room chat tidak valid' });
        }

        if (!message || message.length > 2000) {
          return socket.emit('chat:error', { message: 'Pesan kosong atau terlalu panjang' });
        }

        const allowed = await canAccessChatRoom(socket.user, roomType, roomId);
        if (!allowed) {
          return socket.emit('chat:error', { message: 'Tidak diizinkan mengirim ke room ini' });
        }

        const [result] = await pool.query(
          `INSERT INTO chat_messages (room_type, room_id, sender_id, receiver_id, message)
           VALUES (:roomType, :roomId, :senderId, :receiverId, :message)`,
          {
            roomType,
            roomId,
            senderId: socket.user.id,
            receiverId: receiverId || null,
            message
          }
        );

        const payload = {
          id: result.insertId,
          room_type: roomType,
          room_id: roomId,
          sender_id: socket.user.id,
          sender_name: socket.user.full_name,
          sender_role: socket.user.role,
          receiver_id: receiverId,
          message,
          created_at: new Date()
        };

        io.to(`${roomType}:${roomId}`).emit('chat:message', payload);
        if (receiverId) {
          io.to(`user:${receiverId}`).emit('chat:message', payload);
        }
      } catch (error) {
        console.error('Error sending message:', error.message);
        socket.emit('chat:error', { message: 'Gagal mengirim pesan' });
      }
    });

    socket.on('chat:typing', async (data = {}) => {
      try {
        const roomType = String(data.roomType || '').trim().toLowerCase();
        const roomId = Number(data.roomId);
        if (!roomType || !Number.isInteger(roomId) || roomId <= 0) return;

        const allowed = await canAccessChatRoom(socket.user, roomType, roomId);
        if (!allowed) return;

        socket.to(`${roomType}:${roomId}`).emit('chat:typing', {
          userId: socket.user.id,
          userName: socket.user.full_name
        });
      } catch (error) {
        console.error('Error typing event:', error.message);
      }
    });

    socket.on('live:join', async (data = {}) => {
      try {
        const liveClassId = Number(data.liveClassId);
        if (!Number.isInteger(liveClassId) || liveClassId <= 0) {
          return socket.emit('live:error', { message: 'Live class tidak valid' });
        }

        const allowed = await canAccessLiveClass(socket.user, liveClassId);
        if (!allowed) {
          return socket.emit('live:error', { message: 'Tidak diizinkan mengakses live class ini' });
        }

        const roomName = `live:${liveClassId}`;
        socket.join(roomName);
        socket.data.liveClassIds.add(liveClassId);

        await markParticipantJoined(liveClassId, socket.user.id);
        const count = await getParticipantCount(liveClassId);

        io.to(roomName).emit('live:participant-joined', {
          userId: socket.user.id,
          userName: socket.user.full_name,
          userRole: socket.user.role,
          participantCount: count
        });
      } catch (error) {
        console.error('Error joining live class:', error.message);
        socket.emit('live:error', { message: 'Gagal join live class' });
      }
    });

    socket.on('live:leave', async (data = {}) => {
      try {
        const liveClassId = Number(data.liveClassId);
        if (!Number.isInteger(liveClassId) || liveClassId <= 0) return;

        const roomName = `live:${liveClassId}`;
        await markParticipantLeft(liveClassId, socket.user.id);
        socket.leave(roomName);
        socket.data.liveClassIds.delete(liveClassId);

        const count = await getParticipantCount(liveClassId);
        io.to(roomName).emit('live:participant-left', {
          userId: socket.user.id,
          userName: socket.user.full_name,
          participantCount: count
        });
      } catch (error) {
        console.error('Error leaving live class:', error.message);
      }
    });

    socket.on('live:raise-hand', async (data = {}) => {
      try {
        const liveClassId = Number(data.liveClassId);
        if (!Number.isInteger(liveClassId) || liveClassId <= 0) return;

        const allowed = await canAccessLiveClass(socket.user, liveClassId);
        if (!allowed) return;

        io.to(`live:${liveClassId}`).emit('live:hand-raised', {
          userId: socket.user.id,
          userName: socket.user.full_name
        });
      } catch (error) {
        console.error('Error raise hand:', error.message);
      }
    });

    socket.on('live:lower-hand', async (data = {}) => {
      try {
        const liveClassId = Number(data.liveClassId);
        if (!Number.isInteger(liveClassId) || liveClassId <= 0) return;

        const allowed = await canAccessLiveClass(socket.user, liveClassId);
        if (!allowed) return;

        io.to(`live:${liveClassId}`).emit('live:hand-lowered', {
          userId: socket.user.id
        });
      } catch (error) {
        console.error('Error lower hand:', error.message);
      }
    });

    socket.on('quiz:start', async (data = {}) => {
      try {
        const quizId = Number(data.quizId);
        const liveClassId = Number(data.liveClassId);

        if (!Number.isInteger(quizId) || !Number.isInteger(liveClassId) || quizId <= 0 || liveClassId <= 0) {
          return socket.emit('quiz:error', { message: 'Data quiz tidak valid' });
        }

        if (normalizeRole(socket.user.role) !== 'TEACHER') {
          return socket.emit('quiz:error', { message: 'Hanya guru yang boleh memulai quiz' });
        }

        const allowed = await canAccessLiveClass(socket.user, liveClassId);
        if (!allowed) {
          return socket.emit('quiz:error', { message: 'Anda tidak punya akses ke live class ini' });
        }

        await pool.query(
          `UPDATE live_quizzes
           SET status = 'ACTIVE', started_at = NOW(), ended_at = NULL
           WHERE id = :quizId`,
          { quizId }
        );

        const [[quiz]] = await pool.query(
          `SELECT id, question, options, correct_answer, duration_seconds, points
           FROM live_quizzes
           WHERE id = :quizId LIMIT 1`,
          { quizId }
        );

        if (!quiz) {
          return socket.emit('quiz:error', { message: 'Quiz tidak ditemukan' });
        }

        const endsAt = new Date(Date.now() + (Number(quiz.duration_seconds) * 1000));

        io.to(`live:${liveClassId}`).emit('quiz:started', {
          quizId: quiz.id,
          question: quiz.question,
          options: JSON.parse(quiz.options),
          durationSeconds: quiz.duration_seconds,
          points: quiz.points,
          endsAt: endsAt.toISOString()
        });

        setTimeout(() => {
          endQuiz(io, quiz.id, liveClassId).catch((error) => {
            console.error('Error scheduled endQuiz:', error.message);
          });
        }, Number(quiz.duration_seconds) * 1000 + 1000);
      } catch (error) {
        console.error('Error starting quiz:', error.message);
        socket.emit('quiz:error', { message: 'Gagal memulai quiz' });
      }
    });

    socket.on('quiz:answer', async (data = {}) => {
      try {
        const quizId = Number(data.quizId);
        const answer = String(data.answer || '').trim();
        const responseTimeMs = Number(data.responseTimeMs || 0);

        if (!Number.isInteger(quizId) || quizId <= 0 || !answer) {
          return socket.emit('quiz:error', { message: 'Jawaban quiz tidak valid' });
        }

        const [[quiz]] = await pool.query(
          `SELECT id, live_class_id, correct_answer, points, status
           FROM live_quizzes
           WHERE id = :quizId AND status = 'ACTIVE'
           LIMIT 1`,
          { quizId }
        );

        if (!quiz) {
          return socket.emit('quiz:error', { message: 'Quiz tidak aktif' });
        }

        const allowed = await canAccessLiveClass(socket.user, quiz.live_class_id);
        if (!allowed) {
          return socket.emit('quiz:error', { message: 'Tidak diizinkan menjawab quiz ini' });
        }

        const isCorrect = answer === quiz.correct_answer;
        const pointsEarned = isCorrect ? Number(quiz.points || 0) : 0;

        const [[existing]] = await pool.query(
          `SELECT id FROM live_quiz_answers WHERE quiz_id = :quizId AND user_id = :userId LIMIT 1`,
          { quizId, userId: socket.user.id }
        );

        if (existing) {
          await pool.query(
            `UPDATE live_quiz_answers
             SET answer = :answer,
                 is_correct = :isCorrect,
                 answered_at = NOW(),
                 response_time_ms = :responseTimeMs,
                 points_earned = :pointsEarned
             WHERE id = :id`,
            {
              id: existing.id,
              answer,
              isCorrect: isCorrect ? 1 : 0,
              responseTimeMs,
              pointsEarned
            }
          );
        } else {
          await pool.query(
            `INSERT INTO live_quiz_answers (quiz_id, user_id, answer, is_correct, answered_at, response_time_ms, points_earned)
             VALUES (:quizId, :userId, :answer, :isCorrect, NOW(), :responseTimeMs, :pointsEarned)`,
            {
              quizId,
              userId: socket.user.id,
              answer,
              isCorrect: isCorrect ? 1 : 0,
              responseTimeMs,
              pointsEarned
            }
          );
        }

        socket.emit('quiz:submitted', {
          isCorrect,
          pointsEarned
        });

        await scheduleLeaderboardBroadcast(io, quiz.live_class_id);
      } catch (error) {
        console.error('Error submitting quiz answer:', error.message);
        socket.emit('quiz:error', { message: 'Gagal submit jawaban' });
      }
    });

    socket.on('disconnecting', async () => {
      try {
        const liveClassIds = Array.from(socket.data.liveClassIds || []);
        for (const liveClassId of liveClassIds) {
          await markParticipantLeft(liveClassId, socket.user.id);
          const count = await getParticipantCount(liveClassId);
          io.to(`live:${liveClassId}`).emit('live:participant-left', {
            userId: socket.user.id,
            userName: socket.user.full_name,
            participantCount: count
          });
        }
      } catch (error) {
        console.error('Error during disconnect cleanup:', error.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.user.full_name}`);
    });
  });

  console.log('✅ Socket.io initialized');
  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

module.exports = { initializeSocket, getIO };
