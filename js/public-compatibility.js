(function() {
    'use strict';

    const PUBLIC_MODULE_V13 = Object.freeze({
        moduleVersion: 'v1.3',
        moduleVersionCode: 4,
        apiVersion: 1,
        companionVersionCode: 6,
        features: Object.freeze([
            'session_auth',
            'direct_upload',
            'pull',
            'history',
            'history_webm',
            'remove',
            'reset',
            'test_animation',
            'device_resolution',
            'update_preservation',
            'qr_pairing'
        ])
    });

    const MODERN_ONLY_FEATURES = Object.freeze([
        'trusted_clients', 'trust_permissions', 'trust_session_management', 'security_audit',
        'playlists', 'playlist_test', 'boot_rotation', 'boot_queue', 'boot_activity',
        'device_intelligence', 'rescan_paths', 'path_environment_status',
        'module_health', 'module_health_maintenance', 'test_staging',
        'multi_device_identity', 'live_events', 'state_revisions',
        'client_presence', 'operation_coordination'
    ]);

    function sorted(values) {
        return Array.from(values || []).map(String).sort();
    }

    function sameSet(a, b) {
        const left = sorted(a);
        const right = sorted(b);
        return left.length === right.length && left.every((value, index) => value === right[index]);
    }

    function withPublicV13Runtime(callback) {
        const previousFeatures = moduleFeatures;
        const previousConnected = isConnectedMode;
        const previousApi = moduleApiVersion;
        const previousInfo = moduleInfo;
        const previousMode = moduleCompatibilityMode;
        try {
            moduleFeatures = new Set(PUBLIC_MODULE_V13.features);
            isConnectedMode = true;
            moduleApiVersion = PUBLIC_MODULE_V13.apiVersion;
            moduleInfo = {
                api_version: PUBLIC_MODULE_V13.apiVersion,
                module_version: PUBLIC_MODULE_V13.moduleVersion,
                module_version_code: PUBLIC_MODULE_V13.moduleVersionCode,
                companion_version_code: PUBLIC_MODULE_V13.companionVersionCode,
                features: [...PUBLIC_MODULE_V13.features]
            };
            moduleCompatibilityMode = 'versioned';
            return callback();
        } finally {
            moduleFeatures = previousFeatures;
            isConnectedMode = previousConnected;
            moduleApiVersion = previousApi;
            moduleInfo = previousInfo;
            moduleCompatibilityMode = previousMode;
        }
    }

    function auditPublicV13FeatureGating() {
        return withPublicV13Runtime(() => {
            const problems = [];
            const expectOff = (label, value) => { if (value) problems.push(`${label} enabled on public v1.3`); };
            const expectOn = (label, value) => { if (!value) problems.push(`${label} unavailable on public v1.3`); };

            expectOn('direct upload', hasModuleFeature('direct_upload'));
            expectOn('pull', hasModuleFeature('pull'));
            expectOn('history', hasModuleFeature('history'));
            expectOn('remove', hasModuleFeature('remove'));
            expectOn('test animation', hasModuleFeature('test_animation'));
            expectOn('device resolution', hasModuleFeature('device_resolution'));

            // The published module's `reset` endpoint is a destructive troubleshooting reset,
            // NOT the newer boot-path rescan contract. Never alias the two capabilities.
            expectOn('legacy troubleshooting reset capability', hasModuleFeature('reset'));
            expectOff('modern path rescan capability', hasModuleFeature('rescan_paths'));

            expectOff('Trust Center', Boolean(window.BASTrustCenter?.supported?.()));
            expectOff('Live Sync', Boolean(window.BASLiveSync?.supported?.()));
            expectOff('Presence', Boolean(window.BASPresence?.supported?.()));
            expectOff('operation coordination', Boolean(window.BASPresence?.operationSupported?.()));
            expectOff('Module Health', Boolean(window.BASHealthCenter?.supported?.()));
            expectOff('Playlist', Boolean(window.BASPlaylist?.supported?.()));
            expectOff('Rotation', Boolean(window.BASRotation?.supported?.()));
            expectOff('Boot Queue', Boolean(window.BASBootQueue?.supported?.()));
            expectOff('Device Intelligence', Boolean(window.BASDeviceIntelligence?.supported?.()));
            expectOff('path resilience', Boolean(window.BASPathResilience?.supported?.()));
            expectOff('modern Device Test staging', Boolean(window.BASModuleTest?.supported?.()));

            for (const feature of MODERN_ONLY_FEATURES) {
                if (hasModuleFeature(feature)) problems.push(`modern-only capability leaked into v1.3 fixture: ${feature}`);
            }

            return {
                ok: problems.length === 0,
                problems,
                detail: problems.length ? problems.join('; ') : 'Public v1.3 legacy surfaces enabled; modern-only surfaces capability-gated off'
            };
        });
    }

    function publicSurfaceCodenameLeaks(root = document) {
        const text = String(root?.body?.textContent || '');
        const phaseMatches = text.match(/\bP(?:1[0-9]|[0-9])(?:\.\d+)+(?:\s+R[0-9A-Za-z.]+)?\b/g) || [];
        const revisionMatches = text.match(/\bR\d+(?:\.\d+)*(?:[A-Za-z]+)?\b/g) || [];
        const developmentMatches = /Development build/i.test(text) ? ['Development build'] : [];
        return Array.from(new Set([...phaseMatches, ...revisionMatches, ...developmentMatches])).slice(0, 20);
    }

    window.BASPublicCompatibility = Object.freeze({
        publicModuleV13: PUBLIC_MODULE_V13,
        modernOnlyFeatures: MODERN_ONLY_FEATURES,
        sameSet,
        auditPublicV13FeatureGating,
        publicSurfaceCodenameLeaks
    });
})();
