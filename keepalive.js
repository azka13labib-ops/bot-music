// ============================================
// keepalive.js - Dummy Web Server
// Wajib ada agar HuggingFace tidak matikan Space
// ============================================

const http = require("http");

function keepAlive() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bot is Online ✅");
  });

  server.listen(7860, "0.0.0.0", () => {
    console.log("[KeepAlive] Web server berjalan di port 7860");
  });
}

module.exports = keepAlive;