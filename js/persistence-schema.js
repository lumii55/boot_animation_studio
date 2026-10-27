(() => {
    'use strict';

    const BAS_PERSISTENCE_SCHEMA_FRAMEWORK_VERSION = 1;
    const persistenceSchemaRegistry = new Map();

    class BASPersistenceSchemaError extends Error {
        constructor(code, schemaId, message, details = {}) {
            super(message || code);
            this.name = 'BASPersistenceSchemaError';
            this.code = String(code || 'schema_error');
            this.schemaId = String(schemaId || '');
            this.details = details && typeof details === 'object' ? details : {};
        }
    }

    function persistenceSchemaClone(value) {
        if (typeof structuredClone === 'function') {
            try { return structuredClone(value); } catch (error) {}
        }
        return JSON.parse(JSON.stringify(value));
    }

    function persistenceSchemaInteger(value) {
        const numeric = Number(value);
        return Number.isInteger(numeric) ? numeric : null;
    }

    function persistenceSchemaResolve(schemaOrId) {
        if (schemaOrId && typeof schemaOrId === 'object' && schemaOrId.id) return schemaOrId;
        const id = String(schemaOrId || '');
        const schema = persistenceSchemaRegistry.get(id);
        if (!schema) throw new BASPersistenceSchemaError('unknown_schema', id, `Unknown persistence schema: ${id}`);
        return schema;
    }

    function persistenceSchemaDefine(config) {
        if (!config || typeof config !== 'object') throw new TypeError('Persistence schema config is required.');
        const id = String(config.id || '').trim();
        if (!id) throw new TypeError('Persistence schema id is required.');
        if (persistenceSchemaRegistry.has(id)) throw new TypeError(`Persistence schema already registered: ${id}`);
        const currentVersion = persistenceSchemaInteger(config.currentVersion);
        const minimumVersion = persistenceSchemaInteger(config.minimumVersion ?? 1);
        if (currentVersion === null || currentVersion < 1) throw new TypeError(`Invalid currentVersion for ${id}`);
        if (minimumVersion === null || minimumVersion < 0 || minimumVersion > currentVersion) throw new TypeError(`Invalid minimumVersion for ${id}`);
        const schema = Object.freeze({
            id,
            currentVersion,
            minimumVersion,
            versionField: String(config.versionField || 'version'),
            formatField: config.formatField ? String(config.formatField) : '',
            formatValue: config.formatValue === undefined ? undefined : String(config.formatValue),
            migrations: Object.freeze({ ...(config.migrations || {}) }),
            policy: String(config.policy || 'canonical-migrate'),
            owner: String(config.owner || ''),
            storage: String(config.storage || ''),
            notes: String(config.notes || '')
        });
        persistenceSchemaRegistry.set(id, schema);
        return schema;
    }

    function persistenceSchemaInspect(schemaOrId, value) {
        const schema = persistenceSchemaResolve(schemaOrId);
        if (!value || typeof value !== 'object' || Array.isArray(value)) return Object.freeze({ schema, disposition: 'invalid', version: null, code: 'invalid_shape' });
        if (schema.formatField && String(value[schema.formatField] || '') !== schema.formatValue) return Object.freeze({ schema, disposition: 'invalid', version: null, code: 'invalid_format' });
        const version = persistenceSchemaInteger(value[schema.versionField]);
        if (version === null) return Object.freeze({ schema, disposition: 'invalid', version: null, code: 'invalid_version' });
        if (version < schema.minimumVersion) return Object.freeze({ schema, disposition: 'unsupported', version, code: 'unsupported_version' });
        if (version > schema.currentVersion) return Object.freeze({ schema, disposition: 'future', version, code: 'future_version' });
        if (version === schema.currentVersion) return Object.freeze({ schema, disposition: 'current', version, code: 'current' });
        return Object.freeze({ schema, disposition: 'migration', version, code: 'migration_required' });
    }

    function persistenceSchemaMigrate(schemaOrId, value) {
        const schema = persistenceSchemaResolve(schemaOrId);
        const inspection = persistenceSchemaInspect(schema, value);
        if (inspection.disposition === 'invalid') throw new BASPersistenceSchemaError(inspection.code, schema.id, `${schema.id}: invalid persisted state`, { version: inspection.version });
        if (inspection.disposition === 'unsupported') throw new BASPersistenceSchemaError('unsupported_version', schema.id, `${schema.id}: unsupported persisted-state version`, { version: inspection.version });
        if (inspection.disposition === 'future') throw new BASPersistenceSchemaError('future_version', schema.id, `${schema.id}: persisted state is newer than this build`, { version: inspection.version, currentVersion: schema.currentVersion });
        let migrated = persistenceSchemaClone(value);
        let version = inspection.version;
        while (version < schema.currentVersion) {
            const migration = schema.migrations[version];
            if (typeof migration !== 'function') throw new BASPersistenceSchemaError('missing_migration', schema.id, `${schema.id}: missing migration from version ${version}`, { version });
            let next;
            try { next = migration(persistenceSchemaClone(migrated)); }
            catch (error) { throw new BASPersistenceSchemaError('migration_failed', schema.id, `${schema.id}: migration from version ${version} failed`, { version, cause: String(error?.message || error) }); }
            if (!next || typeof next !== 'object' || Array.isArray(next)) throw new BASPersistenceSchemaError('invalid_migration_result', schema.id, `${schema.id}: migration returned invalid state`, { version });
            const nextVersion = persistenceSchemaInteger(next[schema.versionField]);
            if (nextVersion !== version + 1) throw new BASPersistenceSchemaError('migration_not_sequential', schema.id, `${schema.id}: migration must advance exactly one version`, { version, nextVersion });
            if (schema.formatField && String(next[schema.formatField] || '') !== schema.formatValue) throw new BASPersistenceSchemaError('invalid_migration_result', schema.id, `${schema.id}: migration changed/removed required format`, { version, nextVersion });
            migrated = next;
            version = nextVersion;
        }
        return migrated;
    }

    function persistenceSchemaSnapshot() {
        return Array.from(persistenceSchemaRegistry.values()).map(schema => ({
            id: schema.id,
            currentVersion: schema.currentVersion,
            minimumVersion: schema.minimumVersion,
            versionField: schema.versionField,
            formatField: schema.formatField || null,
            formatValue: schema.formatValue ?? null,
            policy: schema.policy,
            owner: schema.owner,
            storage: schema.storage,
            migrationStarts: Object.keys(schema.migrations).map(Number).sort((a, b) => a - b)
        }));
    }

    globalThis.BASPersistenceSchema = Object.freeze({
        version: BAS_PERSISTENCE_SCHEMA_FRAMEWORK_VERSION,
        Error: BASPersistenceSchemaError,
        define: persistenceSchemaDefine,
        inspect: persistenceSchemaInspect,
        migrate: persistenceSchemaMigrate,
        get(id) { return persistenceSchemaRegistry.get(String(id || '')) || null; },
        snapshot: persistenceSchemaSnapshot
    });
})();
