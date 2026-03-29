from flask import Blueprint, request, jsonify, current_app
from database import db
from auth_utils import generate_token, token_required
import bcrypt
import random
import smtplib
import datetime
import os
import uuid
from werkzeug.utils import secure_filename
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from bson import ObjectId
import base64

auth_bp = Blueprint('auth', __name__)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ─────────────────────────────────────────────
# PUBLIC CONFIG (exposes non-secret frontend config)
# ─────────────────────────────────────────────
@auth_bp.route('/config', methods=['GET'])
def get_config():
    return jsonify({
        'google_client_id': current_app.config.get('GOOGLE_CLIENT_ID', '')
    }), 200

# ─────────────────────────────────────────────
# REGISTER
# ─────────────────────────────────────────────
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name     = data.get('name', '').strip()
    email    = data.get('email', '').lower().strip()
    password = data.get('password', '')
    role     = data.get('role', 'student')

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400
    if role not in ['faculty', 'student']:
        return jsonify({'error': 'Invalid role'}), 400
    if db.users.find_one({'email': email}):
        return jsonify({'error': 'Email already registered'}), 409

    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    user_id = db.users.insert_one({
        'name': name, 'email': email,
        'password': hashed, 'role': role,
        'auth_provider': 'local'
    }).inserted_id

    token = generate_token(user_id, role)
    return jsonify({'token': token, 'role': role, 'name': name}), 201


# ─────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────
@auth_bp.route('/login', methods=['POST'])
def login():
    data     = request.get_json()
    email    = data.get('email', '').lower().strip()
    password = data.get('password', '')
    role     = data.get('role', '')

    if not email or not password or not role:
        return jsonify({'error': 'Email, password and role are required'}), 400

    user = db.users.find_one({'email': email, 'role': role})
    if not user:
        return jsonify({'error': 'Invalid credentials or role'}), 401

    # Prevent login with password if account is Google-linked only
    if user.get('auth_provider') == 'google' and not user.get('password'):
        return jsonify({'error': 'This account uses Google Sign-In. Please continue with Google.'}), 401

    if not bcrypt.checkpw(password.encode('utf-8'), user['password']):
        return jsonify({'error': 'Invalid credentials'}), 401

    token = generate_token(user['_id'], role)
    return jsonify({'token': token, 'role': role, 'name': user['name']}), 200


# ─────────────────────────────────────────────
# FORGOT PASSWORD — Send OTP
# ─────────────────────────────────────────────
@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    data  = request.get_json()
    email = data.get('email', '').lower().strip()
    role  = data.get('role', '')

    if not email:
        return jsonify({'error': 'Email is required'}), 400

    user = db.users.find_one({'email': email, 'role': role} if role else {'email': email})
    if not user:
        return jsonify({'error': f'No {role or ""} account found with this email address.'}), 404

    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))
    expiry = datetime.datetime.utcnow() + datetime.timedelta(
        minutes=current_app.config['OTP_EXPIRY_MINUTES']
    )

    # Store OTP in DB (replace any existing)
    db.otps.replace_one(
        {'email': email},
        {'email': email, 'otp': otp, 'expiry': expiry, 'verified': False},
        upsert=True
    )

    # Send OTP email
    sent = _send_otp_email(email, user['name'], otp)
    if not sent:
        return jsonify({'error': 'Failed to send OTP email. Check server email configuration.'}), 500

    return jsonify({'message': 'OTP sent to your email address.'}), 200


# ─────────────────────────────────────────────
# VERIFY OTP
# ─────────────────────────────────────────────
@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp():
    data  = request.get_json()
    email = data.get('email', '').lower().strip()
    otp   = data.get('otp', '').strip()

    if not email or not otp:
        return jsonify({'error': 'Email and OTP are required'}), 400

    record = db.otps.find_one({'email': email})
    if not record:
        return jsonify({'error': 'No OTP request found for this email'}), 400

    if datetime.datetime.utcnow() > record['expiry']:
        db.otps.delete_one({'email': email})
        return jsonify({'error': 'OTP has expired. Please request a new one.'}), 400

    if record['otp'] != otp:
        return jsonify({'error': 'Invalid OTP. Please try again.'}), 400

    # Mark OTP as verified
    db.otps.update_one({'email': email}, {'$set': {'verified': True}})
    return jsonify({'message': 'OTP verified successfully.', 'verified': True}), 200


# ─────────────────────────────────────────────
# RESET PASSWORD
# ─────────────────────────────────────────────
@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    data         = request.get_json()
    email        = data.get('email', '').lower().strip()
    new_password = data.get('new_password', '')

    if not email or not new_password:
        return jsonify({'error': 'Email and new password are required'}), 400
    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    # Check OTP was verified
    record = db.otps.find_one({'email': email, 'verified': True})
    if not record:
        return jsonify({'error': 'OTP not verified. Please complete OTP verification first.'}), 403

    hashed = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())
    result = db.users.update_one({'email': email}, {'$set': {'password': hashed}})

    if result.matched_count == 0:
        return jsonify({'error': 'User not found'}), 404

    # Clean up OTP record
    db.otps.delete_one({'email': email})
    return jsonify({'message': 'Password reset successfully. Please log in.'}), 200


# ─────────────────────────────────────────────
# GOOGLE SIGN-IN
# ─────────────────────────────────────────────
@auth_bp.route('/google', methods=['POST'])
def google_signin():
    data       = request.get_json()
    id_token   = data.get('id_token', '')
    role       = data.get('role', 'student')

    if not id_token:
        return jsonify({'error': 'Google ID token is required'}), 400
    if role not in ['faculty', 'student']:
        return jsonify({'error': 'Invalid role'}), 400

    google_client_id = current_app.config.get('GOOGLE_CLIENT_ID', '')
    if not google_client_id:
        return jsonify({'error': 'Google OAuth not configured on server'}), 500

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        id_info = google_id_token.verify_oauth2_token(
            id_token,
            google_requests.Request(),
            google_client_id
        )
    except Exception as e:
        return jsonify({'error': f'Invalid Google token: {str(e)}'}), 401

    g_email = id_info.get('email', '').lower()
    g_name  = id_info.get('name', 'User')

    if not g_email:
        return jsonify({'error': 'Could not retrieve email from Google'}), 400

    # Find or create user
    user = db.users.find_one({'email': g_email, 'role': role})
    if user:
        # Update name if changed
        db.users.update_one({'_id': user['_id']}, {'$set': {'name': g_name, 'auth_provider': 'google'}})
        user_id = user['_id']
    else:
        user_id = db.users.insert_one({
            'name': g_name, 'email': g_email,
            'role': role, 'auth_provider': 'google',
            'password': None
        }).inserted_id

    token = generate_token(user_id, role)
    return jsonify({'token': token, 'role': role, 'name': g_name}), 200


# ─────────────────────────────────────────────
# PROFILE — Get current user
# ─────────────────────────────────────────────
@auth_bp.route('/me', methods=['GET'])
@token_required
def get_me():
    user = db.users.find_one({'_id': ObjectId(request.user_id)})
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({
        'name':    user['name'],
        'email':   user['email'],
        'role':    user['role'],
        'avatar':  user.get('avatar', ''),
        'bio':     user.get('bio', ''),
        'joined':  user.get('joined_at', '').isoformat() if hasattr(user.get('joined_at'), 'isoformat') else ''
    }), 200


# ─────────────────────────────────────────────
# PROFILE — Update name / bio
# ─────────────────────────────────────────────
@auth_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile():
    data = request.get_json()
    name = data.get('name', '').strip()
    bio  = data.get('bio', '').strip()

    if not name:
        return jsonify({'error': 'Name cannot be empty'}), 400

    db.users.update_one(
        {'_id': ObjectId(request.user_id)},
        {'$set': {'name': name, 'bio': bio}}
    )
    # Return fresh token with updated name baked in (optional, name is in storage)
    user = db.users.find_one({'_id': ObjectId(request.user_id)})
    return jsonify({'message': 'Profile updated', 'name': user['name']}), 200


# ─────────────────────────────────────────────
# PROFILE — Upload avatar image
# ─────────────────────────────────────────────
@auth_bp.route('/profile/image', methods=['POST'])
@token_required
def upload_avatar():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    if not allowed_file(file.filename):
        return jsonify({'error': 'Only PNG, JPG, JPEG, GIF, WEBP allowed'}), 400

    # Instead of storing as a file, store as Base64 in MongoDB
    # This works great for small profile photos and avoids file system issues
    file_content = file.read()
    if len(file_content) > 1 * 1024 * 1024:  # 1MB Limit
        return jsonify({'error': 'Image too large. Please upload less than 1MB.'}), 400

    img_base64 = base64.b64encode(file_content).decode('utf-8')
    avatar_data = f"data:{file.content_type};base64,{img_base64}"

    db.users.update_one(
        {'_id': ObjectId(request.user_id)},
        {'$set': {'avatar': avatar_data}}
    )
    return jsonify({'message': 'Avatar updated', 'avatar': avatar_data}), 200


def _send_otp_email(to_email, name, otp):
    cfg = current_app.config
    from_email = cfg.get('MAIL_EMAIL', '')
    password   = cfg.get('MAIL_PASSWORD', '')

    if not from_email or not password:
        current_app.logger.error('Email credentials not configured in .env')
        return False

    try:
        msg = MIMEMultipart('alternative')
        msg['Subject'] = f'🔐 Your QuizPortal OTP Code: {otp}'
        msg['From']    = f'QuizPortal <{from_email}>'
        msg['To']      = to_email

        expiry_mins = cfg.get('OTP_EXPIRY_MINUTES', 10)

        html = f"""
        <html><body style="margin:0;padding:0;background:#0D0D1A;font-family:Inter,Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#0D0D1A;padding:40px 0;">
          <tr><td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:#151528;border-radius:16px;border:1px solid rgba(108,99,255,0.2);overflow:hidden;">
              <tr>
                <td style="background:linear-gradient(135deg,#6C63FF,#4ECDC4);padding:28px;text-align:center;">
                  <h1 style="margin:0;color:white;font-size:24px;font-weight:800;">QuizPortal</h1>
                  <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Password Reset OTP</p>
                </td>
              </tr>
              <tr>
                <td style="padding:36px 40px;">
                  <p style="color:#E8E8FF;font-size:16px;margin:0 0 8px;">Hi <strong>{name}</strong>,</p>
                  <p style="color:#8888aa;font-size:14px;margin:0 0 28px;line-height:1.6;">
                    Use the OTP below to reset your QuizPortal password. This code is valid for <strong style="color:#6C63FF;">{expiry_mins} minutes</strong>.
                  </p>
                  <div style="background:#0D0D1A;border:2px dashed rgba(108,99,255,0.4);border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
                    <span style="font-size:42px;font-weight:900;letter-spacing:14px;color:#6C63FF;font-variant-numeric:tabular-nums;">{otp}</span>
                  </div>
                  <p style="color:#8888aa;font-size:13px;margin:0;line-height:1.6;">
                    If you did not request a password reset, please ignore this email. Your account is safe.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background:#0D0D1A;padding:16px 40px;text-align:center;border-top:1px solid rgba(108,99,255,0.1);">
                  <p style="color:#8888aa;font-size:12px;margin:0;">© 2024 QuizPortal · Smart Learning Platform</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        </body></html>
        """

        msg.attach(MIMEText(html, 'html'))

        with smtplib.SMTP(cfg['MAIL_SERVER'], cfg['MAIL_PORT']) as server:
            server.ehlo()
            server.starttls()
            server.login(from_email, password)
            server.sendmail(from_email, to_email, msg.as_string())

        return True
    except Exception as e:
        current_app.logger.error(f'Email sending failed: {e}')
        return False
