const puppeteer = require('puppeteer');

/**
 * Запускает тест производительности
 */
async function runPerformanceTest({ url, totalRequests, concurrency, timeoutMs }, onProgress) {
    let slowRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let completedRequests = 0;
    
    // Запускаем headless браузер
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const runTask = async (taskId) => {
        let page;
        const startTime = Date.now();
        try {
            page = await browser.newPage();
            // Отключаем кэш
            await page.setCacheEnabled(false);
            
            await page.goto(url, { waitUntil: 'load', timeout: 5000 });
            const loadTime = Date.now() - startTime;
            
            if (loadTime > timeoutMs) {
                slowRequests++;
            }
            successfulRequests++;
        } catch (err) {
            if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
                // Если был таймаут, значит грузилось дольше лимита в 5с
                slowRequests++;
                successfulRequests++; // засчитаем как "успешный" с точки зрения доступности, но медленный
            } else {
                failedRequests++;
            }
        } finally {
            if (page) await page.close();
            completedRequests++;
            
            // Если передан коллбэк прогресса - вызываем его
            if (onProgress) {
                onProgress({ completedRequests, totalRequests, slowRequests, failedRequests, successfulRequests });
            }
        }
    };

    const tasks = Array.from({ length: totalRequests }, (_, i) => i + 1);

    const doWork = async () => {
        while (tasks.length > 0) {
            const taskId = tasks.shift();
            await runTask(taskId);
        }
    };

    const workers = Array(concurrency).fill(null).map(() => doWork());
    await Promise.all(workers);
    await browser.close();

    return {
        totalRequests,
        successfulRequests,
        failedRequests,
        slowRequests,
        fastRequests: successfulRequests - slowRequests
    };
}

// Если скрипт запущен напрямую из консоли
if (require.main === module) {
    (async () => {
        console.log('Запуск теста производительности из консоли (100 запросов)...');
        const url = 'https://test.steos.io/company/individuals';
        
        const results = await runPerformanceTest({
            url,
            totalRequests: 100,
            concurrency: 10,
            timeoutMs: 3000
        }, (progress) => {
            process.stdout.write(`\rВыполнено: ${progress.completedRequests}/${progress.totalRequests} | Дольше 3с: ${progress.slowRequests} | Ошибок: ${progress.failedRequests}`);
        });

        console.log('\n\n--- ИТОГИ ---');
        console.log(`Всего запросов: ${results.totalRequests}`);
        console.log(`Успешно завершено: ${results.successfulRequests}`);
        console.log(`С ошибками (недоступно): ${results.failedRequests}`);
        console.log(`Загружались дольше 3-5 секунд: ${results.slowRequests}`);
        console.log(`Загружались быстрее 3 секунд: ${results.fastRequests}`);
    })();
}

module.exports = { runPerformanceTest };