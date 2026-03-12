const express = require('express');
const path = require('path');
const { runPerformanceTest } = require('./check-load-time');

const app = express();
const PORT = 3000;

// Раздаем статические файлы (наш интерфейс)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Основной эндпоинт для запуска тестов через Server-Sent Events (чтобы видеть прогресс)
app.get('/api/run-test', async (req, res) => {
    // Устанавливаем заголовки для потоковой передачи данных
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Получаем параметры
    const url = req.query.url;
    const totalRequests = parseInt(req.query.totalRequests) || 100;
    const concurrency = parseInt(req.query.concurrency) || 10;
    const timeoutMs = parseInt(req.query.timeoutMs) || 3000;

    if (!url) {
        res.write(`data: ${JSON.stringify({ error: 'Не указан URL для тестирования' })}\n\n`);
        return res.end();
    }

    res.write(`data: ${JSON.stringify({ status: 'started', message: `Запуск теста для ${url}...` })}\n\n`);

    try {
        const results = await runPerformanceTest({
            url,
            totalRequests,
            concurrency,
            timeoutMs
        }, (progress) => {
            // Отправляем каждое обновление прогресса в браузер
            res.write(`data: ${JSON.stringify({ status: 'progress', data: progress })}\n\n`);
        });

        // Отправляем финальные результаты
        res.write(`data: ${JSON.stringify({ status: 'completed', data: results })}\n\n`);
    } catch (err) {
        res.write(`data: ${JSON.stringify({ status: 'error', message: err.message })}\n\n`);
    } finally {
        res.end(); // Закрываем соединение
    }
});

app.listen(PORT, () => {
    console.log(`\n=================================================`);
    console.log(`🚀 Веб-интерфейс запущен: http://localhost:${PORT}`);
    console.log(`=================================================\n`);
});