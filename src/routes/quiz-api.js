const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Create live quiz (Teacher only)
router.post('/api/live-quizzes', requireRole('TEACHER'), async (req, res) => {
  try {
    const { liveClassId, question, options, correctAnswer, durationSeconds } = req.body;

    const [result] = await pool.query(
      `INSERT INTO live_quizzes (live_class_id, question, options, correct_answer, duration_seconds, points)
       VALUES (:liveClassId, :question, :options, :correctAnswer, :durationSeconds, 10)`,
      {
        liveClassId,
        question,
        options: JSON.stringify(options),
        correctAnswer,
        durationSeconds: durationSeconds || 30
      }
    );

    res.json({
      success: true,
      quizId: result.insertId,
      message: 'Quiz created successfully'
    });
  } catch (error) {
    console.error('Error creating quiz:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create quiz'
    });
  }
});

// Get quiz results
router.get('/api/live-quizzes/:id/results', requireAuth, async (req, res) => {
  try {
    const quizId = req.params.id;

    const [results] = await pool.query(
      `SELECT u.full_name, lqa.answer, lqa.is_correct, lqa.points_earned, lqa.response_time_ms
       FROM live_quiz_answers lqa
       JOIN users u ON u.id = lqa.user_id
       WHERE lqa.quiz_id = :quizId
       ORDER BY lqa.points_earned DESC, lqa.response_time_ms ASC`,
      { quizId }
    );

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('Error fetching quiz results:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch results'
    });
  }
});

module.exports = router;
