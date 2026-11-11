const BAS_MULTI_DEVICE_VERSION = 1;
const BAS_MULTI_DEVICE_STORAGE_KEY = 'bas.multiDevice.registry.v1';
const BAS_MULTI_DEVICE_STORAGE_VERSION = 1;
const BAS_MULTI_DEVICE_LIMIT = 24;

const BAS_MULTI_DEVICE_STORAGE_SCHEMA = window.BASPersistenceSchema?.define({
    id: 'browser.multi-device-registry',
    currentVersion: BAS_MULTI_DEVICE_STORAGE_VERSION,
    minimumVersion: 0,
    versionField: 'version',
    policy: 'tolerant-preference',
    owner: 'BASMultiDevice',
    storage: `localStorage:${BAS_MULTI_DEVICE_STORAGE_KEY}`,
    notes: 'Legacy arrays/unversioned wrappers migrate in-memory; future wrappers remain untouched while runtime discovery stays available.',
    migrations: {
        0(value) {
            return { version: 1, devices: Array.isArray(value.devices) ? value.devices : [] };
        }
    }
});

const multiDeviceRuntime = {
    devices: new Map(),
    activeId: '',
    selectedId: '',
    scanning: false,
    scanGeneration: 0,
    bound: false,
    requestController: new AbortController(),
    unloadSent: false,
    storageWriteBlocked: false
};

function multiDeviceText(key, fallback) {
    try {
        const table = traducoes[idiomaAtual] || traducoes.en;
        return table && table[key] ? table[key] : fallback;
    } catch (error) {
        return fallback;
    }
}

function multiDeviceNormalizeBaseUrl(value) {
    try {
        const raw = String(value || '').trim();
        const url = new URL(raw.includes('://') ? raw : `http://${raw}:4040`);
        if (!url.port) url.port = url.protocol === 'https:' ? '4041' : '4040';
        const host = url.hostname.replace(/^\[|\]$/g, '');
        if (!isPrivateIPv4(host) && host !== '127.0.0.1' && host !== 'localhost') return '';
        if (!((url.protocol === 'http:' && url.port === '4040') ||
              (url.protocol === 'https:' && url.port === '4041'))) return '';
        if (url.username || url.password) return '';
        url.pathname = '';
        url.search = '';
        url.hash = '';
        return url.origin;
    } catch (error) {
        return '';
    }
}

function multiDeviceIpFromBase(baseUrl) {
    try { return new URL(baseUrl).hostname.replace(/^\[|\]$/g, ''); } catch (error) { return ''; }
}

function multiDeviceIdentity(info, ip) {
    const bridge = String(info?.bridge_id || '').trim();
    if (/^bc_[A-Za-z0-9_-]{20,64}$/.test(bridge)) return bridge;
    return `legacy:${ip}`;
}

function multiDeviceClone(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
}

function multiDeviceSanitizeStored(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const baseUrl = multiDeviceNormalizeBaseUrl(raw.baseUrl || raw.ip || '');
    const ip = multiDeviceIpFromBase(baseUrl);
    if (!baseUrl || !ip) return null;
    const id = String(raw.id || `legacy:${ip}`);
    if (!/^bc_[A-Za-z0-9_-]{20,64}$/.test(id) && !/^legacy:(?:\d{1,3}\.){3}\d{1,3}$/.test(id)) return null;
    return {
        id,
        baseUrl,
        ip,
        stableIdentity: id.startsWith('bc_'),
        model: String(raw.model || '').slice(0, 120),
        resolution: String(raw.resolution || '').slice(0, 48),
        lastSeen: Number(raw.lastSeen) || 0,
        lastConnected: Number(raw.lastConnected) || 0,
        apiVersion: Number(raw.apiVersion) || 0,
        moduleVersion: String(raw.moduleVersion || '').slice(0, 48),
        token: '',
        connected: false,
        info: null,
        compatibilityMode: 'unknown',
        permission: 'admin',
        features: [],
        hasCustom: false
    };
}


function multiDeviceStorageEnvelope(parsed) {
    if (Array.isArray(parsed)) return { version: 0, devices: parsed };
    if (!parsed || typeof parsed !== 'object') return { version: 0, devices: [] };
    if (!Object.prototype.hasOwnProperty.call(parsed, 'version')) return { ...parsed, version: 0 };
    return parsed;
}

function multiDeviceLoad() {
    multiDeviceRuntime.storageWriteBlocked = false;
    try {
        const raw = JSON.parse(localStorage.getItem(BAS_MULTI_DEVICE_STORAGE_KEY) || '{}');
        const envelope = multiDeviceStorageEnvelope(raw);
        const inspection = BAS_MULTI_DEVICE_STORAGE_SCHEMA ? BASPersistenceSchema.inspect(BAS_MULTI_DEVICE_STORAGE_SCHEMA, envelope) : { disposition: 'current' };
        if (inspection.disposition === 'future') {
            multiDeviceRuntime.storageWriteBlocked = true;
            console.warn('[BAS] Multi-Device registry was created by a newer BAS build; preserving storage while allowing transient discovery.');
            return;
        }
        const parsed = BAS_MULTI_DEVICE_STORAGE_SCHEMA ? BASPersistenceSchema.migrate(BAS_MULTI_DEVICE_STORAGE_SCHEMA, envelope) : envelope;
        (Array.isArray(parsed.devices) ? parsed.devices : []).slice(0, BAS_MULTI_DEVICE_LIMIT).forEach(raw => {
            const device = multiDeviceSanitizeStored(raw);
            if (device) multiDeviceRuntime.devices.set(device.id, device);
        });
    } catch (error) {
        multiDeviceRuntime.devices.clear();
    }
}

function multiDevicePersist() {
    if (multiDeviceRuntime.storageWriteBlocked) return false;
    try {
        const devices = Array.from(multiDeviceRuntime.devices.values())
            .sort((a, b) => Math.max(b.lastConnected, b.lastSeen) - Math.max(a.lastConnected, a.lastSeen))
            .slice(0, BAS_MULTI_DEVICE_LIMIT)
            .map(device => ({
                id: device.id,
                baseUrl: device.baseUrl,
                ip: device.ip,
                model: device.model,
                resolution: device.resolution,
                lastSeen: device.lastSeen,
                lastConnected: device.lastConnected,
                apiVersion: device.apiVersion,
                moduleVersion: device.moduleVersion
            }));
        localStorage.setItem(BAS_MULTI_DEVICE_STORAGE_KEY, JSON.stringify({ version: BAS_MULTI_DEVICE_STORAGE_VERSION, devices }));
        return true;
    } catch (error) {
        return false;
    }
}

// TLS is an explicit trust choice. Discovery and state snapshots may update IPs,
// but must never silently convert a verified secure bridge to plaintext.
function multiDeviceRetainSecureTransport(previous, proposed) {
    if (!previous?.startsWith('https://') || !proposed?.startsWith('http://')) return proposed;
    // A local HTTP address is only allowed after a successful loopback /info
    // probe. Never invent an HTTPS localhost URL from an unverified candidate.
    if (proposed === 'http://127.0.0.1:4040') return previous;
    const ip = multiDeviceIpFromBase(proposed);
    return ip ? `https://${ip}:4041` : previous;
}

function multiDeviceUpsert(candidate) {
    if (!candidate) return null;
    const baseUrl = multiDeviceNormalizeBaseUrl(candidate.baseUrl || candidate.ip || '');
    const ip = multiDeviceIpFromBase(baseUrl);
    if (!baseUrl || !ip) return null;
    const info = candidate.info && typeof candidate.info === 'object' ? candidate.info : null;
    const id = String(candidate.id || multiDeviceIdentity(info, ip));
    let device = multiDeviceRuntime.devices.get(id);

    // Upgrade a legacy IP identity to the persistent module identity as soon as a new bridge advertises one.
    if (!device && id.startsWith('bc_')) {
        const legacyId = `legacy:${ip}`;
        const legacy = multiDeviceRuntime.devices.get(legacyId);
        if (legacy) {
            multiDeviceRuntime.devices.delete(legacyId);
            legacy.id = id;
            legacy.stableIdentity = true;
            // Re-register under the stable id (it used to vanish from the registry here).
            multiDeviceRuntime.devices.set(id, legacy);
            device = legacy;
            if (multiDeviceRuntime.activeId === legacyId) multiDeviceRuntime.activeId = id;
            if (multiDeviceRuntime.selectedId === legacyId) multiDeviceRuntime.selectedId = id;
        }
    }

    if (!device) {
        device = {
            id, baseUrl, ip, stableIdentity: id.startsWith('bc_'), model: '', resolution: '',
            lastSeen: 0, lastConnected: 0, apiVersion: 0, moduleVersion: '', token: '', connected: false,
            info: null, compatibilityMode: 'unknown', permission: 'admin', features: [], hasCustom: false
        };
        multiDeviceRuntime.devices.set(id, device);
    }
    // A successful /info response from 127.0.0.1 proves this is the
    // Companion on the current device, not a LAN discovery downgrade.
    // Keep HTTPS pinned for all other discoveries; local loopback can use the
    // dedicated HTTP-only-on-device listener, regardless of a stored HTTPS URL.
    const verifiedLoopback = candidate.verifiedLoopback === true &&
        baseUrl === 'http://127.0.0.1:4040' &&
        info && Number.isInteger(Number(info.api_version));
    device.baseUrl = verifiedLoopback ? baseUrl : multiDeviceRetainSecureTransport(device.baseUrl, baseUrl);
    device.ip = multiDeviceIpFromBase(device.baseUrl);
    device.stableIdentity = id.startsWith('bc_');
    device.lastSeen = Date.now();
    if (info) {
        device.info = multiDeviceClone(info);
        device.apiVersion = Number(info.api_version) || device.apiVersion || 0;
        device.moduleVersion = String(info.module_version || device.moduleVersion || '');
        if (Array.isArray(info.features)) device.features = info.features.filter(value => typeof value === 'string');
    }
    const publicModel = candidate.model || info?.model || '';
    if (publicModel) device.model = String(publicModel).slice(0, 120);
    if (candidate.resolution) device.resolution = String(candidate.resolution).slice(0, 48);
    multiDevicePersist();
    return device;
}

function multiDeviceCurrent() {
    return multiDeviceRuntime.activeId ? multiDeviceRuntime.devices.get(multiDeviceRuntime.activeId) || null : null;
}

function multiDeviceCaptureGlobals() {
    const current = multiDeviceCurrent();
    if (!current) return;
    current.baseUrl = multiDeviceRetainSecureTransport(current.baseUrl,
        multiDeviceNormalizeBaseUrl(IP_LOCAL) || current.baseUrl);
    current.ip = multiDeviceIpFromBase(current.baseUrl) || current.ip;
    current.token = String(sessionToken || '');
    current.connected = Boolean(isConnectedMode && current.token);
    current.model = String(window.connectedPhoneModel || current.model || '');
    current.resolution = String(window.connectedPhoneResolution || current.resolution || '');
    current.hasCustom = Boolean(window.hasCustomAnimApplied);
    current.info = moduleInfo ? multiDeviceClone(moduleInfo) : current.info;
    current.apiVersion = Number(moduleApiVersion) || current.apiVersion || 0;
    current.features = Array.from(moduleFeatures || []);
    current.compatibilityMode = String(moduleCompatibilityMode || 'unknown');
    current.permission = normalizeModuleAccessPermission(moduleAccessPermission);
    if (current.connected) current.lastConnected = Date.now();
    multiDevicePersist();
}

function multiDeviceRotateRequestScope() {
    try { multiDeviceRuntime.requestController.abort(); } catch (error) {}
    multiDeviceRuntime.requestController = new AbortController();
}

function multiDeviceActiveSignal() {
    return multiDeviceRuntime.requestController.signal;
}

function multiDeviceApplyRecord(device) {
    if (!device) return;
    // Switching the active route must not let a snapshot of the old globals
    // overwrite a newly verified loopback route for this same bridge ID.
    const selectedBaseUrl = device.baseUrl;
    const selectedIp = device.ip;
    multiDeviceCaptureGlobals();
    device.baseUrl = selectedBaseUrl;
    device.ip = selectedIp;
    multiDeviceRotateRequestScope();
    multiDeviceRuntime.activeId = device.id;
    IP_LOCAL = device.baseUrl;
    sessionToken = String(device.token || '');
    moduleInfo = device.info ? multiDeviceClone(device.info) : null;
    moduleApiVersion = device.apiVersion || null;
    moduleFeatures = new Set(Array.isArray(device.features) ? device.features : []);
    moduleCompatibilityMode = String(device.compatibilityMode || 'unknown');
    moduleAccessPermission = normalizeModuleAccessPermission(device.permission);
    window.connectedPhoneModel = String(device.model || '');
    window.connectedPhoneResolution = String(device.resolution || '');
    window.hasCustomAnimApplied = Boolean(device.hasCustom);
    if (window.BASDeviceIntelligence?.reset) window.BASDeviceIntelligence.reset();
    if (window.BASPlaylist?.resetConnection) window.BASPlaylist.resetConnection();
    if (window.BASRotation?.resetConnection) window.BASRotation.resetConnection();
    if (window.BASBootActivity?.resetConnection) window.BASBootActivity.resetConnection();
    if (window.BASTrustCenter?.resetConnection) window.BASTrustCenter.resetConnection();
}

function multiDevicePrepareBase(baseUrl, info = null) {
    const normalized = multiDeviceNormalizeBaseUrl(baseUrl);
    // This path is reached only after a successful loopback /info probe.
    const device = multiDeviceUpsert({ baseUrl: normalized, info,
        verifiedLoopback: normalized === 'http://127.0.0.1:4040' });
    if (!device) return null;
    multiDeviceApplyRecord(device);
    return device;
}

function multiDeviceSnapshotGlobals() {
    return {
        activeId: multiDeviceRuntime.activeId,
        IP_LOCAL,
        sessionToken,
        moduleInfo: moduleInfo ? multiDeviceClone(moduleInfo) : null,
        moduleApiVersion,
        moduleFeatures: Array.from(moduleFeatures || []),
        moduleCompatibilityMode,
        moduleAccessPermission,
        isConnectedMode,
        model: String(window.connectedPhoneModel || ''),
        resolution: String(window.connectedPhoneResolution || ''),
        hasCustom: Boolean(window.hasCustomAnimApplied)
    };
}

function multiDeviceRestoreGlobals(snapshot) {
    if (!snapshot) return;
    multiDeviceRotateRequestScope();
    multiDeviceRuntime.activeId = snapshot.activeId || '';
    IP_LOCAL = snapshot.IP_LOCAL;
    sessionToken = snapshot.sessionToken;
    moduleInfo = snapshot.moduleInfo ? multiDeviceClone(snapshot.moduleInfo) : null;
    moduleApiVersion = snapshot.moduleApiVersion;
    moduleFeatures = new Set(snapshot.moduleFeatures || []);
    moduleCompatibilityMode = snapshot.moduleCompatibilityMode || 'unknown';
    moduleAccessPermission = normalizeModuleAccessPermission(snapshot.moduleAccessPermission);
    isConnectedMode = Boolean(snapshot.isConnectedMode);
    window.connectedPhoneModel = snapshot.model || '';
    window.connectedPhoneResolution = snapshot.resolution || '';
    window.hasCustomAnimApplied = Boolean(snapshot.hasCustom);
}

function multiDeviceCaptureCompatibility(info) {
    const baseUrl = multiDeviceNormalizeBaseUrl(IP_LOCAL);
    const ip = multiDeviceIpFromBase(baseUrl);
    if (!baseUrl || !ip) return null;
    const device = multiDeviceUpsert({ baseUrl, info });
    if (!device) return null;
    multiDeviceRuntime.activeId = device.id;
    device.info = info ? multiDeviceClone(info) : device.info;
    device.apiVersion = Number(moduleApiVersion) || Number(info?.api_version) || 0;
    device.features = Array.from(moduleFeatures || []);
    device.compatibilityMode = String(moduleCompatibilityMode || 'unknown');
    multiDevicePersist();
    multiDeviceRender();
    return device;
}

function multiDeviceCaptureConnected(data) {
    const baseUrl = multiDeviceNormalizeBaseUrl(IP_LOCAL);
    const ip = multiDeviceIpFromBase(baseUrl);
    if (!baseUrl || !ip) return null;
    const info = moduleInfo && typeof moduleInfo === 'object' ? moduleInfo : { bridge_id: data?.bridge_id };
    const device = multiDeviceUpsert({ baseUrl, info, model: data?.model, resolution: data?.resolution });
    if (!device) return null;
    multiDeviceRuntime.activeId = device.id;
    device.token = String(sessionToken || '');
    device.connected = Boolean(device.token);
    device.model = String(data?.model || window.connectedPhoneModel || device.model || '');
    device.resolution = String(data?.resolution || window.connectedPhoneResolution || device.resolution || '');
    device.hasCustom = Boolean(data?.has_custom);
    device.lastConnected = Date.now();
    device.info = moduleInfo ? multiDeviceClone(moduleInfo) : device.info;
    device.apiVersion = Number(moduleApiVersion) || device.apiVersion || 0;
    device.features = Array.from(moduleFeatures || []);
    device.compatibilityMode = String(moduleCompatibilityMode || 'unknown');
    device.permission = normalizeModuleAccessPermission(data?.permission || moduleAccessPermission);
    multiDevicePersist();
    multiDeviceRender();
    return device;
}

function multiDeviceCaptureDisconnected() {
    const device = multiDeviceCurrent();
    if (device) {
        device.token = '';
        device.connected = false;
        device.hasCustom = false;
        multiDevicePersist();
    }
    multiDeviceRender();
}

function multiDeviceConnectedCount() {
    return Array.from(multiDeviceRuntime.devices.values()).filter(device => device.connected && device.token).length;
}

async function multiDeviceProbeIP(ip, timeout = 850) {
    if (!isPrivateIPv4(ip) && ip !== '127.0.0.1') return null;
    const baseUrl = `http://${ip}:4040`;

    // Current/public modules expose /info. Prefer it because it carries API/capability
    // metadata and, on P13.9A+, the stable bridge id + public device model.
    const infoController = new AbortController();
    const infoTimer = setTimeout(() => infoController.abort(), timeout);
    try {
        const response = await localNetworkFetch(baseUrl + '/info', { signal: infoController.signal });
        if (response.ok) {
            const info = await response.json().catch(() => null);
            if (info && Number.isInteger(Number(info.api_version))) {
                const device = multiDeviceUpsert({ baseUrl, info,
                    verifiedLoopback: ip === '127.0.0.1' });
                return device ? { ...device, token: device.token } : null;
            }
        }
    } catch (error) {
        // A timeout/no-host result is not useful for a second probe. A real older
        // module normally answers /info quickly with 404, which falls through below.
        if (infoController.signal.aborted) return null;
    } finally {
        clearTimeout(infoTimer);
    }

    // Compatibility fallback for older secure Companion Modules that predate /info.
    // /ping is discovery-only here: it identifies a BAS bridge, but no session token,
    // feature set or privileged device metadata is inferred from it.
    const pingController = new AbortController();
    const pingTimer = setTimeout(() => pingController.abort(), Math.max(450, Math.min(timeout, 1200)));
    try {
        const response = await localNetworkFetch(baseUrl + '/ping', { signal: pingController.signal });
        if (!response.ok) return null;
        const data = await response.json().catch(() => null);
        const status = String(data?.status || '');
        if (status !== 'auth_required' && status !== 'ok') return null;
        const device = multiDeviceUpsert({ baseUrl, info: null, model: data?.model || '', resolution: data?.resolution || '' });
        if (device) device.compatibilityMode = 'legacy_pending';
        return device ? { ...device, token: device.token } : null;
    } catch (error) {
        return null;
    } finally {
        clearTimeout(pingTimer);
    }
}

// v1.5+ Companion Modules accept other devices only over HTTPS :4041. A probe succeeds
// only once this browser trusts the device's self-signed certificate; an untrusted
// certificate and a closed port look the same (a network error), so this never
// "discovers" an untrusted module, it only confirms a trusted one.
async function multiDeviceProbeSecure(ip, timeout = 2500) {
    if (!isPrivateIPv4(ip)) return null;
    const baseUrl = `https://${ip}:4041`;
    try {
        const response = await localNetworkFetch(baseUrl + '/info', { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
        if (!response.ok) return null;
        const info = await response.json().catch(() => null);
        if (!info || !Number.isInteger(Number(info.api_version))) return null;
        return multiDeviceUpsert({ baseUrl, info });
    } catch (error) {
        return null;
    }
}

// v1.5+ LAN discovery signal: a separate, discovery-only listener on :4042 that answers
// GET /discover with {"service":"bas-companion","api_version":N,"secure_port":4041} and
// nothing else (no model, id or state). It only tells the Studio that a phone is there;
// connecting still requires HTTPS :4041 and normal authorization.
async function multiDeviceProbeBeacon(ip, timeout = 850) {
    if (!isPrivateIPv4(ip)) return null;
    try {
        const response = await localNetworkFetch(`http://${ip}:4042/discover`, { signal: AbortSignal.timeout(timeout), cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json().catch(() => null);
        if (data?.service !== 'bas-companion' || data.secure_port !== 4041 || !Number.isInteger(Number(data.api_version))) return null;
        const known = Array.from(multiDeviceRuntime.devices.values()).find(device => device.ip === ip);
        const baseUrl = `https://${ip}:4041`;
        const device = multiDeviceUpsert(known ? { id: known.id, baseUrl } : { baseUrl, info: null });
        if (!device) return null;
        // Already trusted? Then fill in the real identity/capabilities over HTTPS.
        return (await multiDeviceProbeSecure(ip, 1500)) || device;
    } catch (error) {
        return null;
    }
}

// Both generations answer on different ports; probe them together. A v1.4 answer wins.
async function multiDeviceProbeHost(ip, timeout) {
    const [legacy, beacon] = await Promise.all([multiDeviceProbeIP(ip, timeout), multiDeviceProbeBeacon(ip, timeout)]);
    return legacy || beacon;
}

function multiDeviceNeedsSecureSetup(device) {
    return Boolean(device && String(device.baseUrl || '').startsWith('https://') && !device.info && !(device.connected && device.token));
}

// Certificate onboarding. fetch() cannot show the browser's certificate warning, so the
// Studio opens the module's /trust page in a new tab. Once the user accepts the warning,
// that page posts {type: 'bas-companion-trusted'} back to this tab and closes itself.
// If the message never arrives (pop-up rules, browsers without window.opener), the
// connection is retried when the Studio tab regains focus.
const BAS_SECURE_TRUST_MAX_AGE_MS = 10 * 60 * 1000;
const multiDeviceSecureTrust = { pending: null };

function multiDeviceIpFromInput(value) {
    const raw = String(value || '').trim();
    try {
        const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
        const host = url.hostname.replace(/^\[|\]$/g, '');
        return isPrivateIPv4(host) ? host : '';
    } catch (error) {
        return '';
    }
}

function multiDeviceBeginSecureTrust(ip) {
    if (!isPrivateIPv4(ip)) return false;
    const base = `https://${ip}:4041`;
    const returnUrl = window.location.origin + window.location.pathname;
    const url = `${base}/trust?return=${encodeURIComponent(returnUrl)}`;
    multiDeviceSecureTrust.pending = { ip, base, startedAt: Date.now(), completing: false };
    const desc = document.getElementById('lbl-modal-net-desc');
    if (desc) desc.textContent = multiDeviceText('msgSecureTrustWaiting', 'Waiting for you to accept the certificate in the other tab…');
    let opened = null;
    // Not "noopener": the /trust page needs window.opener to notify this tab.
    try { opened = window.open(url, 'bas-companion-trust'); } catch (error) { opened = null; }
    if (!opened) {
        alert(multiDeviceText('msgSecurePopupBlocked', 'The browser blocked the new tab. Allow pop-ups for this site, or open {url} yourself, accept the certificate and come back.').replace('{url}', url));
    }
    return false;
}

async function multiDeviceCompleteSecureTrust() {
    const pending = multiDeviceSecureTrust.pending;
    if (!pending || pending.completing) return false;
    if (Date.now() - pending.startedAt > BAS_SECURE_TRUST_MAX_AGE_MS) {
        multiDeviceSecureTrust.pending = null;
        return false;
    }
    pending.completing = true;
    // Some browsers (seen on the Xbox Edge) take a moment to apply the certificate decision
    // to requests from this tab, so retry briefly before giving up.
    let device = null;
    for (const delay of [0, 700, 1500, 3000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (multiDeviceSecureTrust.pending !== pending) return false;
        device = await multiDeviceProbeSecure(pending.ip, 4000);
        if (device) break;
    }
    if (!device) {
        pending.completing = false;
        return false;
    }
    multiDeviceSecureTrust.pending = null;
    return multiDeviceConnectRecord(device.id, { verified: true });
}

function multiDeviceOnTrustMessage(event) {
    const pending = multiDeviceSecureTrust.pending;
    if (!pending || event.origin !== pending.base) return;
    if (!event.data || event.data.type !== 'bas-companion-trusted') return;
    multiDeviceCompleteSecureTrust();
}

function multiDeviceOnTrustReturn() {
    if (document.visibilityState === 'hidden' || !multiDeviceSecureTrust.pending) return;
    multiDeviceCompleteSecureTrust();
}

async function multiDeviceConnectSecure(rawAddress) {
    const ip = multiDeviceIpFromInput(rawAddress);
    if (!ip) {
        alert(multiDeviceText('msgNotFound', 'Module not found!'));
        return false;
    }
    await window.BASApi?.ensureLocalNetworkAccess?.(`https://${ip}:4041/info`);
    const trusted = await multiDeviceProbeSecure(ip);
    if (trusted) return multiDeviceConnectRecord(trusted.id, { verified: true });
    return multiDeviceBeginSecureTrust(ip);
}

async function multiDeviceScanSubnet(subnet, exactSet, generation) {
    const results = [];
    const hosts = [];
    for (let host = 2; host <= 254; host++) {
        const ip = `${subnet}.${host}`;
        if (!exactSet.has(ip)) hosts.push(ip);
    }
    const chunkSize = 48;
    for (let start = 0; start < hosts.length; start += chunkSize) {
        if (multiDeviceRuntime.scanGeneration !== generation) return results;
        const batch = hosts.slice(start, start + chunkSize);
        const found = await Promise.all(batch.map(ip => multiDeviceProbeHost(ip, 700)));
        found.filter(Boolean).forEach(device => results.push(device));
    }
    return results;
}

async function multiDeviceScan(options = {}) {
    const generation = ++multiDeviceRuntime.scanGeneration;
    multiDeviceRuntime.scanning = true;
    multiDeviceRender();
    const sampleIp = rememberedPhoneIp() || '192.168.0.1';
    await window.BASApi?.ensureLocalNetworkAccess?.(`http://${sampleIp}:4040/info`, () => {
        const desc = document.getElementById('lbl-modal-net-desc');
        if (desc) desc.textContent = multiDeviceText('msgAllowLocalNetwork', 'Allow local network access in your browser to find your phone…');
    });
    if (multiDeviceRuntime.scanGeneration !== generation) return [];
    const exact = [];
    const subnets = [];
    const addIp = ip => {
        if (!isPrivateIPv4(ip) || exact.includes(ip)) return;
        exact.push(ip);
        const subnet = subnetFromIPv4(ip);
        if (subnet && !subnets.includes(subnet)) subnets.push(subnet);
    };
    addIp(rememberedPhoneIp());
    addIp(currentPhoneIp());
    const input = document.getElementById('input-ip');
    if (input) {
        const value = input.value.trim();
        if (isPrivateIPv4(value)) addIp(value);
        const prefix = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.$/.exec(value);
        if (prefix) {
            const parts = prefix.slice(1).map(Number);
            if (parts.every(part => part >= 0 && part <= 255)) {
                const subnet = parts.join('.');
                if (!subnets.includes(subnet)) subnets.push(subnet);
            }
        }
    }
    try {
        const locals = await discoverLocalIPv4s(900);
        locals.forEach(ip => {
            const subnet = subnetFromIPv4(ip);
            if (subnet && !subnets.includes(subnet)) subnets.push(subnet);
        });
    } catch (error) {
    }
    ['192.168.0', '192.168.1', '192.168.15', '10.0.0'].forEach(subnet => {
        if (!subnets.includes(subnet)) subnets.push(subnet);
    });

    const exactSet = new Set(exact);
    const found = [];
    // Always offer the on-device Companion, even when all LAN probes fail.
    // The loopback route remains usable on this phone after remote HTTP was
    // intentionally removed in P14.12.
    const onDevice = await multiDeviceProbeIP('127.0.0.1', 1100);
    if (onDevice) found.push(onDevice);
    // Modules this browser already trusts over HTTPS (v1.5+): re-confirm them directly.
    const secureKnown = Array.from(multiDeviceRuntime.devices.values())
        .filter(device => String(device.baseUrl || '').startsWith('https://'))
        .map(device => device.ip);
    for (const ip of Array.from(new Set(secureKnown))) {
        if (multiDeviceRuntime.scanGeneration !== generation) break;
        const device = await multiDeviceProbeSecure(ip, 1500);
        if (device) found.push(device);
    }
    for (const ip of exact) {
        if (multiDeviceRuntime.scanGeneration !== generation) break;
        const device = await multiDeviceProbeHost(ip, 1100);
        if (device) found.push(device);
    }
    for (const subnet of subnets.slice(0, 3)) {
        if (multiDeviceRuntime.scanGeneration !== generation) break;
        const batch = await multiDeviceScanSubnet(subnet, exactSet, generation);
        found.push(...batch);
    }
    const unique = Array.from(new Map(found.map(device => [device.id, device])).values());
    multiDeviceRuntime.scanning = Boolean(options.keepScanningOnEmpty && !unique.length);
    multiDevicePersist();
    multiDeviceRender();
    return unique;
}

function multiDeviceLabel(device) {
    if (device.model) return device.model;
    return multiDeviceText('multiDeviceGenericModule', 'Companion Module');
}

function multiDeviceStatus(device) {
    if (device.id === multiDeviceRuntime.activeId && isConnectedMode) return multiDeviceText('multiDeviceActive', 'Active');
    if (device.connected && device.token) return multiDeviceText('multiDeviceConnected', 'Connected');
    if (multiDeviceNeedsSecureSetup(device)) return multiDeviceText('multiDeviceSecureSetup', 'Secure setup needed');
    if (device.lastSeen) return multiDeviceText('multiDeviceAvailable', 'Available');
    return multiDeviceText('multiDeviceRemembered', 'Remembered');
}

function multiDeviceRender() {
    const list = document.getElementById('multi-device-list');
    const panel = document.getElementById('multi-device-panel');
    const count = document.getElementById('multi-device-count');
    const switchButton = document.getElementById('multi-device-switch');
    const workspaceSwitch = document.getElementById('multi-device-workspace-switch');
    const n = multiDeviceConnectedCount();
    if (count) count.textContent = String(n);
    const workspaceCount = document.getElementById('multi-device-workspace-count');
    if (workspaceCount) workspaceCount.textContent = String(n);
    const labelText = n > 1
        ? multiDeviceText('multiDeviceSwitchCount', 'Devices ({count})').replace('{count}', String(n))
        : multiDeviceText('multiDeviceSwitch', 'Devices');
    if (switchButton) {
        const label = document.getElementById('multi-device-switch-label');
        if (label) label.textContent = labelText;
    }
    if (workspaceSwitch) {
        const label = document.getElementById('multi-device-workspace-switch-label');
        if (label) label.textContent = labelText;
    }
    if (!list || !panel) return;
    const devices = Array.from(multiDeviceRuntime.devices.values())
        .sort((a, b) => {
            const activeA = a.id === multiDeviceRuntime.activeId ? 1 : 0;
            const activeB = b.id === multiDeviceRuntime.activeId ? 1 : 0;
            if (activeA !== activeB) return activeB - activeA;
            const connA = a.connected && a.token ? 1 : 0;
            const connB = b.connected && b.token ? 1 : 0;
            if (connA !== connB) return connB - connA;
            return Math.max(b.lastSeen, b.lastConnected) - Math.max(a.lastSeen, a.lastConnected);
        });
    panel.hidden = false;
    list.innerHTML = '';
    if (!devices.length) {
        const empty = document.createElement('div');
        empty.className = 'multi-device-empty';
        empty.textContent = multiDeviceRuntime.scanning
            ? multiDeviceText('multiDeviceScanning', 'Scanning the local network…')
            : multiDeviceText('multiDeviceNone', 'No Companion Modules found yet.');
        list.appendChild(empty);
        return;
    }
    devices.forEach(device => {
        const row = document.createElement('article');
        row.className = 'multi-device-row';
        row.dataset.deviceId = device.id;
        if (device.id === multiDeviceRuntime.activeId && isConnectedMode) row.dataset.active = 'true';
        const copy = document.createElement('div');
        copy.className = 'multi-device-copy';
        const title = document.createElement('strong');
        title.textContent = multiDeviceLabel(device);
        const meta = document.createElement('span');
        const identity = device.stableIdentity ? device.id.slice(-6).toUpperCase() : multiDeviceText('multiDeviceLegacyIdentity', 'legacy identity');
        meta.textContent = `${device.ip} · ${identity}`;
        copy.append(title, meta);
        const badge = document.createElement('span');
        badge.className = 'multi-device-status';
        badge.textContent = multiDeviceStatus(device);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'multi-device-connect';
        const isActive = device.id === multiDeviceRuntime.activeId && isConnectedMode;
        button.disabled = isActive;
        button.textContent = isActive
            ? multiDeviceText('multiDeviceCurrent', 'Current')
            : (device.connected && device.token ? multiDeviceText('multiDeviceSwitchAction', 'Switch') : multiDeviceText('multiDeviceConnectAction', 'Connect'));
        button.addEventListener('click', () => multiDeviceConnectRecord(device.id));
        row.addEventListener('click', event => {
            if (event.target === button) return;
            multiDeviceRuntime.selectedId = device.id;
            const input = document.getElementById('input-ip');
            if (input) input.value = device.ip;
            document.querySelectorAll('.multi-device-row').forEach(node => node.classList.toggle('is-selected', node === row));
        });
        row.append(copy, badge, button);
        list.appendChild(row);
    });
}

async function multiDeviceConnectRecord(id, options = {}) {
    const device = multiDeviceRuntime.devices.get(id);
    if (!device) return false;
    if (device.id === multiDeviceRuntime.activeId && isConnectedMode) {
        fecharModalRede();
        return true;
    }
    // HTTPS devices go through the certificate check first (and the /trust page if needed),
    // unless the caller just verified the HTTPS connection or a session already exists.
    if (!options.verified && String(device.baseUrl || '').startsWith('https://') && !(device.connected && device.token)) {
        return multiDeviceConnectSecure(device.baseUrl);
    }
    const snapshot = multiDeviceSnapshotGlobals();
    multiDeviceApplyRecord(device);
    const attemptSignal = multiDeviceActiveSignal();
    const input = document.getElementById('input-ip');
    if (input) input.value = device.ip;
    const ok = await tentaConexao();
    if (!ok) {
        // A newer attempt replaced this one: its state is now current, don't roll it back.
        if (attemptSignal.aborted) return false;
        multiDeviceRestoreGlobals(snapshot);
        if (snapshot.isConnectedMode && snapshot.sessionToken) {
            try {
                completeConnectedState({
                    status: 'ok',
                    model: snapshot.model,
                    resolution: snapshot.resolution,
                    has_custom: snapshot.hasCustom,
                    bridge_id: snapshot.activeId && snapshot.activeId.startsWith('bc_') ? snapshot.activeId : ''
                });
            } catch (error) {
                console.error('[BAS] Failed to restore the previous active device after a switch attempt.', error);
            }
        }
        multiDeviceRender();
        return false;
    }
    rememberPhoneIp(device.ip);
    fecharModalRede();
    return true;
}

async function multiDeviceConnectIP(rawAddress) {
    const input = String(rawAddress || '').trim();
    if (input.startsWith('https://')) {
        // Explicit secure transport. Browser certificate validation is mandatory;
        // never retry this address over HTTP when trust fails.
        if (!multiDeviceNormalizeBaseUrl(input)) return false;
        return multiDeviceConnectSecure(input);
    }
    await window.BASApi?.ensureLocalNetworkAccess?.(`http://${input}:4040/info`);
    const probe = await multiDeviceProbeIP(input, 1800);
    if (probe) return multiDeviceConnectRecord(probe.id);
    // No plain-HTTP answer: v1.5+ modules accept other devices only over HTTPS.
    if (isPrivateIPv4(input)) {
        const secure = await multiDeviceProbeSecure(input);
        if (secure) return multiDeviceConnectRecord(secure.id, { verified: true });
        const ask = multiDeviceText('msgSecureTrustPrompt', 'No answer from {ip} over the network. Phones with Companion Module v1.5 or newer only accept secure (HTTPS) connections from other devices. Open the secure connection page now?');
        if (window.confirm(ask.replace('{ip}', input))) return multiDeviceBeginSecureTrust(input);
    }
    const device = multiDeviceUpsert({ baseUrl: `http://${input}:4040`, info: null });
    if (!device) return false;
    // A device saved as HTTPS stays HTTPS (never downgraded). The user just declined the
    // secure page, so don't reopen it from here: report it as unreachable instead.
    if (String(device.baseUrl || '').startsWith('https://')) {
        alert(multiDeviceText('msgNotFound', 'Module not found!'));
        return false;
    }
    return multiDeviceConnectRecord(device.id);
}

async function multiDeviceOpenPicker(options = {}) {
    const modal = document.getElementById('modal-network');
    if (modal) modal.style.display = 'flex';

    if (options.scan === false) {
        multiDeviceRender();
        return;
    }

    const desc = document.getElementById('lbl-modal-net-desc');
    multiDeviceRuntime.scanning = true;
    if (desc) desc.textContent = multiDeviceText('multiDeviceScanning', 'Scanning the local network…');
    multiDeviceRender();

    // Cold browser/network stacks can occasionally miss the first LAN sweep (the
    // exact behavior seen on Quest). Keep the UI in a truthful scanning state and
    // automatically perform one retry before declaring that nothing was found.
    let found = await multiDeviceScan({ keepScanningOnEmpty: true });
    const stillOpen = () => !modal || modal.style.display !== 'none';
    if (!found.length && stillOpen() && options.retryOnEmpty !== false) {
        await new Promise(resolve => setTimeout(resolve, 350));
        if (stillOpen()) found = await multiDeviceScan();
    }

    if (desc && stillOpen()) desc.textContent = found.length
        ? multiDeviceText('multiDeviceFound', '{count} Companion Module(s) found. Choose the device you want to control.').replace('{count}', String(found.length))
        : multiDeviceText('multiDeviceNoneDesc', 'No Companion Module was found automatically. You can still enter an IP address.');
}

function multiDeviceSyncText() {
    const set = (id, key, fallback) => {
        const el = document.getElementById(id);
        if (el) el.textContent = multiDeviceText(key, fallback);
    };
    set('multi-device-title', 'multiDeviceTitle', 'Companion Modules on this network');
    set('multi-device-desc', 'multiDeviceDesc', 'Choose the phone BAS should control. Each device keeps its own session and state.');
    set('multi-device-refresh-label', 'multiDeviceRefresh', 'Scan again');
    multiDeviceRender();
}

function multiDeviceSendUnloadDisconnect(device) {
    if (!device?.token || !device?.baseUrl) return;
    const supportsFeedback = Array.isArray(device.features) && device.features.includes('disconnect_feedback');
    if (supportsFeedback) {
        try {
            const controller = navigator.serviceWorker?.controller;
            if (controller) {
                controller.postMessage({
                    type: 'BAS_PAGE_DISCONNECT',
                    baseUrl: device.baseUrl,
                    token: device.token,
                    reason: 'page_unload'
                });
            }
        } catch (error) {
        }
        const body = new URLSearchParams();
        body.set('token', device.token);
        body.set('reason', 'page_unload');
        try {
            if (navigator.sendBeacon) navigator.sendBeacon(device.baseUrl + '/disconnect/beacon', body);
        } catch (error) {
        }
        try {
            fetch(device.baseUrl + '/disconnect/beacon', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-store',
                keepalive: true,
                body
            }).catch(() => {});
            return;
        } catch (error) {
        }
    }
    const headers = { 'X-Boot-Creator-Token': device.token };
    const path = supportsFeedback ? '/disconnect?reason=page_unload' : '/disconnect';
    localNetworkFetch(device.baseUrl + path, { method: 'POST', headers, keepalive: true }).catch(() => {});
}

function multiDeviceOnBeforeUnload() {
    if (multiDeviceRuntime.unloadSent) return;
    multiDeviceRuntime.unloadSent = true;
    const seen = new Set();
    multiDeviceCaptureGlobals();
    multiDeviceRuntime.devices.forEach(device => {
        if (!device.token || !device.baseUrl || seen.has(device.id)) return;
        seen.add(device.id);
        multiDeviceSendUnloadDisconnect(device);
    });
}

function multiDeviceBind() {
    if (multiDeviceRuntime.bound) return;
    multiDeviceRuntime.bound = true;
    multiDeviceLoad();
    document.getElementById('multi-device-switch')?.addEventListener('click', () => multiDeviceOpenPicker({ scan: true }));
    document.getElementById('multi-device-workspace-switch')?.addEventListener('click', () => multiDeviceOpenPicker({ scan: true }));
    document.getElementById('multi-device-refresh')?.addEventListener('click', () => multiDeviceOpenPicker({ scan: true }));
    document.getElementById('btn-connect-secure')?.addEventListener('click', () => {
        multiDeviceConnectSecure(document.getElementById('input-ip')?.value || '');
    });
    window.addEventListener('message', multiDeviceOnTrustMessage);
    window.addEventListener('focus', multiDeviceOnTrustReturn);
    document.addEventListener('visibilitychange', multiDeviceOnTrustReturn);
    window.addEventListener('bas:languagechange', multiDeviceSyncText);
    multiDeviceSyncText();
}

window.BASMultiDevice = Object.freeze({
    version: BAS_MULTI_DEVICE_VERSION,
    scan: multiDeviceScan,
    openPicker: multiDeviceOpenPicker,
    connectIP: multiDeviceConnectIP,
    connectSecure: multiDeviceConnectSecure,
    connectRecord: multiDeviceConnectRecord,
    prepareBase: multiDevicePrepareBase,
    captureCompatibility: multiDeviceCaptureCompatibility,
    captureConnected: multiDeviceCaptureConnected,
    captureDisconnected: multiDeviceCaptureDisconnected,
    captureCurrent: multiDeviceCaptureGlobals,
    current: multiDeviceCurrent,
    connectedCount: multiDeviceConnectedCount,
    activeSignal: multiDeviceActiveSignal,
    render: multiDeviceRender,
    syncText: multiDeviceSyncText,
    disconnectAllOnUnload: multiDeviceOnBeforeUnload,
    devices: () => Array.from(multiDeviceRuntime.devices.values()).map(device => ({ ...device, token: device.token ? '[session]' : '' }))
});
window.syncMultiDeviceText = multiDeviceSyncText;
window.addEventListener('DOMContentLoaded', multiDeviceBind);
