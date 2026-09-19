(function() {
    function abortError() {
        const error = new Error('Media seek aborted');
        error.name = 'AbortError';
        return error;
    }

    function clampTarget(element, time, epsilon = 0.0001) {
        const raw = Math.max(0, Number(time) || 0);
        const duration = Number(element && element.duration);
        if (!Number.isFinite(duration) || !(duration > 0)) return raw;
        return Math.max(0, Math.min(raw, Math.max(0, duration - Math.max(0, Number(epsilon) || 0))));
    }

    function isNear(element, target, tolerance) {
        const current = Number(element && element.currentTime);
        return Number.isFinite(current) && Math.abs(current - target) <= tolerance;
    }

    function seekOnce(element, target, options) {
        const timeout = Math.max(100, Number(options.timeout) || 1200);
        const tolerance = Math.max(0.0001, Number(options.tolerance) || 0.01);
        const signal = options.signal || null;
        return new Promise((resolve, reject) => {
            if (signal && signal.aborted) {
                reject(abortError());
                return;
            }
            let settled = false;
            let timer = 0;
            const cleanup = () => {
                clearTimeout(timer);
                element.removeEventListener('seeked', onProgress);
                element.removeEventListener('timeupdate', onProgress);
                element.removeEventListener('loadeddata', onProgress);
                element.removeEventListener('canplay', onProgress);
                element.removeEventListener('error', onError);
                if (signal) signal.removeEventListener('abort', onAbort);
            };
            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve(target);
            };
            const fail = error => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            };
            const onProgress = () => {
                if (isNear(element, target, tolerance) && !element.seeking) finish();
            };
            const onError = () => fail(new Error('Unable to seek media'));
            const onAbort = () => fail(abortError());
            element.addEventListener('seeked', onProgress);
            element.addEventListener('timeupdate', onProgress);
            element.addEventListener('loadeddata', onProgress);
            element.addEventListener('canplay', onProgress);
            element.addEventListener('error', onError);
            if (signal) signal.addEventListener('abort', onAbort, { once: true });
            timer = setTimeout(() => {
                if (isNear(element, target, tolerance)) finish();
                else fail(new Error('Media seek timed out'));
            }, timeout);
            try {
                element.currentTime = target;
                if (isNear(element, target, tolerance) && !element.seeking) requestAnimationFrame(finish);
            } catch (error) {
                fail(error);
            }
        });
    }

    async function seek(element, time, options = {}) {
        if (!element) throw new Error('Media element unavailable');
        const target = clampTarget(element, time, options.epsilon);
        const tolerance = Math.max(0.0001, Number(options.tolerance) || 0.01);
        if (options.signal && options.signal.aborted) throw abortError();
        if (isNear(element, target, tolerance) && !element.seeking) return target;
        const retries = Math.max(0, Math.min(3, Math.floor(Number(options.retries) || 0)));
        let lastError = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await seekOnce(element, target, options);
            } catch (error) {
                if (error && error.name === 'AbortError') throw error;
                lastError = error;
                if (options.signal && options.signal.aborted) throw abortError();
            }
        }
        throw lastError || new Error('Unable to seek media');
    }

    window.BASMediaSeek = Object.freeze({
        seek,
        clampTarget
    });
})();
