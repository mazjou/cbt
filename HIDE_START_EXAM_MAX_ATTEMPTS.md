# Hide "Mulai Ujian" Card When Max Attempts Reached

## Changes Made

### 1. Updated Route: `src/routes/student.js`
- Modified `/exams/:id` route to fetch attempt results when max attempts reached
- Query fetches all attempts sorted by score (best first) and submission date
- Includes status (Lulus/Tidak Lulus) based on pass_score comparison
- Results passed to view as `attemptResults` array

### 2. Updated View: `src/views/student/exam_detail.ejs`
- Added conditional logic: `if (exam.attempts_count >= exam.max_attempts)`
- When max attempts reached:
  - Hides "Mulai Ujian" card
  - Shows "Hasil Ujian" card with amber/yellow gradient
  - Displays all attempt results with scores and status badges
  - Shows best score prominently at bottom
  - Includes link to full history page
- When attempts still available:
  - Shows original "Mulai Ujian" card with form

## Features

### Results Display
- Each attempt shown in separate card with:
  - Attempt number
  - Score with color coding (green for pass, red for fail)
  - Status badge (Lulus/Tidak Lulus)
  - Submission date and time
- Best score highlighted in special card at bottom
- Link to view complete history

### Visual Design
- Amber/yellow gradient for results card (warning color)
- Green borders for passing attempts
- Red borders for failing attempts
- Responsive layout maintained

## Testing
1. Take exam until max attempts reached
2. Verify "Mulai Ujian" card is hidden
3. Verify results card shows all attempts
4. Verify best score is displayed correctly
5. Check status badges show correct pass/fail status
