const BAS_TRUST_CLIENT_DB = 'bas.trust.client.v1';
const BAS_TRUST_CLIENT_STORE = 'identity';
const BAS_TRUST_CLIENT_KEY = 'primary';

const trustClientRuntime = {
    identity: null,
    readyPromise: null,
    available: Boolean(window.crypto?.subtle && window.indexedDB)
};

function trustClientBase64Url(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function trustClientDefaultLabel() {
    const rawPlatform = navigator.userAgentData?.platform || navigator.platform || '';
    const platform = String(rawPlatform).trim().slice(0, 32);
    return platform ? `Boot Animation Studio · ${platform}` : 'Boot Animation Studio browser';
}

function trustClientOpenDb() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(BAS_TRUST_CLIENT_DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(BAS_TRUST_CLIENT_STORE)) db.createObjectStore(BAS_TRUST_CLIENT_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('trust_identity_db_failed'));
    });
}

async function trustClientReadStored() {
    const db = await trustClientOpenDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(BAS_TRUST_CLIENT_STORE, 'readonly');
            const request = tx.objectStore(BAS_TRUST_CLIENT_STORE).get(BAS_TRUST_CLIENT_KEY);
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error || new Error('trust_identity_read_failed'));
        });
    } finally {
        db.close();
    }
}

async function trustClientWriteStored(identity) {
    const db = await trustClientOpenDb();
    try {
        await new Promise((resolve, reject) => {
            const tx = db.transaction(BAS_TRUST_CLIENT_STORE, 'readwrite');
            tx.objectStore(BAS_TRUST_CLIENT_STORE).put(identity, BAS_TRUST_CLIENT_KEY);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error || new Error('trust_identity_write_failed'));
            tx.onabort = () => reject(tx.error || new Error('trust_identity_write_aborted'));
        });
    } finally {
        db.close();
    }
}

async function trustClientIdForPublicJwk(publicJwk) {
    const canonical = `EC|P-256|${publicJwk.x}|${publicJwk.y}`;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    return 'bc_client_' + trustClientBase64Url(digest).slice(0, 32);
}

async function trustClientGenerate() {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const exportedPrivate = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
    const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        exportedPrivate,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['sign']
    );
    new Uint8Array(exportedPrivate).fill(0);
    const id = await trustClientIdForPublicJwk(publicJwk);
    return {
        version: 1,
        id,
        label: trustClientDefaultLabel(),
        createdAt: Date.now(),
        publicJwk: { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y },
        privateKey
    };
}

function trustClientStoredValid(identity) {
    return Boolean(
        identity && identity.version === 1 &&
        typeof identity.id === 'string' && /^bc_client_[A-Za-z0-9_-]{24,48}$/.test(identity.id) &&
        identity.publicJwk?.kty === 'EC' && identity.publicJwk?.crv === 'P-256' &&
        typeof identity.publicJwk.x === 'string' && typeof identity.publicJwk.y === 'string' &&
        identity.privateKey && identity.privateKey.type === 'private'
    );
}

async function trustClientInitialize() {
    if (!trustClientRuntime.available) return null;
    try {
        let identity = await trustClientReadStored();
        if (trustClientStoredValid(identity)) {
            const expectedId = await trustClientIdForPublicJwk(identity.publicJwk);
            if (expectedId !== identity.id) identity = null;
        } else {
            identity = null;
        }
        if (!identity) {
            identity = await trustClientGenerate();
            await trustClientWriteStored(identity);
        }
        trustClientRuntime.identity = identity;
        return identity;
    } catch (error) {
        console.warn('[BAS] Trusted-client identity is unavailable; approval will use the legacy session path.', error);
        trustClientRuntime.available = false;
        trustClientRuntime.identity = null;
        return null;
    }
}

function trustClientReady() {
    if (!trustClientRuntime.readyPromise) trustClientRuntime.readyPromise = trustClientInitialize();
    return trustClientRuntime.readyPromise;
}

function trustClientHeaders() {
    const identity = trustClientRuntime.identity;
    if (!identity) return {};
    return {
        'X-Boot-Creator-Client-ID': identity.id,
        'X-Boot-Creator-Client-Name': String(identity.label || '').slice(0, 80)
    };
}

async function trustClientAuthPayload() {
    const identity = await trustClientReady();
    if (!identity) return null;
    return {
        client_id: identity.id,
        label: String(identity.label || '').slice(0, 80),
        public_key: {
            kty: 'EC', crv: 'P-256', x: identity.publicJwk.x, y: identity.publicJwk.y
        }
    };
}

async function trustClientReconnect(baseUrl) {
    const identity = await trustClientReady();
    if (!identity || !baseUrl) return null;
    const deviceSignal = window.BASMultiDevice?.activeSignal?.();
    const requestHeaders = new Headers({ 'Content-Type': 'application/json', ...trustClientHeaders() });
    try {
        const challengeResponse = await localNetworkFetch(baseUrl + '/auth/trusted/challenge', {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({ client_id: identity.id }),
            signal: mergeAbortSignals(AbortSignal.timeout(4000), deviceSignal)
        });
        const challenge = await challengeResponse.json().catch(() => ({}));
        if (!challengeResponse.ok || challenge.status !== 'challenge' || !challenge.challenge_id || !challenge.message) return null;

        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' },
            identity.privateKey,
            new TextEncoder().encode(String(challenge.message))
        );
        const verifyResponse = await localNetworkFetch(baseUrl + '/auth/trusted/verify', {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({
                client_id: identity.id,
                challenge_id: String(challenge.challenge_id),
                signature: trustClientBase64Url(signature)
            }),
            signal: mergeAbortSignals(AbortSignal.timeout(4000), deviceSignal)
        });
        const verified = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok || verified.status !== 'ok' || !verified.token) return null;
        return verified;
    } catch (error) {
        if (deviceSignal?.aborted) throw error;
        return null;
    }
}

window.BASTrustClient = {
    ready: trustClientReady,
    headers: trustClientHeaders,
    authPayload: trustClientAuthPayload,
    reconnect: trustClientReconnect,
    id: () => trustClientRuntime.identity?.id || '',
    label: () => trustClientRuntime.identity?.label || '',
    available: () => trustClientRuntime.available
};

trustClientReady();
