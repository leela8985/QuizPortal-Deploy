from pymongo import MongoClient
from flask import current_app, g

class Database:
    _client = None

    def init_app(self, app):
        self.uri = app.config['MONGO_URI']

    def get_db(self):
        if self._client is None:
            self._client = MongoClient(self.uri)
        # Handle cases with query parameters (split by '?' then by '/')
        db_name = self.uri.split('?')[0].split('/')[-1]
        # Default to 'quiz_portal' if empty
        if not db_name:
            db_name = 'quiz_portal'
        return self._client[db_name]

    @property
    def users(self):
        return self.get_db()['users']

    @property
    def quizzes(self):
        return self.get_db()['quizzes']

    @property
    def attempts(self):
        return self.get_db()['attempts']

    @property
    def otps(self):
        return self.get_db()['otps']

    @property
    def violation_logs(self):
        return self.get_db()['violation_logs']

db = Database()
