// Debug script untuk melihat data yang dikirim dari bulk reset form
const express = require('express');
const app = express();

// Middleware untuk parsing form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Test route untuk melihat data yang diterima
app.post('/test-bulk-reset', (req, res) => {
  console.log('=== DEBUG BULK RESET DATA ===');
  console.log('req.body:', req.body);
  console.log('req.body keys:', Object.keys(req.body));
  
  // Test berbagai kemungkinan nama field
  console.log('attempt_ids[]:', req.body['attempt_ids[]']);
  console.log('attempt_ids:', req.body.attempt_ids);
  console.log('ids[]:', req.body['ids[]']);
  console.log('ids:', req.body.ids);
  
  // Test jika data dikirim sebagai JSON
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      console.log('Parsed JSON:', parsed);
    } catch (e) {
      console.log('Not JSON string');
    }
  }
  
  res.json({
    received: req.body,
    keys: Object.keys(req.body),
    message: 'Debug data logged to console'
  });
});

app.listen(3001, () => {
  console.log('Debug server running on port 3001');
  console.log('Send POST request to http://localhost:3001/test-bulk-reset');
});