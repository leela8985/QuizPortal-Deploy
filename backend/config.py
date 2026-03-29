import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'quiz_portal_secret_2024')
    MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/quiz_portal')
    JWT_EXPIRY_HOURS = 24

    # Email config (Gmail SMTP)
    MAIL_EMAIL = os.environ.get('MAIL_EMAIL', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_SERVER = 'smtp.gmail.com'
    MAIL_PORT = 587

    # Google OAuth
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '')

    # OTP expiry in minutes
    OTP_EXPIRY_MINUTES = 10
