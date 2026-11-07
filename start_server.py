import http.server
import socketserver
import mimetypes

# Force correct MIME types regardless of Windows Registry corruption
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('text/html', '.html')

PORT = 8080

class FixedMimeHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Use sys.stdout with utf-8 encoding to avoid cp950 errors
        import sys
        sys.stdout.buffer.write(
            ("%s - - [%s] %s\n" % (
                self.address_string(),
                self.log_date_time_string(),
                format % args
            )).encode('utf-8')
        )
        sys.stdout.flush()

print("Starting server with fixed MIME types...")
print("Registered: .js -> application/javascript")

try:
    with socketserver.TCPServer(("", PORT), FixedMimeHandler) as httpd:
        httpd.allow_reuse_address = True
        print("Server running at http://localhost:%d" % PORT)
        print("Press Ctrl+C to stop.")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("Server stopped.")
except Exception as e:
    print("Error: %s" % str(e))
