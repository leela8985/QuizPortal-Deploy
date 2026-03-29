from flask import Blueprint, request, jsonify
from database import db
from auth_utils import student_required
from bson import ObjectId
import datetime

student_bp = Blueprint('student', __name__)

@student_bp.route('/quizzes', methods=['GET'])
@student_required
def get_available_quizzes():
    quizzes = list(db.quizzes.find({'active': True}, {'questions': 0}))
    attempted_ids = [a['quiz_id'] for a in db.attempts.find({'student_id': request.user_id})]
    
    result = []
    for q in quizzes:
        q['_id'] = str(q['_id'])
        q['already_attempted'] = q['_id'] in attempted_ids
        q['created_at'] = q['created_at'].isoformat() if 'created_at' in q else None
        result.append(q)
    return jsonify(result), 200

@student_bp.route('/quizzes/<quiz_id>/start', methods=['GET'])
@student_required
def start_quiz(quiz_id):
    quiz = db.quizzes.find_one({'_id': ObjectId(quiz_id), 'active': True})
    if not quiz:
        return jsonify({'error': 'Quiz not found'}), 404

    # Check if already attempted
    existing = db.attempts.find_one({'quiz_id': quiz_id, 'student_id': request.user_id})
    if existing:
        return jsonify({'error': 'You have already attempted this quiz'}), 400

    # Return questions without the answers
    questions = []
    for q in quiz['questions']:
        questions.append({
            'id': q['id'],
            'question': q['question'],
            'options': q['options']
        })

    return jsonify({
        'quiz_id': str(quiz['_id']),
        'title': quiz['title'],
        'subject': quiz['subject'],
        'time_limit': quiz['time_limit'],
        'total_questions': quiz['total_questions'],
        'questions': questions
    }), 200

@student_bp.route('/quizzes/<quiz_id>/submit', methods=['POST'])
@student_required
def submit_quiz(quiz_id):
    quiz = db.quizzes.find_one({'_id': ObjectId(quiz_id), 'active': True})
    if not quiz:
        return jsonify({'error': 'Quiz not found'}), 404

    existing = db.attempts.find_one({'quiz_id': quiz_id, 'student_id': request.user_id})
    if existing:
        return jsonify({'error': 'Already submitted'}), 400

    data = request.get_json()
    answers = data.get('answers', {})  # {question_id: selected_option}

    score = 0
    result_details = []

    for q in quiz['questions']:
        qid = str(q['id'])
        selected = answers.get(qid, '').upper()
        correct = q['answer'].upper()
        is_correct = selected == correct
        if is_correct:
            score += 1

        result_details.append({
            'question_id': q['id'],
            'question': q['question'],
            'options': q['options'],
            'selected': selected,
            'correct_answer': correct,
            'is_correct': is_correct,
            'explanation': q.get('explanation', '')
        })

    total = quiz['total_questions']
    percentage = round((score / total) * 100, 1) if total else 0

    # Get student name
    student = db.users.find_one({'_id': ObjectId(request.user_id)})
    student_name = student['name'] if student else 'Unknown'

    attempt = {
        'student_id': request.user_id,
        'student_name': student_name,
        'quiz_id': quiz_id,
        'quiz_title': quiz['title'],
        'score': score,
        'total': total,
        'percentage': percentage,
        'answers': answers,
        'result_details': result_details,
        'submitted_at': datetime.datetime.utcnow()
    }
    db.attempts.insert_one(attempt)

    return jsonify({
        'score': score,
        'total': total,
        'percentage': percentage,
        'result_details': result_details,
        'grade': get_grade(percentage)
    }), 200

@student_bp.route('/results', methods=['GET'])
@student_required
def get_my_results():
    attempts = list(db.attempts.find({'student_id': request.user_id}))
    results = []
    for a in attempts:
        results.append({
            'quiz_id': a['quiz_id'],
            'quiz_title': a.get('quiz_title', 'Unknown'),
            'score': a['score'],
            'total': a['total'],
            'percentage': a['percentage'],
            'grade': get_grade(a['percentage']),
            'submitted_at': a['submitted_at'].isoformat() if hasattr(a['submitted_at'], 'isoformat') else str(a['submitted_at'])
        })
    return jsonify(results), 200

@student_bp.route('/results/<quiz_id>', methods=['GET'])
@student_required
def get_result_detail(quiz_id):
    attempt = db.attempts.find_one({'quiz_id': quiz_id, 'student_id': request.user_id})
    if not attempt:
        return jsonify({'error': 'No attempt found'}), 404

    attempt['_id'] = str(attempt['_id'])
    attempt['submitted_at'] = attempt['submitted_at'].isoformat() if hasattr(attempt['submitted_at'], 'isoformat') else str(attempt['submitted_at'])
    attempt['grade'] = get_grade(attempt['percentage'])
    return jsonify(attempt), 200

@student_bp.route('/log-violation', methods=['POST'])
@student_required
def log_violation():
    data = request.get_json()
    violation = {
        'student_id': request.user_id,
        'quiz_id': data.get('quiz_id'),
        'type': data.get('type'),
        'timestamp': datetime.datetime.utcnow(),
        'severity': data.get('severity', 'warning')
    }
    db.violation_logs.insert_one(violation)
    return jsonify({'status': 'logged'}), 200

def get_grade(pct):
    if pct >= 90: return 'A+'
    if pct >= 80: return 'A'
    if pct >= 70: return 'B+'
    if pct >= 60: return 'B'
    if pct >= 50: return 'C'
    return 'F'
