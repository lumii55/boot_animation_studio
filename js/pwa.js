const BAS_PWA_VERSION = '12.11C';
const basPwaState = {
    version: BAS_PWA_VERSION,
    supported: 'serviceWorker' in navigator,
    secureContext: window.isSecureContext,
    registration: null,
    error: null
};
window.BASPWA = basPwaState;

async function registerBASPWA() {
    if (!basPwaState.supported || !basPwaState.secureContext) return null;
    try {
        basPwaState.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
        return basPwaState.registration;
    } catch (error) {
        basPwaState.error = error;
        return null;
    }
}

window.addEventListener('load', registerBASPWA, { once: true });
