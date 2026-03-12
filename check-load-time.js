const puppeteer = require('puppeteer');

/**
 * Запускает тест производительности
 */
async function runPerformanceTest({ url, totalRequests, concurrency, timeoutMs }, onProgress, checkCancelled = () => false) {
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
        let status = 0;
        let loadTime = 0;
        let error = null;

        try {
            page = await browser.newPage();
            await page.setCacheEnabled(false);
            
            const response = await page.goto(url, { waitUntil: 'load', timeout: 5000 });
            loadTime = Date.now() - startTime;
            status = response ? response.status() : 500;
            
            if (status >= 400) {
                failedRequests++;
            } else {
                if (loadTime > timeoutMs) {
                    slowRequests++;
                }
                successfulRequests++;
            }
        } catch (err) {
            error = err.message;
            if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
                status = 'Timeout';
                loadTime = Date.now() - startTime;
                slowRequests++;
                successfulRequests++; 
            } else {
                status = 'Error';
                failedRequests++;
            }
        } finally {
            if (page) await page.close();
            completedRequests++;
            
            if (onProgress) {
                onProgress({ 
                    completedRequests, 
                    totalRequests, 
                    slowRequests, 
                    failedRequests, 
                    successfulRequests,
                    lastResult: {
                        taskId,
                        status,
                        loadTime,
                        error
                    }
                });
            }
        }
    };

    const tasks = Array.from({ length: totalRequests }, (_, i) => i + 1);

    const doWork = async () => {
        while (tasks.length > 0) {
            // Если была дана команда на остановку - прерываем цикл задач
            if (checkCancelled()) break;

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