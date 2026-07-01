"""Local dev server — serves config.js with real Airtable credentials injected in memory.
Reads AT_BASE and AT_TOKEN from environment variables (set by serve-local.ps1).
config.js on disk is never modified.
"""
import http.server, os, re, sys

AT_BASE  = os.environ.get('AT_BASE', '')
AT_TOKEN = os.environ.get('AT_TOKEN', '')

if not AT_BASE or not AT_TOKEN:
    print("ERROR: AT_BASE / AT_TOKEN not set in environment.")
    sys.exit(1)

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?')[0] == '/js/config.js':
            try:
                with open('js/config.js', 'r', encoding='utf-8-sig') as f:
                    content = f.read()
                content = content.replace('__AT_BASE__',  AT_BASE)
                content = content.replace('__AT_TOKEN__', AT_TOKEN)
                content = re.sub(r"app[X]{8,}",       AT_BASE,  content)
                content = re.sub(r"pat[X]{8,}\.[X]+", AT_TOKEN, content)
                data = content.encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/javascript; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            except Exception as e:
                self.send_error(500, str(e))
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        pass  # suppress per-request noise

port = 8080
print(f"  Serving at http://localhost:{port}  (Ctrl+C to stop)")
http.server.HTTPServer(('', port), Handler).serve_forever()
