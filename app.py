import os
import sqlite3
import time
import json
import queue
import uuid
import threading
from flask import Flask, request, jsonify, send_from_directory, Response, abort
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
DATABASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'office_hub.db')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024  # 200 MB upload limit
app.config['SECRET_KEY'] = 'officehub-secret-key-12345'

# Ensure upload directory exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Thread-safe SSE client pool
clients = []
clients_lock = threading.Lock()

# Database Helper Functions
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,        -- 'text', 'file', 'system'
                user_name TEXT NOT NULL,
                content TEXT NOT NULL,
                file_name TEXT,
                file_size INTEGER,
                timestamp REAL NOT NULL
            )
        ''')
        conn.commit()

# Initialize DB on import
init_db()

# Broadcast a message to all connected SSE clients
def broadcast(message_type, user_name, content, file_name=None, file_size=None, msg_id=None):
    msg_id = msg_id or str(uuid.uuid4())
    timestamp = time.time()
    
    msg_data = {
        'id': msg_id,
        'type': message_type,
        'user_name': user_name,
        'content': content,
        'file_name': file_name,
        'file_size': file_size,
        'timestamp': timestamp
    }
    
    # Broadcast to SSE queues
    with clients_lock:
        for q in clients:
            try:
                q.put_nowait(msg_data)
            except queue.Full:
                pass
                
    return msg_data

# Routes

# Serve main page
@app.route('/')
def index():
    # We serve index.html from templates folder
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')
    return send_from_directory(templates_dir, 'index.html')

# Serve PWA files and other static assets
@app.route('/static/<path:path>')
def serve_static(path):
    static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static')
    return send_from_directory(static_dir, path)

# SSE Stream for real-time notifications and messages
@app.route('/api/stream')
def stream():
    q = queue.Queue(maxsize=200)
    with clients_lock:
        clients.append(q)
        
    def event_stream():
        try:
            # Send initial connection success event
            yield f"data: {json.dumps({'type': 'system', 'content': 'Connected to OfficeHub real-time server', 'user_name': 'Server'})}\n\n"
            
            while True:
                try:
                    # Check for new broadcast messages (block for 20 seconds)
                    msg = q.get(timeout=20.0)
                    yield f"data: {json.dumps(msg)}\n\n"
                except queue.Empty:
                    # Send a keep-alive ping to prevent connection timeout
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        except GeneratorExit:
            pass
        finally:
            with clients_lock:
                if q in clients:
                    clients.remove(q)
                    
    return Response(event_stream(), mimetype="text/event-stream")

# Get past messages (history)
@app.route('/api/messages', methods=['GET'])
def get_messages():
    limit = request.args.get('limit', 100, type=int)
    before_timestamp = request.args.get('before', None, type=float)
    
    query = 'SELECT * FROM messages'
    params = []
    
    if before_timestamp:
        query += ' WHERE timestamp < ?'
        params.append(before_timestamp)
        
    query += ' ORDER BY timestamp DESC LIMIT ?'
    params.append(limit)
    
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute(query, params)
        rows = cursor.fetchall()
        
    messages = []
    for r in rows:
        messages.append({
            'id': r['id'],
            'type': r['type'],
            'user_name': r['user_name'],
            'content': r['content'],
            'file_name': r['file_name'],
            'file_size': r['file_size'],
            'timestamp': r['timestamp']
        })
        
    # Return in chronological order
    messages.reverse()
    return jsonify(messages)

# Send a text message
@app.route('/api/messages', methods=['POST'])
def send_message():
    data = request.json
    if not data or 'user_name' not in data or 'content' not in data:
        return jsonify({'error': 'Missing user_name or content'}), 400
        
    user_name = data['user_name'].strip()
    content = data['content'].strip()
    
    if not user_name or not content:
        return jsonify({'error': 'Fields cannot be empty'}), 400
        
    msg_id = str(uuid.uuid4())
    timestamp = time.time()
    
    # Save to database
    with get_db() as conn:
        conn.execute(
            'INSERT INTO messages (id, type, user_name, content, timestamp) VALUES (?, ?, ?, ?, ?)',
            (msg_id, 'text', user_name, content, timestamp)
        )
        conn.commit()
        
    # Broadcast
    msg_data = broadcast('text', user_name, content, msg_id=msg_id)
    return jsonify(msg_data)

# Upload a file
@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
        
    file = request.files['file']
    user_name = request.form.get('user_name', 'Anonymous').strip()
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
        
    if file:
        original_name = secure_filename(file.filename)
        # Handle empty/invalid filenames after secure_filename
        if not original_name:
            original_name = f"upload_{int(time.time())}"
            
        # Create a unique filename on disk to prevent overwrites
        file_uuid = uuid.uuid4().hex[:8]
        unique_name = f"{file_uuid}_{original_name}"
        file_path = os.path.join(app.config['UPLOAD_FOLDER'], unique_name)
        
        # Save file to disk
        file.save(file_path)
        
        # Make the uploaded file read-only on the system to prevent modification or accidental destruction
        try:
            import stat
            os.chmod(file_path, stat.S_IREAD | stat.S_IRGRP | stat.S_IROTH)
        except Exception as e:
            app.logger.warning(f"Could not set read-only permissions on {file_path}: {e}")
            
        file_size = os.path.getsize(file_path)
        
        # We will use /uploads/<unique_name> as the download URL
        download_url = f"/uploads/{unique_name}"
        
        msg_id = str(uuid.uuid4())
        timestamp = time.time()
        
        # Save metadata to DB
        with get_db() as conn:
            conn.execute(
                '''INSERT INTO messages (id, type, user_name, content, file_name, file_size, timestamp) 
                   VALUES (?, ?, ?, ?, ?, ?, ?)''',
                (msg_id, 'file', user_name, download_url, original_name, file_size, timestamp)
            )
            conn.commit()
            
        # Broadcast upload event
        msg_data = broadcast('file', user_name, download_url, file_name=original_name, file_size=file_size, msg_id=msg_id)
        return jsonify(msg_data)
        
    return jsonify({'error': 'Upload failed'}), 500

# Download/serve uploaded files
@app.route('/uploads/<filename>')
def get_upload(filename):
    # Ensure safe filename path
    safe_name = secure_filename(filename)
    # We want to support serving it with its original file name for downloads
    # Find file size or record in database if needed, but Flask send_from_directory handles standard range/headers.
    
    # Retrieve from DB to get the original user-friendly filename if possible
    download_name = None
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT file_name FROM messages WHERE content LIKE ?", (f'%{safe_name}%',))
        row = cursor.fetchone()
        if row:
            download_name = row['file_name']
            
    # Send from directory
    return send_from_directory(
        app.config['UPLOAD_FOLDER'], 
        safe_name, 
        download_name=download_name, 
        as_attachment=(request.args.get('download') == '1')
    )

# Get shared files list (all uploaded files, sorted by date)
@app.route('/api/files', methods=['GET'])
def get_files():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM messages WHERE type = 'file' ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        
    files = []
    for r in rows:
        files.append({
            'id': r['id'],
            'user_name': r['user_name'],
            'content': r['content'], # URL
            'file_name': r['file_name'],
            'file_size': r['file_size'],
            'timestamp': r['timestamp']
        })
    return jsonify(files)

# Status/Heartbeat endpoint
@app.route('/api/status', methods=['GET'])
def get_status():
    with clients_lock:
        active_connections = len(clients)
    return jsonify({
        'status': 'online',
        'active_users_estimate': active_connections,
        'server_time': time.time()
    })

if __name__ == '__main__':
    # Initialize schema
    init_db()
    # Listen on all network interfaces on port 5000
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
