# 🚀 Deploying Quiz Portal to Render

I've updated the project to be production-ready for **Render.com**. Follow these simple steps to get your project live:

## 1. Prerequisites
- A [GitHub](https://github.com) or [GitLab](https://gitlab.com) account.
- A [Render](https://render.com) account.
- A **MongoDB Atlas** database (Render free tier doesn't include a database).

---

## 2. Push Your Code to GitHub
Ensure you've committed all the changes (I've already updated the JS files to use production-safe paths).

```bash
git init
git add .
git commit -m "Prepare for deployment"
# ... push to your repository ...
```

---

## 3. Create a New Web Service on Render
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository.
4. **Configuration settings**:
   - **Name**: `quiz-portal`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r backend/requirements.txt`
   - **Start Command**: `gunicorn --chdir backend app:app`

---

## 4. Set Environment Variables
In the Render dashboard, click the **Environment** tab and add these:

| Key | Value (Example) |
|---|---|
| `MONGO_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `SECRET_KEY` | (Keep what I generated or use a long random string) |
| `MAIL_EMAIL` | Your Gmail address (for OTPs) |
| `MAIL_PASSWORD` | Your Gmail App Password |
| `GOOGLE_CLIENT_ID` | (Optional) Your Google OAuth ID |

---

## ⚠️ Important Note on Uploads
Currently, profile photos are saved in an `uploads` folder. On Render's free tier, these files will be **deleted** when the server restarts or sleeps. 

> [!TIP]
> For production use, consider using a cloud storage service like **Cloudinary** or **AWS S3** for persistent media storage.

---

## ✅ Deployment Checklist
- [x] Updated JS files to use `/api` instead of `localhost:5000`
- [x] `gunicorn` added to `requirements.txt`
- [x] `render.yaml` created
