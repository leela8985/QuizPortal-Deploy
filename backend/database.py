from pymongo import MongoClient
from flask import current_app, g

class Database:
    _client = None

    def init_app(self, app):
        self.uri = app.config['MONGO_URI']

    def get_db(self):
        if self._client is None:
            self._client = MongoClient(self.uri)
        db_name = self.uri.split('/')[-1]
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

db = Database()
