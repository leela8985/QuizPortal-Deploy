import os
from flask import Flask, send_from_directory, jsonify
from flask_cors import CORS
from config import Config
from database import db
from routes.auth import auth_bp
from routes.faculty import faculty_bp
from routes.student import student_bp

# Frontend path is ../frontend relative to this file
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend'))
UPLOADS_DIR  = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'uploads'))
os.makedirs(UPLOADS_DIR, exist_ok=True)

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path='')
app.config.from_object(Config)
CORS(app, supports_credentials=True)

# Initialize DB
db.init_app(app)

# Register Blueprints
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(faculty_bp, url_prefix='/api/faculty')
app.register_blueprint(student_bp, url_prefix='/api/student')

# ── Global JSON error handlers (prevents HTML responses to API calls) ──
@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    app.logger.error(traceback.format_exc())
    return jsonify({'error': str(e)}), 500

# Serve frontend pages
@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    return send_from_directory(UPLOADS_DIR, filename)

@app.route('/<path:filename>')
def frontend_files(filename):
    if filename.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(FRONTEND_DIR, filename)

if __name__ == '__main__':
    app.run(debug=True, port=5000)
