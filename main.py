from app import app as flask_app

def app(request):
    return flask_app(request)