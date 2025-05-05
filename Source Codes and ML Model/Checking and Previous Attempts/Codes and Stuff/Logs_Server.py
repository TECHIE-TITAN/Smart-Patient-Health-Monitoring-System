from flask import Flask, request
import datetime

app = Flask(__name__)

@app.route('/log', methods=['POST'])
def log_data():
    data = request.data.decode("utf-8")
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open("Logs_Server.txt", "a") as f:
        f.write(f"[{timestamp}] {data}")
    print(f"[{timestamp}] {data}", end="")
    return "OK"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)