import os
import sys
import time
import json
import urllib.request
import urllib.parse

BASE_URL = 'http://127.0.0.1:5000'

def log(msg, status="INFO"):
    print(f"[{status}] {msg}")

def run_tests():
    # 1. Test homepage load
    try:
        log("Testing connection to server...")
        with urllib.request.urlopen(f"{BASE_URL}/") as response:
            html = response.read().decode('utf-8')
            assert response.status == 200
            assert "OfficeHub" in html
            log("Homepage loaded successfully (HTTP 200).", "SUCCESS")
    except Exception as e:
        log(f"Failed to connect to server: {e}", "ERROR")
        sys.exit(1)

    # 2. Test status endpoint
    try:
        log("Testing status API...")
        with urllib.request.urlopen(f"{BASE_URL}/api/status") as response:
            data = json.loads(response.read().decode('utf-8'))
            assert response.status == 200
            assert data['status'] == 'online'
            log(f"Status API is active. Connection estimate: {data['active_users_estimate']}", "SUCCESS")
    except Exception as e:
        log(f"Status API test failed: {e}", "ERROR")
        sys.exit(1)

    # 3. Test sending a text message
    try:
        log("Sending test message...")
        message_data = json.dumps({
            'user_name': 'TestBot',
            'content': 'Hello, this is an automated integration test message!'
        }).encode('utf-8')
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/messages",
            data=message_data,
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            assert response.status == 200
            assert data['user_name'] == 'TestBot'
            assert data['type'] == 'text'
            assert 'id' in data
            log(f"Test message sent. Message ID: {data['id']}", "SUCCESS")
            msg_id = data['id']
    except Exception as e:
        log(f"Failed to send text message: {e}", "ERROR")
        sys.exit(1)

    # 4. Test retrieving message history
    try:
        log("Testing chat history API...")
        with urllib.request.urlopen(f"{BASE_URL}/api/messages?limit=10") as response:
            messages = json.loads(response.read().decode('utf-8'))
            assert response.status == 200
            assert len(messages) >= 1
            # Check if our sent message is present
            found = False
            for m in messages:
                if m['user_name'] == 'TestBot' and 'automated integration test' in m['content']:
                    found = True
                    break
            assert found, "Sent message was not found in database history"
            log(f"Chat history read successfully. Found our test message.", "SUCCESS")
    except Exception as e:
        log(f"Chat history API test failed: {e}", "ERROR")
        sys.exit(1)

    # 5. Test file upload endpoint using pure urllib multipart encoding
    try:
        log("Testing file upload API...")
        boundary = '----OfficeHubTestBoundary'
        file_content = b"This is the content of the office-hub automated test file."
        file_name = "automated_test_doc.txt"
        
        # Build multipart/form-data payload
        body = []
        
        # Add user_name field
        body.append(f'--{boundary}'.encode('utf-8'))
        body.append('Content-Disposition: form-data; name="user_name"'.encode('utf-8'))
        body.append(''.encode('utf-8'))
        body.append('TestBot'.encode('utf-8'))
        
        # Add file field
        body.append(f'--{boundary}'.encode('utf-8'))
        body.append(f'Content-Disposition: form-data; name="file"; filename="{file_name}"'.encode('utf-8'))
        body.append('Content-Type: text/plain'.encode('utf-8'))
        body.append(''.encode('utf-8'))
        body.append(file_content)
        
        body.append(f'--{boundary}--'.encode('utf-8'))
        body.append(''.encode('utf-8'))
        
        payload = b'\r\n'.join(body)
        
        req = urllib.request.Request(
            f"{BASE_URL}/api/upload",
            data=payload,
            headers={
                'Content-Type': f'multipart/form-data; boundary={boundary}',
                'Content-Length': str(len(payload))
            }
        )
        
        with urllib.request.urlopen(req) as response:
            upload_res = json.loads(response.read().decode('utf-8'))
            assert response.status == 200
            assert upload_res['user_name'] == 'TestBot'
            assert upload_res['type'] == 'file'
            assert upload_res['file_name'] == file_name
            log(f"File uploaded successfully. Download URL: {upload_res['content']}", "SUCCESS")
            download_url = upload_res['content']
            
            # Verify file exists on disk inside uploads/
            unique_disk_name = download_url.split('/')[-1]
            upload_path = os.path.join(os.path.dirname(__file__), 'uploads', unique_disk_name)
            assert os.path.exists(upload_path), "File was not saved to uploads folder on disk"
            log("Verified file exists on disk in uploads directory.", "SUCCESS")
    except Exception as e:
        log(f"File upload API test failed: {e}", "ERROR")
        sys.exit(1)

    # 6. Test downloading the uploaded file
    try:
        log("Testing file download API...")
        # Add ?download=1 to test download query handling
        with urllib.request.urlopen(f"{BASE_URL}{download_url}") as response:
            downloaded_content = response.read()
            assert response.status == 200
            assert downloaded_content == file_content, "Downloaded file content does not match uploaded content"
            log(f"File downloaded successfully. Content matches perfectly.", "SUCCESS")
    except Exception as e:
        log(f"File download API test failed: {e}", "ERROR")
        sys.exit(1)

    # 7. Test shared files repository API
    try:
        log("Testing shared files repository list...")
        with urllib.request.urlopen(f"{BASE_URL}/api/files") as response:
            files = json.loads(response.read().decode('utf-8'))
            assert response.status == 200
            assert len(files) >= 1
            # Check if our file name is in the repository list
            found = False
            for f in files:
                if f['file_name'] == file_name and f['user_name'] == 'TestBot':
                    found = True
                    break
            assert found, "Uploaded file was not indexed in SQLite database"
            log(f"Shared files repository lists our file correctly.", "SUCCESS")
    except Exception as e:
        log(f"Shared files repository API test failed: {e}", "ERROR")
        sys.exit(1)

    print("\n[SUCCESS] ALL INTEGRATION TESTS PASSED SUCCESSFULLY! The OfficeHub backend, database, and file storage are fully operational.")

if __name__ == "__main__":
    # Wait for server startup if it is still initializing
    time.sleep(1)
    run_tests()
