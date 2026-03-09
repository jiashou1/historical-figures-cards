// 简单的本地代理服务器
// 运行方式: node server.js

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-DashScope-SSE');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API 代理
    if (req.url === '/api/qwen') {
        handleQwenProxy(req, res);
        return;
    }

    // 静态文件服务
    let filePath = req.url === '/' ? '/index.html' : req.url;
    filePath = path.join(__dirname, filePath);

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

// 通义千问 API 代理
function handleQwenProxy(req, res) {
    let body = '';

    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', () => {
        console.log('收到 API 请求 / Received API request');
        console.log('Authorization header:', req.headers['authorization'] ? '已设置 (set)' : '未设置 (not set)');

        const apiReq = https.request({
            hostname: 'dashscope.aliyuncs.com',
            path: '/api/v1/services/aigc/text-generation/generation',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers['authorization'] || '',
                'X-DashScope-SSE': 'enable'
            }
        }, (apiRes) => {
            console.log('API 响应状态码 / API response status:', apiRes.statusCode);

            // 收集响应体用于调试
            let responseBody = '';
            apiRes.on('data', chunk => {
                responseBody += chunk;
            });

            apiRes.on('end', () => {
                if (apiRes.statusCode !== 200) {
                    console.log('API 错误响应 / API error response:', responseBody);
                }
            });

            res.writeHead(apiRes.statusCode, {
                'Content-Type': apiRes.headers['content-type'] || 'application/json'
            });
            apiRes.pipe(res);
        });

        apiReq.on('error', (err) => {
            console.error('Proxy error:', err);
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        });

        apiReq.write(body);
        apiReq.end();
    });
}

server.listen(PORT, () => {
    console.log(`服务器已启动: http://localhost:${PORT}`);
    console.log('按 Ctrl+C 停止服务器');
});
