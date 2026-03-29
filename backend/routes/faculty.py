from flask import Blueprint, request, jsonify
from database import db
from auth_utils import faculty_required
import csv
import io
from bson import ObjectId
import datetime

faculty_bp = Blueprint('faculty', __name__)

@faculty_bp.route('/upload-quiz', methods=['POST'])
@faculty_required
def upload_quiz():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    quiz_title = request.form.get('title', 'Untitled Quiz')
    quiz_subject = request.form.get('subject', 'General')
    time_limit = int(request.form.get('time_limit', 30))  # minutes

    if not file.filename.endswith('.csv'):
        return jsonify({'error': 'Only CSV files are supported'}), 400

    stream = io.StringIO(file.stream.read().decode('UTF8'), newline=None)
    reader = csv.DictReader(stream)

    questions = []
    required_cols = {'Question', 'A', 'B', 'C', 'D', 'Answer'}
    
    headers = set(reader.fieldnames or [])
    if not required_cols.issubset(headers):
        missing = required_cols - headers
        return jsonify({'error': f'Missing CSV columns: {", ".join(missing)}'}), 400

    for i, row in enumerate(reader):
        question = {
            'id': i + 1,
            'question': row['Question'].strip(),
            'options': {
                'A': row['A'].strip(),
                'B': row['B'].strip(),
                'C': row['C'].strip(),
                'D': row['D'].strip()
            },
            'answer': row['Answer'].strip().upper(),
            'explanation': row.get('explanation', '').strip()
        }
        questions.append(question)

    if not questions:
        return jsonify({'error': 'CSV file has no questions'}), 400

    quiz = {
        'title': quiz_title,
        'subject': quiz_subject,
        'time_limit': time_limit,
        'questions': questions,
        'total_questions': len(questions),
        'faculty_id': request.user_id,
        'created_at': datetime.datetime.utcnow(),
        'active': True
    }

    quiz_id = db.quizzes.insert_one(quiz).inserted_id
    return jsonify({'message': 'Quiz uploaded successfully', 'quiz_id': str(quiz_id), 'total_questions': len(questions)}), 201

@faculty_bp.route('/quizzes', methods=['GET'])
@faculty_required
def get_quizzes():
    quizzes = list(db.quizzes.find({'faculty_id': request.user_id}))
    for q in quizzes:
        q['_id'] = str(q['_id'])
        q.pop('questions', None)
        q['created_at'] = q['created_at'].isoformat() if 'created_at' in q else None
    return jsonify(quizzes), 200

@faculty_bp.route('/quizzes/<quiz_id>', methods=['DELETE'])
@faculty_required
def delete_quiz(quiz_id):
    result = db.quizzes.delete_one({'_id': ObjectId(quiz_id), 'faculty_id': request.user_id})
    if result.deleted_count == 0:
        return jsonify({'error': 'Quiz not found'}), 404
    return jsonify({'message': 'Quiz deleted'}), 200

@faculty_bp.route('/analytics', methods=['GET'])
@faculty_required
def get_analytics():
    # Get all quizzes by this faculty
    quizzes = list(db.quizzes.find({'faculty_id': request.user_id}, {'_id': 1, 'title': 1, 'subject': 1, 'total_questions': 1}))
    quiz_ids = [str(q['_id']) for q in quizzes]
    quiz_map = {str(q['_id']): q['title'] for q in quizzes}

    # Get all attempts for these quizzes
    attempts = list(db.attempts.find({'quiz_id': {'$in': quiz_ids}}))

    # Student performance table
    student_data = {}
    quiz_stats = {}

    for attempt in attempts:
        sid = attempt['student_id']
        qid = attempt['quiz_id']
        score = attempt['score']
        total = attempt['total']
        pct = round((score / total) * 100, 1) if total else 0

        if sid not in student_data:
            student_data[sid] = {
                'student_name': attempt.get('student_name', 'Unknown'),
                'attempts': []
            }
        student_data[sid]['attempts'].append({
            'quiz_title': quiz_map.get(qid, 'Unknown'),
            'score': score,
            'total': total,
            'percentage': pct,
            'submitted_at': attempt.get('submitted_at', '').isoformat() if hasattr(attempt.get('submitted_at'), 'isoformat') else str(attempt.get('submitted_at', ''))
        })

        if qid not in quiz_stats:
            quiz_stats[qid] = {'title': quiz_map.get(qid, 'Unknown'), 'scores': [], 'attempts_count': 0}
        quiz_stats[qid]['scores'].append(pct)
        quiz_stats[qid]['attempts_count'] += 1

    # Compute averages for quiz stats
    quiz_chart_data = []
    for qid, stat in quiz_stats.items():
        avg = round(sum(stat['scores']) / len(stat['scores']), 1) if stat['scores'] else 0
        quiz_chart_data.append({
            'quiz_title': stat['title'],
            'avg_score': avg,
            'attempts': stat['attempts_count'],
            'pass_rate': round(len([s for s in stat['scores'] if s >= 50]) / len(stat['scores']) * 100, 1) if stat['scores'] else 0
        })

    return jsonify({
        'students': list(student_data.values()),
        'quiz_stats': quiz_chart_data,
        'total_students': len(student_data),
        'total_attempts': len(attempts),
        'total_quizzes': len(quizzes)
    }), 200
