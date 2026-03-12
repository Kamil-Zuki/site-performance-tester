const puppeteer = require('puppeteer');

(async () => {
    console.log('Запуск теста производительности: 100 запросов с рендерингом...');
    const url = 'https://test.steos.io/company/individuals';
    const totalRequests = 100;
    const concurrency = 10; // Открываем 10 вкладок одновременно
    const timeoutMs = 3000;
    
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
            // Отключаем кэш, чтобы тесты были честными (каждый раз как первый заход)
            await page.setCacheEnabled(false);
            
            // waitUntil: 'load' ждет загрузки всех ресурсов (картинок, скриптов, стилей)
            await page.goto(url, { waitUntil: 'load', timeout: 5000 });
            const loadTime = Date.now() - startTime;
            
            if (loadTime > timeoutMs) {
                slowRequests++;
            }
            successfulRequests++;
        } catch (err) {
            if (err.name === 'TimeoutError' || err.message.includes('timeout')) {
                // Если был таймаут, значит грузилось дольше 5с (и точно дольше 3с)
                slowRequests++;
                successfulRequests++; // засчитаем как успешный "медленный" заход, если страница начала грузиться
            } else {
                failedRequests++;
            }
        } finally {
            if (page) await page.close();
            completedRequests++;
            // Выводим прогресс в консоль
            process.stdout.write(`\rВыполнено: ${completedRequests}/${totalRequests} | Дольше 3с: ${slowRequests} | Ошибок: ${failedRequests}`);
        }
    };

    // Создаем очередь задач
    const tasks = Array.from({ length: totalRequests }, (_, i) => i + 1);

    // Функция-worker, которая берет задачи из очереди
    const doWork = async () => {
        while (tasks.length > 0) {
            const taskId = tasks.shift();
            await runTask(taskId);
        }
    };

    // Запускаем worker-ы
    const workers = Array(concurrency).fill(null).map(() => doWork());
    await Promise.all(workers);

    console.log('\n\n--- ИТОГИ ---');
    console.log(`Всего запросов: ${totalRequests}`);
    console.log(`Успешно завершено: ${successfulRequests}`);
    console.log(`С ошибками (недоступно): ${failedRequests}`);
    console.log(`Загружались дольше 3-5 секунд: ${slowRequests}`);
    console.log(`Загружались быстрее 3 секунд: ${successfulRequests - slowRequests}`);
    
    await browser.close();
})();
