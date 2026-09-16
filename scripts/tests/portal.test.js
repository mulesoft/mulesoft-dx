/**
 * Unit tests for pure/near-pure functions in portal.js.
 *
 * portal.js is a browser script (no module exports), so we load it via
 * vm.runInThisContext into the jsdom global scope that Jest provides.
 *
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

// Load jsonpath-plus. The UMD bundle detects CommonJS `exports` and writes
// there instead of globalThis, so we capture and re-export as a global.
const _jpExports = {};
const _jpModule = { exports: _jpExports };
(new Function('exports', 'module', fs.readFileSync(
    path.resolve(__dirname, '../portal_generator/assets/jsonpath-plus.min.js'),
    'utf-8',
)))(_jpExports, _jpModule);
globalThis.JSONPath = _jpExports.JSONPath ? _jpExports : _jpModule.exports;

// Load portal.js into the module scope so all functions are available.
// eval in module scope makes function declarations accessible as local vars.
const portalJs = fs.readFileSync(
    path.resolve(__dirname, '../portal_generator/assets/portal.js'),
    'utf-8',
);

// Stub DOMContentLoaded to prevent side-effects during load.
const _origAddEventListener = document.addEventListener;
document.addEventListener = function (event, fn) {
    if (event === 'DOMContentLoaded') return;
    return _origAddEventListener.call(this, event, fn);
};
eval(portalJs);
document.addEventListener = _origAddEventListener;

// ---------------------------------------------------------------------------
// Helper: set up DOM elements so getSelectedRegion() returns the desired value.
// ---------------------------------------------------------------------------
function makeSelect(id, value) {
    const sel = document.createElement('select');
    sel.id = id;
    const opt = document.createElement('option');
    opt.value = value;
    sel.appendChild(opt);
    sel.value = value;
    document.body.appendChild(sel);
    return sel;
}

function cleanupServerElements() {
    ['serverSelect', 'regionPreset', 'regionCustomInput'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
}

function withServerType(type, region, fn) {
    cleanupServerElements();
    makeSelect('serverSelect', type);
    if ((type === 'platform' || type === 'eu') && region) {
        makeSelect('regionPreset', region);
    }
    try {
        fn();
    } finally {
        cleanupServerElements();
    }
}

function withRegion(region, fn) {
    if (region) {
        withServerType('platform', region, fn);
    } else {
        cleanupServerElements();
        try {
            fn();
        } finally {
            cleanupServerElements();
        }
    }
}

function withSessionStorage(storedType, storedRegion, fn) {
    var prevType = sessionStorage.getItem('anypoint_server_type');
    var prevRegion = sessionStorage.getItem('anypoint_region');
    if (storedType === null) sessionStorage.removeItem('anypoint_server_type');
    else sessionStorage.setItem('anypoint_server_type', storedType);
    if (storedRegion === null) sessionStorage.removeItem('anypoint_region');
    else sessionStorage.setItem('anypoint_region', storedRegion);
    try {
        fn();
    } finally {
        if (prevType === null) sessionStorage.removeItem('anypoint_server_type');
        else sessionStorage.setItem('anypoint_server_type', prevType);
        if (prevRegion === null) sessionStorage.removeItem('anypoint_region');
        else sessionStorage.setItem('anypoint_region', prevRegion);
    }
}

// ===========================================================================
// getSelectedServerType
// ===========================================================================
describe('getSelectedServerType', () => {
    test('returns us when no select element exists', () => {
        expect(getSelectedServerType()).toBe('us');
    });

    test('returns us when select is set to us', () => {
        withServerType('us', null, () => {
            expect(getSelectedServerType()).toBe('us');
        });
    });

    test('returns eu when select is set to eu', () => {
        withServerType('eu', null, () => {
            expect(getSelectedServerType()).toBe('eu');
        });
    });

    test('returns platform when select is set to platform', () => {
        withServerType('platform', 'ca1', () => {
            expect(getSelectedServerType()).toBe('platform');
        });
    });

    // --- W-22945464: sessionStorage fallback when DOM is at default ---
    test('returns sessionStorage value when DOM is at default us and storage has eu (bug repro)', () => {
        withServerType('us', null, () => {
            withSessionStorage('eu', 'eu1', () => {
                expect(getSelectedServerType()).toBe('eu');
            });
        });
    });

    test('returns sessionStorage value when DOM element is missing and storage has platform', () => {
        cleanupServerElements();
        withSessionStorage('platform', 'ca1', () => {
            expect(getSelectedServerType()).toBe('platform');
        });
    });

    test('prefers DOM value when DOM is non-default, even if storage says otherwise', () => {
        withServerType('platform', 'ca1', () => {
            withSessionStorage('eu', 'eu1', () => {
                expect(getSelectedServerType()).toBe('platform');
            });
        });
    });

    test('returns us when both DOM and sessionStorage are empty', () => {
        cleanupServerElements();
        withSessionStorage(null, null, () => {
            expect(getSelectedServerType()).toBe('us');
        });
    });
});

// ===========================================================================
// getSelectedRegion
// ===========================================================================
describe('getSelectedRegion', () => {
    test('returns null when server type is us', () => {
        withServerType('us', null, () => {
            expect(getSelectedRegion()).toBeNull();
        });
    });

    test('returns null when server type is us even with sessionStorage region', () => {
        withServerType('us', null, () => {
            withSessionStorage('us', 'eu1', () => {
                expect(getSelectedRegion()).toBeNull();
            });
        });
    });

    test('returns region from DOM when regionPreset is set', () => {
        withServerType('eu', 'eu2', () => {
            expect(getSelectedRegion()).toBe('eu2');
        });
    });

    test('returns region from DOM when platform regionPreset is set', () => {
        withServerType('platform', 'ca1', () => {
            expect(getSelectedRegion()).toBe('ca1');
        });
    });

    // --- W-22945464: sessionStorage fallback when DOM regionPreset is missing ---
    test('returns sessionStorage region when DOM has eu but no regionPreset (bug repro)', () => {
        cleanupServerElements();
        makeSelect('serverSelect', 'eu');
        withSessionStorage('eu', 'eu1', () => {
            expect(getSelectedRegion()).toBe('eu1');
        });
        cleanupServerElements();
    });

    test('returns sessionStorage region when DOM has platform but no regionPreset for ca1', () => {
        cleanupServerElements();
        makeSelect('serverSelect', 'platform');
        withSessionStorage('platform', 'ca1', () => {
            expect(getSelectedRegion()).toBe('ca1');
        });
        cleanupServerElements();
    });

    test('returns sessionStorage region when DOM has platform but no regionPreset for jp1', () => {
        cleanupServerElements();
        makeSelect('serverSelect', 'platform');
        withSessionStorage('platform', 'jp1', () => {
            expect(getSelectedRegion()).toBe('jp1');
        });
        cleanupServerElements();
    });

    test('prefers DOM region over sessionStorage when both are set', () => {
        withServerType('eu', 'eu2', () => {
            withSessionStorage('eu', 'eu1', () => {
                expect(getSelectedRegion()).toBe('eu2');
            });
        });
    });

    test('returns null when neither DOM nor sessionStorage has a region', () => {
        cleanupServerElements();
        makeSelect('serverSelect', 'eu');
        withSessionStorage(null, null, () => {
            expect(getSelectedRegion()).toBeNull();
        });
        cleanupServerElements();
    });

    test('returns custom region from DOM when regionPreset is custom', () => {
        cleanupServerElements();
        makeSelect('serverSelect', 'platform');
        const regionPreset = makeSelect('regionPreset', 'custom');
        const customInput = document.createElement('input');
        customInput.id = 'regionCustomInput';
        customInput.value = 'custom-region-1';
        document.body.appendChild(customInput);
        expect(getSelectedRegion()).toBe('custom-region-1');
        customInput.remove();
        cleanupServerElements();
    });

    test('returns null when regionPreset is custom but customInput is empty', () => {
        cleanupServerElements();
        makeSelect('serverSelect', 'platform');
        const regionPreset = makeSelect('regionPreset', 'custom');
        const customInput = document.createElement('input');
        customInput.id = 'regionCustomInput';
        customInput.value = '';
        document.body.appendChild(customInput);
        expect(getSelectedRegion()).toBeNull();
        customInput.remove();
        cleanupServerElements();
    });

    test('returns null when serverSelect is missing', () => {
        cleanupServerElements();
        expect(getSelectedRegion()).toBeNull();
    });
});

// ===========================================================================
// getSelectedBaseUrl
// ===========================================================================
describe('getSelectedBaseUrl', () => {
    test('returns US base URL by default', () => {
        expect(getSelectedBaseUrl()).toBe('https://anypoint.mulesoft.com');
    });

    test('returns EU base URL with eu1 default when EU selected', () => {
        withServerType('eu', null, () => {
            expect(getSelectedBaseUrl()).toBe('https://eu1.anypoint.mulesoft.com');
        });
    });

    test('returns EU base URL with custom region when EU selected with region', () => {
        withServerType('eu', 'eu2', () => {
            expect(getSelectedBaseUrl()).toBe('https://eu2.anypoint.mulesoft.com');
        });
    });

    test('returns platform base URL with region when platform selected', () => {
        withServerType('platform', 'ca1', () => {
            expect(getSelectedBaseUrl()).toBe('https://ca1.platform.mulesoft.com');
        });
    });

    test('returns platform base URL with ca1 default when no region preset', () => {
        withServerType('platform', null, () => {
            expect(getSelectedBaseUrl()).toBe('https://ca1.platform.mulesoft.com');
        });
    });
});

// ===========================================================================
// getNonRegionVars
// ===========================================================================
describe('getNonRegionVars', () => {
    test('returns empty object for null server', () => {
        expect(getNonRegionVars(null)).toEqual({});
    });

    test('returns empty object when server has no variables', () => {
        expect(getNonRegionVars({ url: 'https://x.com' })).toEqual({});
    });

    test('filters out region and REGION_ID', () => {
        const server = {
            variables: {
                region: { default: 'us-east-1' },
                REGION_ID: { default: 'eu1' },
                version: { default: 'v1' },
            },
        };
        expect(getNonRegionVars(server)).toEqual({
            version: { default: 'v1' },
        });
    });

    test('returns all variables when none are region-related', () => {
        const server = {
            variables: {
                version: { default: 'v2' },
                env: { default: 'prod' },
            },
        };
        expect(getNonRegionVars(server)).toEqual({
            version: { default: 'v2' },
            env: { default: 'prod' },
        });
    });
});

// ===========================================================================
// pickServerTemplate
// ===========================================================================
describe('pickServerTemplate', () => {
    const usServer = { url: 'https://anypoint.mulesoft.com/api/v1' };
    const euServer = {
        url: 'https://{region}.anypoint.mulesoft.com/api/v1',
        variables: { region: { default: 'eu1' } },
    };
    const euServerLegacy = { url: 'https://eu1.anypoint.mulesoft.com/api/v1' };
    const platformServer = {
        url: 'https://{region}.platform.mulesoft.com/api/v1',
        variables: { region: { default: 'ca1' } },
    };

    test('returns null for empty/null array', () => {
        expect(pickServerTemplate(null)).toBeNull();
        expect(pickServerTemplate([])).toBeNull();
    });

    test('returns first server (US) when no region selected', () => {
        withServerType('us', null, () => {
            expect(pickServerTemplate([usServer, euServer, platformServer])).toBe(usServer);
        });
    });

    test('returns parameterized EU server when EU is selected', () => {
        withServerType('eu', null, () => {
            expect(pickServerTemplate([usServer, euServer, platformServer])).toBe(euServer);
        });
    });

    test('falls back to legacy EU server when no parameterized EU exists', () => {
        withServerType('eu', null, () => {
            expect(pickServerTemplate([usServer, euServerLegacy, platformServer])).toBe(euServerLegacy);
        });
    });

    test('returns platform server when platform is selected', () => {
        withServerType('platform', 'ca1', () => {
            expect(pickServerTemplate([usServer, euServer, platformServer])).toBe(platformServer);
        });
    });

    test('falls back to first server when EU selected but no EU server exists', () => {
        withServerType('eu', null, () => {
            expect(pickServerTemplate([usServer, platformServer])).toBe(usServer);
        });
    });

    test('falls back to first server when platform selected but no platform server exists', () => {
        withServerType('platform', 'ca1', () => {
            expect(pickServerTemplate([usServer, euServer])).toBe(usServer);
        });
    });
});

// ===========================================================================
// resolveServerUrl
// ===========================================================================
describe('resolveServerUrl', () => {
    test('returns default URL for null server', () => {
        expect(resolveServerUrl(null, null)).toBe('https://anypoint.mulesoft.com');
    });

    test('returns URL as-is when no variables', () => {
        const server = { url: 'https://anypoint.mulesoft.com/api/v1' };
        expect(resolveServerUrl(server, null)).toBe('https://anypoint.mulesoft.com/api/v1');
    });

    test('substitutes region variable when platform region selected', () => {
        const server = {
            url: 'https://{region}.platform.mulesoft.com/api/v1',
            variables: { region: { default: 'ca1' } },
        };
        withRegion('sg1', () => {
            expect(resolveServerUrl(server, null)).toBe(
                'https://sg1.platform.mulesoft.com/api/v1',
            );
        });
    });

    test('substitutes region variable when EU region selected', () => {
        const server = {
            url: 'https://{region}.anypoint.mulesoft.com/api/v1',
            variables: { region: { default: 'eu1' } },
        };
        withServerType('eu', 'eu2', () => {
            expect(resolveServerUrl(server, null)).toBe(
                'https://eu2.anypoint.mulesoft.com/api/v1',
            );
        });
    });

    test('uses variable default when region is not selected', () => {
        const server = {
            url: 'https://{region}.platform.mulesoft.com/api/v1',
            variables: { region: { default: 'ca1' } },
        };
        withRegion(null, () => {
            expect(resolveServerUrl(server, null)).toBe(
                'https://ca1.platform.mulesoft.com/api/v1',
            );
        });
    });

    test('substitutes non-region variable using default (no opId)', () => {
        const server = {
            url: 'https://api.com/{version}/resources',
            variables: { version: { default: 'v2' } },
        };
        withRegion(null, () => {
            expect(resolveServerUrl(server, null)).toBe(
                'https://api.com/v2/resources',
            );
        });
    });

    test('substitutes multiple variables', () => {
        const server = {
            url: 'https://{region}.platform.mulesoft.com/{version}',
            variables: {
                region: { default: 'ca1' },
                version: { default: 'v1' },
            },
        };
        withRegion('sg1', () => {
            expect(resolveServerUrl(server, null)).toBe(
                'https://sg1.platform.mulesoft.com/v1',
            );
        });
    });

    test('skips variable when placeholder not in URL', () => {
        const server = {
            url: 'https://api.com/v1',
            variables: { region: { default: 'us' } },
        };
        withRegion('eu', () => {
            expect(resolveServerUrl(server, null)).toBe('https://api.com/v1');
        });
    });
});

// ===========================================================================
// Region × domain matrix (W-22861359)
// ===========================================================================
describe('isServerValidForRegion', () => {
    const anypointGlobal = { url: 'https://anypoint.mulesoft.com/api' };
    const anypointRegional = {
        url: 'https://{region}.anypoint.mulesoft.com/api',
        variables: { region: { default: 'eu1' } },
    };
    const platformRegional = {
        url: 'https://{region}.platform.mulesoft.com/api',
        variables: { region: { default: 'ca1' } },
    };
    const anypointLegacyEu = { url: 'https://eu1.anypoint.mulesoft.com/api' };

    test('us global: only anypoint global is valid (region=null)', () => {
        expect(isServerValidForRegion(anypointGlobal, null)).toBe(true);
        expect(isServerValidForRegion(anypointRegional, null)).toBe(true);
        expect(isServerValidForRegion(platformRegional, null)).toBe(true);
    });

    test('eu1: only anypoint regional, NOT platform', () => {
        expect(isServerValidForRegion(anypointGlobal, 'eu1')).toBe(false);
        expect(isServerValidForRegion(anypointRegional, 'eu1')).toBe(true);
        expect(isServerValidForRegion(platformRegional, 'eu1')).toBe(false);
    });

    test('ca1: only platform, NOT anypoint regional', () => {
        expect(isServerValidForRegion(anypointGlobal, 'ca1')).toBe(false);
        expect(isServerValidForRegion(anypointRegional, 'ca1')).toBe(false);
        expect(isServerValidForRegion(platformRegional, 'ca1')).toBe(true);
    });

    test('jp1: only platform, NOT anypoint regional', () => {
        expect(isServerValidForRegion(anypointGlobal, 'jp1')).toBe(false);
        expect(isServerValidForRegion(anypointRegional, 'jp1')).toBe(false);
        expect(isServerValidForRegion(platformRegional, 'jp1')).toBe(true);
    });

    test('in1: only platform, NOT anypoint regional', () => {
        expect(isServerValidForRegion(anypointGlobal, 'in1')).toBe(false);
        expect(isServerValidForRegion(anypointRegional, 'in1')).toBe(false);
        expect(isServerValidForRegion(platformRegional, 'in1')).toBe(true);
    });

    test('au1: only platform, NOT anypoint regional', () => {
        expect(isServerValidForRegion(anypointGlobal, 'au1')).toBe(false);
        expect(isServerValidForRegion(anypointRegional, 'au1')).toBe(false);
        expect(isServerValidForRegion(platformRegional, 'au1')).toBe(true);
    });

    test('legacy hardcoded eu1 server is valid for eu1', () => {
        expect(isServerValidForRegion(anypointLegacyEu, 'eu1')).toBe(true);
        expect(isServerValidForRegion(anypointLegacyEu, 'ca1')).toBe(false);
    });

    test('unknown region does not filter (returns true to avoid hiding valid endpoints)', () => {
        expect(isServerValidForRegion(anypointGlobal, 'sg1')).toBe(true);
        expect(isServerValidForRegion(anypointRegional, 'sg1')).toBe(true);
        expect(isServerValidForRegion(platformRegional, 'sg1')).toBe(true);
    });

    test('null/undefined server returns false', () => {
        expect(isServerValidForRegion(null, 'eu1')).toBe(false);
        expect(isServerValidForRegion(undefined, 'eu1')).toBe(false);
    });
});

describe('filterServersForRegion', () => {
    const anypointGlobal = { url: 'https://anypoint.mulesoft.com/api' };
    const anypointRegional = {
        url: 'https://{region}.anypoint.mulesoft.com/api',
        variables: { region: { default: 'eu1' } },
    };
    const platformRegional = {
        url: 'https://{region}.platform.mulesoft.com/api',
        variables: { region: { default: 'ca1' } },
    };
    const all = [anypointGlobal, anypointRegional, platformRegional];

    test('eu1 keeps only anypoint regional', () => {
        expect(filterServersForRegion(all, 'eu1')).toEqual([anypointRegional]);
    });

    test('ca1 keeps only platform regional', () => {
        expect(filterServersForRegion(all, 'ca1')).toEqual([platformRegional]);
    });

    test('jp1 keeps only platform regional', () => {
        expect(filterServersForRegion(all, 'jp1')).toEqual([platformRegional]);
    });

    test('in1 keeps only platform regional', () => {
        expect(filterServersForRegion(all, 'in1')).toEqual([platformRegional]);
    });

    test('au1 keeps only platform regional', () => {
        expect(filterServersForRegion(all, 'au1')).toEqual([platformRegional]);
    });

    test('null region (us) returns all', () => {
        expect(filterServersForRegion(all, null)).toEqual(all);
    });

    test('unknown region returns all (no filter)', () => {
        expect(filterServersForRegion(all, 'sg1')).toEqual(all);
    });

    test('empty/null input returns []', () => {
        expect(filterServersForRegion(null, 'eu1')).toEqual([]);
        expect(filterServersForRegion([], 'eu1')).toEqual([]);
    });
});

// ===========================================================================
// buildUrlBarHtml
// ===========================================================================
describe('buildUrlBarHtml', () => {
    test('renders method, server, and path', () => {
        const html = buildUrlBarHtml('GET', 'https://api.com', '/resources');
        expect(html).toContain('method-get');
        expect(html).toContain('GET');
        expect(html).toContain('https://api.com');
        expect(html).toContain('/resources');
    });

    test('includes link when provided', () => {
        const html = buildUrlBarHtml('POST', 'https://api.com', '/items', 'detail.html#op-create');
        expect(html).toContain('<a href="detail.html#op-create"');
        expect(html).toContain('</a>');
    });

    test('omits link when not provided', () => {
        const html = buildUrlBarHtml('DELETE', 'https://api.com', '/items/1');
        expect(html).not.toContain('<a ');
    });

    test('escapes HTML in parameters', () => {
        const html = buildUrlBarHtml('GET', 'https://api.com', '/search?q=<script>');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });
});

// ===========================================================================
// extractXOriginValues
// ===========================================================================
describe('extractXOriginValues', () => {
    // --- No fieldPath: returns responseBody wrapped as array ---

    test('returns array responseBody as-is when no fieldPath', () => {
        const data = ['a', 'b', 'c'];
        expect(extractXOriginValues(data, null)).toEqual(['a', 'b', 'c']);
    });

    test('wraps non-array responseBody when no fieldPath', () => {
        expect(extractXOriginValues('single', null)).toEqual(['single']);
        expect(extractXOriginValues(42, null)).toEqual([42]);
    });

    test('wraps object responseBody when no fieldPath', () => {
        const obj = { id: 1 };
        expect(extractXOriginValues(obj, null)).toEqual([{ id: 1 }]);
    });

    test('returns array with falsy value when responseBody is falsy and no fieldPath', () => {
        // !responseBody is true → if Array.isArray check fails → [responseBody]
        expect(extractXOriginValues(null, null)).toEqual([null]);
        expect(extractXOriginValues(undefined, null)).toEqual([undefined]);
        expect(extractXOriginValues('', '')).toEqual(['']);
    });

    // --- With fieldPath: delegates to extractByPath via JSONPath ---

    test('extracts array from nested path', () => {
        const data = { data: { items: ['x', 'y', 'z'] } };
        expect(extractXOriginValues(data, '$.data.items[*]')).toEqual(['x', 'y', 'z']);
    });

    test('extracts single value and wraps in array', () => {
        const data = { name: 'test-env' };
        expect(extractXOriginValues(data, '$.name')).toEqual(['test-env']);
    });

    test('returns empty array when path does not match', () => {
        const data = { name: 'test' };
        expect(extractXOriginValues(data, '$.nonexistent')).toEqual([]);
    });

    test('extracts values from array of objects', () => {
        const data = {
            environments: [
                { id: 'env-1', name: 'Production' },
                { id: 'env-2', name: 'Sandbox' },
            ],
        };
        expect(extractXOriginValues(data, '$.environments[*].id')).toEqual(['env-1', 'env-2']);
    });

    test('handles path without $ prefix', () => {
        const data = { items: [1, 2, 3] };
        // extractByPath prepends $. if path doesn't start with $
        expect(extractXOriginValues(data, 'items[*]')).toEqual([1, 2, 3]);
    });

    test('extracts nested field from single object', () => {
        const data = { org: { id: 'abc-123' } };
        expect(extractXOriginValues(data, '$.org.id')).toEqual(['abc-123']);
    });
});

// ===========================================================================
// setNestedValue
// ===========================================================================
describe('setNestedValue', () => {
    test('sets simple key', () => {
        const obj = {};
        setNestedValue(obj, 'name', 'test');
        expect(obj).toEqual({ name: 'test' });
    });

    test('sets dot-path key', () => {
        const obj = {};
        setNestedValue(obj, 'endpoint.uri', '"http://x"');
        expect(obj).toEqual({ endpoint: { uri: 'http://x' } });
    });

    test('sets array index', () => {
        const obj = {};
        setNestedValue(obj, 'items[0]', '"a"');
        expect(obj).toEqual({ items: ['a'] });
    });

    test('sets deep mixed path', () => {
        const obj = {};
        setNestedValue(obj, 'data.list[0].name', '"x"');
        expect(obj).toEqual({ data: { list: [{ name: 'x' }] } });
    });

    test('preserves existing keys', () => {
        const obj = { endpoint: { type: 'http' } };
        setNestedValue(obj, 'endpoint.uri', '"http://x"');
        expect(obj).toEqual({ endpoint: { type: 'http', uri: 'http://x' } });
    });

    test('handles numeric string as value', () => {
        const obj = {};
        setNestedValue(obj, 'port', '8080');
        expect(obj).toEqual({ port: 8080 });
    });
});

// ===========================================================================
// tryParseJson
// ===========================================================================
describe('tryParseJson', () => {
    test('parses valid JSON number', () => {
        expect(tryParseJson('42')).toBe(42);
    });

    test('parses valid JSON object', () => {
        expect(tryParseJson('{"a":1}')).toEqual({ a: 1 });
    });

    test('returns original string for invalid JSON', () => {
        expect(tryParseJson('hello')).toBe('hello');
    });

    test('parses boolean strings', () => {
        expect(tryParseJson('true')).toBe(true);
        expect(tryParseJson('false')).toBe(false);
    });

    test('parses null', () => {
        expect(tryParseJson('null')).toBeNull();
    });
});

// ===========================================================================
// syncBodyFieldsToRaw
// ===========================================================================
describe('syncBodyFieldsToRaw', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        window.aceEditors = {};
    });

    function buildPanel(sid, fields) {
        const panel = document.createElement('div');
        panel.id = 'wf-try-' + sid;

        const editorDiv = document.createElement('div');
        editorDiv.id = 'wf-body-' + sid;
        editorDiv.className = 'wf-request-editor-cm';
        panel.appendChild(editorDiv);

        // Mock Ace editor
        let mockContent = '';
        const mockEditor = {
            getValue() {
                return mockContent;
            },
            setValue(content) {
                mockContent = content;
            }
        };

        window.aceEditors = window.aceEditors || {};
        window.aceEditors['wf-body-' + sid] = mockEditor;

        fields.forEach(({ name, value }) => {
            const input = document.createElement('input');
            input.setAttribute('data-in', 'body');
            input.setAttribute('data-wf-param', name);
            input.value = value;
            panel.appendChild(input);
        });

        document.body.appendChild(panel);
        return mockEditor;
    }

    test('populates Ace editor with JSON from inputs', () => {
        const editor = buildPanel('test-0', [
            { name: 'name', value: 'my-api' },
            { name: 'active', value: 'true' },
        ]);
        syncBodyFieldsToRaw('test-0');
        const result = JSON.parse(editor.getValue());
        expect(result).toEqual({ name: 'my-api', active: true });
    });

    test('builds nested JSON from dot-path fields', () => {
        const editor = buildPanel('test-1', [
            { name: 'endpoint.uri', value: 'http://backend.example.com' },
            { name: 'endpoint.type', value: 'http' },
        ]);
        syncBodyFieldsToRaw('test-1');
        const result = JSON.parse(editor.getValue());
        expect(result).toEqual({
            endpoint: { uri: 'http://backend.example.com', type: 'http' },
        });
    });

    test('produces empty editor when all inputs are empty', () => {
        const editor = buildPanel('test-2', [
            { name: 'name', value: '' },
        ]);
        syncBodyFieldsToRaw('test-2');
        expect(editor.getValue()).toBe('');
    });

    test('does nothing when panel does not exist', () => {
        // Should not throw
        syncBodyFieldsToRaw('nonexistent');
    });
});

// ===========================================================================
// renderOutputDropdownRow
// ===========================================================================
describe('renderOutputDropdownRow', () => {
    test('renders a table row with the output name in the first cell', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'groupId', ['g1', 'g2']);
        expect(html).toContain('<tr>');
        expect(html).toContain('<code>groupId</code>');
    });

    test('renders a select element with wf-output-select class', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'groupId', ['g1', 'g2']);
        expect(html).toContain('class="wf-output-select"');
        expect(html).toContain('<select');
        expect(html).toContain('</select>');
    });

    test('first option is pre-selected', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'id', ['env-1', 'env-2', 'env-3']);
        expect(html).toContain('value="0" selected');
        // Only the first option should be selected
        expect(html.match(/ selected/g).length).toBe(1);
    });

    test('renders one option per value', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'name', ['a', 'b', 'c']);
        expect(html).toContain('value="0"');
        expect(html).toContain('value="1"');
        expect(html).toContain('value="2"');
        expect(html.match(/<option/g).length).toBe(3);
    });

    test('options always include array index prefix', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'id', ['alpha', 'beta', 'gamma']);
        expect(html).toContain('[0]');
        expect(html).toContain('[1]');
        expect(html).toContain('[2]');
    });

    test('without labels shows [i] value format', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'id', ['abc-123', 'def-456']);
        expect(html).toContain('[0] abc-123');
        expect(html).toContain('[1] def-456');
    });

    test('with labels shows [i] label (value) format when label differs from value', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'envId',
            ['f3b2a1c0', 'a9c8e2f1'],
            ['Production', 'Sandbox'],
        );
        expect(html).toContain('[0] Production (f3b2a1c0)');
        expect(html).toContain('[1] Sandbox (a9c8e2f1)');
    });

    test('with labels shows [i] value format when label equals value', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'name',
            ['foo', 'bar'],
            ['foo', 'bar'],
        );
        expect(html).toContain('[0] foo');
        expect(html).toContain('[1] bar');
        // Should NOT add redundant parenthetical
        expect(html).not.toContain('(foo)');
        expect(html).not.toContain('(bar)');
    });

    test('without labels truncates long values at 80 chars', () => {
        const longVal = 'x'.repeat(100);
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'val', [longVal]);
        // [0] + space prefix + 80 chars of value
        expect(html).toContain('x'.repeat(80));
        expect(html).not.toContain('x'.repeat(81));
    });

    test('with labels truncates long value at 60 chars in parenthetical', () => {
        const longVal = 'x'.repeat(100);
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'val', [longVal], ['My Label']);
        expect(html).toContain('x'.repeat(60));
        expect(html).not.toContain('x'.repeat(61));
    });

    test('null labels argument falls back to value-only format', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'id', ['abc', 'def'], null);
        expect(html).toContain('[0] abc');
        expect(html).toContain('[1] def');
        expect(html).not.toContain('(abc)');
    });

    test('select carries data-skill, data-step, and data-output-name attributes', () => {
        const html = renderOutputDropdownRow('my-skill-0', 'my-skill', 0, 'assetId', ['a']);
        expect(html).toContain('data-skill="my-skill"');
        expect(html).toContain('data-step="0"');
        expect(html).toContain('data-output-name="assetId"');
    });

    test('does not contain radio buttons or row-selection markup', () => {
        const html = renderOutputDropdownRow('skill-0', 'skill', 0, 'id', ['a', 'b']);
        expect(html).not.toContain('type="radio"');
        expect(html).not.toContain('wf-row-selected');
        expect(html).not.toContain('data-row-index');
    });
});

// ===========================================================================
// Skill Actions Dropdown
// ===========================================================================
describe('toggleSkillDropdown', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    function buildSplitBtn(slug) {
        const wrapper = document.createElement('div');
        wrapper.className = 'skill-split-btn';
        wrapper.id = 'skill-actions-' + slug;

        const main = document.createElement('button');
        main.className = 'skill-split-main';
        wrapper.appendChild(main);

        const toggle = document.createElement('button');
        toggle.className = 'skill-split-toggle';
        toggle.setAttribute('aria-expanded', 'false');
        wrapper.appendChild(toggle);

        const menu = document.createElement('div');
        menu.className = 'skill-dropdown-menu';
        menu.id = 'skill-dropdown-menu-' + slug;
        menu.style.display = 'none';
        wrapper.appendChild(menu);

        document.body.appendChild(wrapper);
        return { wrapper, main, toggle, menu };
    }

    test('opens a closed dropdown', () => {
        const { toggle, menu } = buildSplitBtn('test-skill');
        toggleSkillDropdown('test-skill');
        expect(menu.style.display).toBe('block');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    test('closes an open dropdown', () => {
        const { toggle, menu } = buildSplitBtn('test-skill');
        menu.style.display = 'block';
        toggle.setAttribute('aria-expanded', 'true');
        toggleSkillDropdown('test-skill');
        expect(menu.style.display).toBe('none');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    test('closes other open dropdowns when opening a new one', () => {
        const first = buildSplitBtn('skill-a');
        const second = buildSplitBtn('skill-b');
        first.menu.style.display = 'block';
        first.toggle.setAttribute('aria-expanded', 'true');

        toggleSkillDropdown('skill-b');
        expect(first.menu.style.display).toBe('none');
        expect(first.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(second.menu.style.display).toBe('block');
    });

    test('does nothing for non-existent slug', () => {
        buildSplitBtn('real');
        toggleSkillDropdown('fake');
        // No error thrown, real menu unchanged
        expect(document.getElementById('skill-dropdown-menu-real').style.display).toBe('none');
    });
});

describe('openInstallModal / closeInstallModal', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    function buildModal(slug) {
        const modal = document.createElement('div');
        modal.id = 'install-modal-' + slug;
        modal.style.display = 'none';
        document.body.appendChild(modal);
        return modal;
    }

    test('openInstallModal shows the modal', () => {
        const modal = buildModal('test-skill');
        openInstallModal('test-skill');
        expect(modal.style.display).toBe('flex');
    });

    test('closeInstallModal hides the modal', () => {
        const modal = buildModal('test-skill');
        modal.style.display = 'flex';
        closeInstallModal('test-skill');
        expect(modal.style.display).toBe('none');
    });

    test('openInstallModal does nothing for non-existent slug', () => {
        buildModal('real');
        openInstallModal('fake');
        expect(document.getElementById('install-modal-real').style.display).toBe('none');
    });
});

describe('copyInstallFromModal', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('copies command text from code element', () => {
        Object.assign(navigator, {
            clipboard: { writeText: jest.fn(() => Promise.resolve()) },
        });

        const code = document.createElement('code');
        code.id = 'install-cmd-my-skill';
        code.textContent = 'npx skills add https://github.com/mulesoft/anypoint-dev-portal/ --skill my-skill';
        document.body.appendChild(code);

        const btn = document.createElement('button');
        const span = document.createElement('span');
        span.textContent = 'Copy';
        btn.appendChild(span);
        document.body.appendChild(btn);

        copyInstallFromModal('my-skill', btn);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            'npx skills add https://github.com/mulesoft/anypoint-dev-portal/ --skill my-skill'
        );
    });
});

describe('copySkillContent', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        globalThis.fetch = undefined;
    });

    test('fetches SKILL.md and copies to clipboard', async () => {
        const mdContent = '---\nname: my-skill\n---\n# My Skill';
        globalThis.fetch = jest.fn(() => Promise.resolve({ text: () => Promise.resolve(mdContent) }));
        Object.assign(navigator, {
            clipboard: { writeText: jest.fn(() => Promise.resolve()) },
        });

        const wrapper = document.createElement('div');
        wrapper.className = 'skill-split-btn';
        const main = document.createElement('button');
        main.className = 'skill-split-main';
        main.textContent = 'Copy Install Command';
        const span = document.createElement('span');
        span.textContent = 'Copy Install Command';
        main.appendChild(span);
        wrapper.appendChild(main);
        document.body.appendChild(wrapper);

        copySkillContent('my-skill', main);
        expect(globalThis.fetch).toHaveBeenCalledWith('../skills/my-skill/SKILL.md');

        // Wait for promises to resolve
        await new Promise((r) => setTimeout(r, 0));
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mdContent);
    });
});

describe('_closeAllSkillDropdowns', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    test('closes all open dropdowns', () => {
        function addMenu(slug) {
            const wrapper = document.createElement('div');
            wrapper.className = 'skill-split-btn';
            const toggle = document.createElement('button');
            toggle.className = 'skill-split-toggle';
            toggle.setAttribute('aria-expanded', 'true');
            wrapper.appendChild(toggle);
            const menu = document.createElement('div');
            menu.className = 'skill-dropdown-menu';
            menu.id = 'skill-dropdown-menu-' + slug;
            menu.style.display = 'block';
            wrapper.appendChild(menu);
            document.body.appendChild(wrapper);
            return { toggle, menu };
        }

        const a = addMenu('a');
        const b = addMenu('b');
        _closeAllSkillDropdowns();
        expect(a.menu.style.display).toBe('none');
        expect(b.menu.style.display).toBe('none');
        expect(a.toggle.getAttribute('aria-expanded')).toBe('false');
        expect(b.toggle.getAttribute('aria-expanded')).toBe('false');
    });
});

// ===========================================================================
// unwrapMcpToolResponse
// ===========================================================================
describe('unwrapMcpToolResponse', () => {
    test('extracts JSON object from result.content[0].text', () => {
        const proxyData = {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    content: [{ type: 'text', text: '{"assetId":"my-api","name":"My API"}' }],
                },
            }),
        };
        expect(unwrapMcpToolResponse(proxyData)).toEqual({ assetId: 'my-api', name: 'My API' });
    });

    test('extracts JSON array from result.content[0].text', () => {
        const proxyData = {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    content: [{ type: 'text', text: '[{"id":"a"},{"id":"b"}]' }],
                },
            }),
        };
        expect(unwrapMcpToolResponse(proxyData)).toEqual([{ id: 'a' }, { id: 'b' }]);
    });

    test('parses NDJSON (newline-delimited JSON) from text field', () => {
        const ndjson = '{"type":"begin","value":{"totalHits":2}}\n'
            + '{"type":"hit","value":{"assetId":"cars"}}\n'
            + '{"type":"hit","value":{"assetId":"bikes"}}\n'
            + '{"type":"end","value":{}}\n';
        const proxyData = {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    content: [{ type: 'text', text: ndjson }],
                },
            }),
        };
        const result = unwrapMcpToolResponse(proxyData);
        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(4);
        expect(result[0]).toEqual({ type: 'begin', value: { totalHits: 2 } });
        expect(result[1]).toEqual({ type: 'hit', value: { assetId: 'cars' } });
        expect(result[3]).toEqual({ type: 'end', value: {} });
    });

    test('returns raw string when text is not JSON or NDJSON', () => {
        const proxyData = {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: {
                    content: [{ type: 'text', text: 'plain text response' }],
                },
            }),
        };
        expect(unwrapMcpToolResponse(proxyData)).toBe('plain text response');
    });

    test('returns body object when no text content found', () => {
        const proxyData = {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: { content: [{ type: 'image', data: 'base64...' }] },
            }),
        };
        const result = unwrapMcpToolResponse(proxyData);
        expect(result.jsonrpc).toBe('2.0');
    });

    test('returns empty object when body is not valid JSON', () => {
        const proxyData = { body: 'not-json' };
        expect(unwrapMcpToolResponse(proxyData)).toEqual({});
    });

    test('returns empty object when body is missing', () => {
        expect(unwrapMcpToolResponse({})).toEqual({});
    });

    test('returns body when result has no content array', () => {
        const proxyData = {
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }),
        };
        const result = unwrapMcpToolResponse(proxyData);
        expect(result.jsonrpc).toBe('2.0');
    });

    test('skips blank lines in NDJSON', () => {
        const ndjson = '{"type":"hit","value":{"id":"a"}}\n\n{"type":"hit","value":{"id":"b"}}\n\n';
        const proxyData = {
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                result: { content: [{ type: 'text', text: ndjson }] },
            }),
        };
        const result = unwrapMcpToolResponse(proxyData);
        expect(result).toHaveLength(2);
    });
});

// ===========================================================================
// getMcpEndpointForSlug
// ===========================================================================
describe('getMcpEndpointForSlug', () => {
    const savedLookup = globalThis.__MCP_LOOKUP__;

    afterEach(() => {
        globalThis.__MCP_LOOKUP__ = savedLookup;
        cleanupServerElements();
    });

    test('resolves endpoint URL from lookup', () => {
        globalThis.__MCP_LOOKUP__ = {
            exchange: {
                servers: [{ url: 'https://anypoint.mulesoft.com/exchange/mcp', variables: {} }],
            },
        };
        withServerType('us', null, () => {
            expect(getMcpEndpointForSlug('exchange')).toBe(
                'https://anypoint.mulesoft.com/exchange/mcp',
            );
        });
    });

    test('returns null for unknown slug', () => {
        globalThis.__MCP_LOOKUP__ = {};
        expect(getMcpEndpointForSlug('nonexistent')).toBeNull();
    });

    test('returns null when no servers available', () => {
        globalThis.__MCP_LOOKUP__ = {
            empty: { servers: [] },
        };
        expect(getMcpEndpointForSlug('empty')).toBeNull();
    });

    test('returns full server URL directly', () => {
        globalThis.__MCP_LOOKUP__ = {
            test: {
                servers: [{ url: 'https://api.example.com/v1/mcp', variables: {} }],
            },
        };
        withServerType('us', null, () => {
            expect(getMcpEndpointForSlug('test')).toBe(
                'https://api.example.com/v1/mcp',
            );
        });
    });

    test('resolves server with region variable', () => {
        globalThis.__MCP_LOOKUP__ = {
            regional: {
                servers: [
                    { url: 'https://anypoint.mulesoft.com/exchange/mcp', variables: {} },
                    { url: 'https://eu1.anypoint.mulesoft.com/exchange/mcp', variables: {} },
                    { url: 'https://{region}.platform.mulesoft.com/exchange/mcp', variables: { region: { default: 'ca1' } } },
                ],
            },
        };
        withServerType('eu', null, () => {
            expect(getMcpEndpointForSlug('regional')).toBe(
                'https://eu1.anypoint.mulesoft.com/exchange/mcp',
            );
        });
    });
});

// ===========================================================================
// Session TTL Management
// ===========================================================================

describe('setTokenExpiration', () => {
    beforeEach(() => sessionStorage.clear());

    test('stores expiration in sessionStorage', () => {
        setTokenExpiration(1777057512412);
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe('1777057512412');
    });
});

describe('markTokenExpired', () => {
    beforeEach(() => {
        sessionStorage.clear();
        // Set up minimal DOM elements for updateAuthSummary
        ['authStatusDot', 'authStatusText', 'authLockIcon'].forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement(id === 'authStatusText' ? 'span' : 'img');
                el.id = id;
                if (el.tagName === 'IMG') el.src = 'assets/icons/placeholder.svg';
                document.body.appendChild(el);
            }
        });
    });

    test('sets expiration to 0', () => {
        sessionStorage.setItem('anypoint_token', 'test-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));
        markTokenExpired();
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe('0');
    });

    test('keeps the token itself (amber state, not red)', () => {
        sessionStorage.setItem('anypoint_token', 'test-token');
        markTokenExpired();
        expect(sessionStorage.getItem('anypoint_token')).toBe('test-token');
    });
});

describe('handleProxyResponse', () => {
    beforeEach(() => {
        sessionStorage.clear();
        sessionStorage.setItem('anypoint_token', 'test-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));
        // Minimal DOM for updateAuthSummary
        ['authStatusDot', 'authStatusText', 'authLockIcon'].forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement(id === 'authStatusText' ? 'span' : 'img');
                el.id = id;
                if (el.tagName === 'IMG') el.src = 'assets/icons/placeholder.svg';
                document.body.appendChild(el);
            }
        });
    });
    afterEach(() => {
        delete global.fetch;
    });

    test('marks token expired on 401 when introspection confirms inactive', async () => {
        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 200, body: JSON.stringify({ active: false }) }),
        }));
        await handleProxyResponse({ status: 401 });
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe('0');
    });

    test('does not mark expired on 401 when introspection confirms active', async () => {
        const futureExp = Date.now() + 300000;
        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 200, body: JSON.stringify({ active: true, exp: futureExp }) }),
        }));
        await handleProxyResponse({ status: 401 });
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe(String(futureExp));
    });

    test('does nothing on non-401 responses', async () => {
        global.fetch = jest.fn();
        var original = sessionStorage.getItem('anypoint_token_expires_at');
        await handleProxyResponse({ status: 200 });
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe(original);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('does nothing on server error responses', async () => {
        global.fetch = jest.fn();
        var original = sessionStorage.getItem('anypoint_token_expires_at');
        await handleProxyResponse({ status: 500 });
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe(original);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('marks expired on 401 when introspection network fails', async () => {
        global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));
        await handleProxyResponse({ status: 401 });
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe('0');
    });

    test('marks expired on 401 when introspection returns error', async () => {
        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ error: 'invalid_token' }),
        }));
        await handleProxyResponse({ status: 401 });
        expect(sessionStorage.getItem('anypoint_token_expires_at')).toBe('0');
    });
});

describe('isTokenExpired (with TTL)', () => {
    beforeEach(() => sessionStorage.clear());

    test('returns true when no token', () => {
        expect(isTokenExpired()).toBe(true);
    });

    test('returns false when token exists with future expiration', () => {
        sessionStorage.setItem('anypoint_token', 'test-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));
        expect(isTokenExpired()).toBe(false);
    });

    test('returns true when token exists with past expiration', () => {
        sessionStorage.setItem('anypoint_token', 'test-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() - 1000));
        expect(isTokenExpired()).toBe(true);
    });

    test('returns true when expiration is 0 (marked expired)', () => {
        sessionStorage.setItem('anypoint_token', 'test-token');
        sessionStorage.setItem('anypoint_token_expires_at', '0');
        expect(isTokenExpired()).toBe(true);
    });
});

// ===========================================================================
// URL State Management
// ===========================================================================

function setURL(path) {
    window.history.replaceState({}, '', path);
}

describe('getFilterFromURL', () => {
    afterEach(() => setURL('/'));

    test('returns "all" when no filter param', () => {
        setURL('/');
        expect(getFilterFromURL()).toBe('all');
    });

    test('returns filter value from URL', () => {
        setURL('/?filter=api');
        expect(getFilterFromURL()).toBe('api');
    });

    test('returns "all" for empty filter param', () => {
        setURL('/?filter=');
        expect(getFilterFromURL()).toBe('all');
    });
});

describe('getTagsFromURL', () => {
    afterEach(() => setURL('/'));

    test('returns empty array when no tags param', () => {
        setURL('/');
        expect(getTagsFromURL()).toEqual([]);
    });

    test('returns array of tags from comma-separated param', () => {
        setURL('/?tags=exchange,api,governance');
        expect(getTagsFromURL()).toEqual(['exchange', 'api', 'governance']);
    });

    test('normalizes tags to lowercase', () => {
        setURL('/?tags=Exchange,API');
        expect(getTagsFromURL()).toEqual(['exchange', 'api']);
    });

    test('trims whitespace from tags', () => {
        setURL('/?tags=foo%20,%20bar');
        expect(getTagsFromURL()).toEqual(['foo', 'bar']);
    });

    test('filters out empty tags', () => {
        setURL('/?tags=foo,,bar,');
        expect(getTagsFromURL()).toEqual(['foo', 'bar']);
    });
});

describe('getViewFromURL', () => {
    afterEach(() => setURL('/'));

    test('returns "grid" when no view param', () => {
        setURL('/');
        expect(getViewFromURL()).toBe('grid');
    });

    test('returns "list" when view=list', () => {
        setURL('/?view=list');
        expect(getViewFromURL()).toBe('list');
    });

    test('returns "grid" for empty view param', () => {
        setURL('/?view=');
        expect(getViewFromURL()).toBe('grid');
    });
});

describe('updateURLState', () => {
    beforeEach(() => {
        setURL('/');
        document.body.innerHTML = '';
        selectedTags.length = 0;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        selectedTags.length = 0;
    });

    function addHeroTab(filter, active) {
        const btn = document.createElement('button');
        btn.className = 'hero-tab' + (active ? ' active' : '');
        btn.dataset.filter = filter;
        document.body.appendChild(btn);
        return btn;
    }

    function addViewBtn(view, active) {
        const btn = document.createElement('button');
        btn.className = 'view-toggle-btn' + (active ? ' active' : '');
        btn.dataset.view = view;
        document.body.appendChild(btn);
        return btn;
    }

    function getParams() {
        return new URL(window.location.href).searchParams;
    }

    test('sets filter param when not "all"', () => {
        addHeroTab('api', true);
        addViewBtn('grid', true);
        updateURLState();
        expect(getParams().get('filter')).toBe('api');
    });

    test('omits filter param when "all"', () => {
        addHeroTab('all', true);
        addViewBtn('grid', true);
        updateURLState();
        expect(getParams().has('filter')).toBe(false);
    });

    test('sets tags param from selectedTags', () => {
        addHeroTab('all', true);
        addViewBtn('grid', true);
        selectedTags.push('exchange', 'governance');
        updateURLState();
        expect(getParams().get('tags')).toBe('exchange,governance');
    });

    test('omits tags param when no tags selected', () => {
        addHeroTab('all', true);
        addViewBtn('grid', true);
        updateURLState();
        expect(getParams().has('tags')).toBe(false);
    });

    test('sets view param when list mode', () => {
        addHeroTab('all', true);
        addViewBtn('list', true);
        updateURLState();
        // View mode disabled for launch - always grid
        expect(getParams().has('view')).toBe(false);
    });

    test('omits view param when grid mode (default)', () => {
        addHeroTab('all', true);
        addViewBtn('grid', true);
        updateURLState();
        expect(getParams().has('view')).toBe(false);
    });

    test('combines all state in URL', () => {
        addHeroTab('mcp', true);
        addViewBtn('list', true);
        selectedTags.push('exchange');
        updateURLState();
        expect(getParams().get('filter')).toBe('mcp');
        expect(getParams().get('tags')).toBe('exchange');
        // View mode disabled for launch - always grid
        expect(getParams().has('view')).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// __mcpCoerceValue — type coercion for MCP tool arguments
// ---------------------------------------------------------------------------
describe('__mcpCoerceValue', () => {
    test('returns undefined for empty string', () => {
        expect(__mcpCoerceValue('', 'string')).toBeUndefined();
    });

    test('returns undefined for null', () => {
        expect(__mcpCoerceValue(null, 'string')).toBeUndefined();
    });

    test('coerces string to integer', () => {
        expect(__mcpCoerceValue('42', 'integer')).toBe(42);
    });

    test('returns raw value for non-numeric integer', () => {
        expect(__mcpCoerceValue('abc', 'integer')).toBe('abc');
    });

    test('coerces string to number (float)', () => {
        expect(__mcpCoerceValue('3.14', 'number')).toBeCloseTo(3.14);
    });

    test('coerces "true" to boolean true', () => {
        expect(__mcpCoerceValue('true', 'boolean')).toBe(true);
    });

    test('coerces "false" to boolean false', () => {
        expect(__mcpCoerceValue('false', 'boolean')).toBe(false);
    });

    test('returns undefined for invalid boolean', () => {
        expect(__mcpCoerceValue('yes', 'boolean')).toBeUndefined();
    });

    test('parses JSON for object type', () => {
        expect(__mcpCoerceValue('{"a":1}', 'object')).toEqual({ a: 1 });
    });

    test('parses JSON for array type', () => {
        expect(__mcpCoerceValue('[1,2,3]', 'array')).toEqual([1, 2, 3]);
    });

    test('returns raw string for invalid JSON object', () => {
        expect(__mcpCoerceValue('{bad', 'object')).toBe('{bad');
    });

    test('returns string as-is for string type', () => {
        expect(__mcpCoerceValue('hello', 'string')).toBe('hello');
    });
});

// ---------------------------------------------------------------------------
// substituteVariables — ${var} replacement in skill workflows
// ---------------------------------------------------------------------------
describe('substituteVariables', () => {
    beforeEach(() => {
        // skillVariables is a global in portal.js
        skillVariables = {};
    });

    test('replaces single variable', () => {
        skillVariables['myskill'] = { orgId: '12345' };
        expect(substituteVariables('org: ${orgId}', 'myskill')).toBe('org: 12345');
    });

    test('replaces multiple variables', () => {
        skillVariables['s1'] = { org: 'acme', env: 'prod' };
        expect(substituteVariables('${org}/${env}', 's1')).toBe('acme/prod');
    });

    test('leaves unresolved variables as-is', () => {
        skillVariables['s1'] = {};
        expect(substituteVariables('${missing}', 's1')).toBe('${missing}');
    });

    test('returns non-string values unchanged', () => {
        expect(substituteVariables(null, 'x')).toBe(null);
        expect(substituteVariables(undefined, 'x')).toBe(undefined);
        expect(substituteVariables(42, 'x')).toBe(42);
    });

    test('stringifies object variable values', () => {
        skillVariables['s1'] = { data: { key: 'val' } };
        expect(substituteVariables('${data}', 's1')).toBe('{"key":"val"}');
    });

    test('handles empty slug gracefully', () => {
        skillVariables = {};
        expect(substituteVariables('${x}', 'nope')).toBe('${x}');
    });
});

// ===========================================================================
// wrapTerraformCodeBlocks
// ===========================================================================
describe('wrapTerraformCodeBlocks', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    function buildMarkdown(preCount) {
        const container = document.createElement('div');
        container.className = 'terraform-view-markdown';
        for (let i = 0; i < preCount; i++) {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = 'resource "x" "y" {}';
            pre.appendChild(code);
            container.appendChild(pre);
        }
        document.body.appendChild(container);
        return container;
    }

    test('wraps each pre with a code-block-wrapper containing a header and copy button', () => {
        buildMarkdown(2);
        wrapTerraformCodeBlocks();
        const wrappers = document.querySelectorAll('.code-block-wrapper');
        expect(wrappers.length).toBe(2);
        wrappers.forEach((w) => {
            expect(w.querySelector('.code-block-header')).not.toBeNull();
            expect(w.querySelector('pre')).not.toBeNull();
        });
    });

    test('is idempotent when called twice', () => {
        buildMarkdown(2);
        wrapTerraformCodeBlocks();
        wrapTerraformCodeBlocks();
        const wrappers = document.querySelectorAll('.code-block-wrapper');
        expect(wrappers.length).toBe(2);
    });

    test('does nothing when no terraform-view-markdown pre exists', () => {
        wrapTerraformCodeBlocks();
        const wrappers = document.querySelectorAll('.code-block-wrapper');
        expect(wrappers.length).toBe(0);
    });

    test('inserted button has class code-block-copy-btn and contains an SVG', () => {
        buildMarkdown(1);
        wrapTerraformCodeBlocks();
        const btn = document.querySelector('.code-block-copy-btn');
        expect(btn).not.toBeNull();
        expect(btn.querySelector('svg')).not.toBeNull();
    });
});

// ===========================================================================
// copyTerraformCode
// ===========================================================================
describe('copyTerraformCode', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        globalThis.navigator = globalThis.navigator || {};
        globalThis.navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
    });

    function buildWrapper(text) {
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        const header = document.createElement('div');
        header.className = 'code-block-header';
        const btn = document.createElement('button');
        btn.className = 'code-block-copy-btn';
        btn.innerHTML = '<svg><rect></rect></svg>';
        header.appendChild(btn);
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = text;
        pre.appendChild(code);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);
        document.body.appendChild(wrapper);
        return { wrapper, btn };
    }

    test('calls clipboard.writeText with the pre code text content', () => {
        const { btn } = buildWrapper('resource "anypoint_api" "x" {}');
        copyTerraformCode(btn);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('resource "anypoint_api" "x" {}');
    });

    test('replaces button.innerHTML with checkmark SVG on success', async () => {
        const { btn } = buildWrapper('foo');
        copyTerraformCode(btn);
        await Promise.resolve();
        expect(btn.innerHTML).toContain('polyline');
    });

    test('restores original innerHTML after 1500ms', async () => {
        const { btn } = buildWrapper('foo');
        const original = btn.innerHTML;
        copyTerraformCode(btn);
        await Promise.resolve();
        expect(btn.innerHTML).not.toBe(original);
        jest.advanceTimersByTime(1500);
        expect(btn.innerHTML).toBe(original);
    });

    test('does nothing when called with element not inside a wrapper', () => {
        const orphan = document.createElement('button');
        document.body.appendChild(orphan);
        copyTerraformCode(orphan);
        expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// getSortDisplayLabel
// ===========================================================================
describe('getSortDisplayLabel', () => {
    test('returns "Name" for name sort regardless of filter', () => {
        expect(getSortDisplayLabel('name', 'all')).toBe('Name');
        expect(getSortDisplayLabel('name', 'api')).toBe('Name');
        expect(getSortDisplayLabel('name', 'mcp')).toBe('Name');
    });

    test('returns "Type" for type sort regardless of filter', () => {
        expect(getSortDisplayLabel('type', 'all')).toBe('Type');
        expect(getSortDisplayLabel('type', 'api')).toBe('Type');
    });

    test('returns "Endpoints" for count sort when filtered to api', () => {
        expect(getSortDisplayLabel('count', 'api')).toBe('Endpoints');
    });

    test('returns "Tools" for count sort when filtered to mcp', () => {
        expect(getSortDisplayLabel('count', 'mcp')).toBe('Tools');
    });

    test('returns "Steps" for count sort when filtered to skill', () => {
        expect(getSortDisplayLabel('count', 'skill')).toBe('Steps');
    });

    test('returns "Docs" for count sort when filtered to terraform', () => {
        expect(getSortDisplayLabel('count', 'terraform')).toBe('Docs');
    });

    test('returns "Count" for count sort when showing all', () => {
        expect(getSortDisplayLabel('count', 'all')).toBe('Count');
    });

    test('returns "Count" for count sort with unknown filter', () => {
        expect(getSortDisplayLabel('count', 'unknown')).toBe('Count');
    });
});

// ===========================================================================
// loginBearer / loginOAuth2 — error handling
// ===========================================================================

function setupAuthDom() {
    document.body.innerHTML = `
        <div id="authMessage"></div>
        <input id="authUsername" value="user@test.com" />
        <input id="authPassword" value="wrongpass" />
        <input id="authClientId" value="my-client" />
        <input id="authClientSecret" value="my-secret" />
    `;
}

function mockFetchResponse(data) {
    global.fetch = jest.fn(() => Promise.resolve({
        json: () => Promise.resolve(data),
    }));
}

function mockFetchNetworkError() {
    global.fetch = jest.fn(() => Promise.reject(new Error('Failed to fetch')));
}

function getAuthMessage() {
    const el = document.getElementById('authMessage');
    return { text: el.textContent, isError: el.className.includes('auth-error') };
}

describe('loginBearer error handling', () => {
    beforeEach(() => {
        setupAuthDom();
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
        delete global.fetch;
    });

    test('401 with non-JSON body shows "Login failed: Unauthorized"', async () => {
        mockFetchResponse({ status: 401, headers: {}, body: 'Unauthorized' });
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Login failed: Unauthorized');
        expect(msg.isError).toBe(true);
    });

    test('400 with JSON error body shows the error message', async () => {
        mockFetchResponse({ status: 400, headers: {}, body: JSON.stringify({ message: 'Invalid request format' }) });
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Login failed: Invalid request format');
        expect(msg.isError).toBe(true);
    });

    test('404 with plain text body shows the body content', async () => {
        mockFetchResponse({ status: 404, headers: {}, body: 'Not Found' });
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Login failed: Not Found');
        expect(msg.isError).toBe(true);
    });

    test('500 with JSON error body shows the error field', async () => {
        mockFetchResponse({ status: 500, headers: {}, body: JSON.stringify({ error: 'Internal Server Error' }) });
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Login failed: Internal Server Error');
        expect(msg.isError).toBe(true);
    });

    test('502 with empty body shows "Unknown error"', async () => {
        mockFetchResponse({ status: 502, headers: {}, body: '' });
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Login failed: Unknown error');
        expect(msg.isError).toBe(true);
    });

    test('504 with HTML body shows raw body as fallback', async () => {
        mockFetchResponse({ status: 504, headers: {}, body: '<html>Gateway Timeout</html>' });
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Login failed: <html>Gateway Timeout</html>');
        expect(msg.isError).toBe(true);
    });

    test('network failure shows generic connection error', async () => {
        mockFetchNetworkError();
        await loginBearer();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Unable to connect to the server. Please check your network connection and try again.');
        expect(msg.isError).toBe(true);
    });

    test('no error message mentions proxy', async () => {
        mockFetchResponse({ status: 401, headers: {}, body: 'Unauthorized' });
        await loginBearer();
        expect(getAuthMessage().text.toLowerCase()).not.toContain('proxy');
    });
});

describe('loginOAuth2 error handling', () => {
    beforeEach(() => {
        setupAuthDom();
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
        delete global.fetch;
    });

    test('401 with non-JSON body shows "Token request failed: Unauthorized"', async () => {
        mockFetchResponse({ status: 401, headers: {}, body: 'Unauthorized' });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Token request failed: Unauthorized');
        expect(msg.isError).toBe(true);
    });

    test('400 with oauth error body shows error_description', async () => {
        mockFetchResponse({ status: 400, headers: {}, body: JSON.stringify({ error: 'invalid_client', error_description: 'Client authentication failed' }) });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Token request failed: Client authentication failed');
        expect(msg.isError).toBe(true);
    });

    test('404 with plain text body shows the body content', async () => {
        mockFetchResponse({ status: 404, headers: {}, body: 'Not Found' });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Token request failed: Not Found');
        expect(msg.isError).toBe(true);
    });

    test('500 with JSON error body shows the error field', async () => {
        mockFetchResponse({ status: 500, headers: {}, body: JSON.stringify({ error: 'Internal Server Error' }) });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Token request failed: Internal Server Error');
        expect(msg.isError).toBe(true);
    });

    test('502 with empty body shows "Unknown error"', async () => {
        mockFetchResponse({ status: 502, headers: {}, body: '' });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Token request failed: Unknown error');
        expect(msg.isError).toBe(true);
    });

    test('504 with HTML body shows raw body as fallback', async () => {
        mockFetchResponse({ status: 504, headers: {}, body: '<html>Gateway Timeout</html>' });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Token request failed: <html>Gateway Timeout</html>');
        expect(msg.isError).toBe(true);
    });

    test('network failure shows generic connection error', async () => {
        mockFetchNetworkError();
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Unable to connect to the server. Please check your network connection and try again.');
        expect(msg.isError).toBe(true);
    });

    test('server-side error field shows "Server error:" prefix', async () => {
        mockFetchResponse({ error: 'connection reset' });
        await loginOAuth2();
        const msg = getAuthMessage();
        expect(msg.text).toBe('Server error: connection reset');
        expect(msg.isError).toBe(true);
    });

    test('no error message mentions proxy', async () => {
        mockFetchResponse({ status: 401, headers: {}, body: 'Unauthorized' });
        await loginOAuth2();
        expect(getAuthMessage().text.toLowerCase()).not.toContain('proxy');
    });
});

// ===========================================================================
// toggleSkillMode — scroll to first step on activation
// ===========================================================================

describe('toggleSkillMode scroll behavior', () => {
    const slug = 'test-skill';

    function setupSkillDom() {
        document.body.innerHTML = `
            <div id="toggle-${slug}" aria-checked="false"></div>
            <div id="variables-sidebar-${slug}" style="display:none"></div>
            <div class="step-documentation-view"></div>
            <div class="step-interactive-view" style="display:none"></div>
            <div id="step-${slug}-0"></div>
            <div id="step-${slug}-1"></div>
        `;
        document.getElementById('step-' + slug + '-0').scrollIntoView = jest.fn();
        document.getElementById('step-' + slug + '-1').scrollIntoView = jest.fn();
    }

    beforeEach(() => {
        setupSkillDom();
    });

    test('scrolls to first step when activating interactive mode', () => {
        toggleSkillMode(slug);
        const firstStep = document.getElementById('step-' + slug + '-0');
        expect(firstStep.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    });

    test('does not scroll to second step', () => {
        toggleSkillMode(slug);
        const secondStep = document.getElementById('step-' + slug + '-1');
        expect(secondStep.scrollIntoView).not.toHaveBeenCalled();
    });

    test('does not scroll when deactivating interactive mode', () => {
        // Activate first
        toggleSkillMode(slug);
        const firstStep = document.getElementById('step-' + slug + '-0');
        firstStep.scrollIntoView.mockClear();
        // Deactivate
        toggleSkillMode(slug);
        expect(firstStep.scrollIntoView).not.toHaveBeenCalled();
    });
});

// ===========================================================================
// executeXOriginSource — button reset and auth errors
// ===========================================================================

describe('executeXOriginSource — button reset and auth errors', () => {
    let responseDiv, responseBodyDiv, sourceDiv, btn, textSpan;

    function setupMinimalDom() {
        // Minimal DOM structure for executeXOriginSource
        responseDiv = document.createElement('div');
        responseDiv.id = 'response-xorigin-0';
        responseDiv.classList.add('empty');
        document.body.appendChild(responseDiv);

        responseBodyDiv = document.createElement('div');
        responseBodyDiv.id = 'respbody-xorigin-0';
        document.body.appendChild(responseBodyDiv);

        sourceDiv = document.createElement('div');
        sourceDiv.className = 'xorigin-source';
        sourceDiv.setAttribute('data-source-idx', '0');
        document.body.appendChild(sourceDiv);

        // Button element with span
        btn = document.createElement('button');
        textSpan = document.createElement('span');
        textSpan.textContent = 'Send';
        btn.appendChild(textSpan);

        // Mock window.__OP_LOOKUP__ for API/operation resolution
        window.__OP_LOOKUP__ = {
            'test-api': {
                ops: {
                    'listItems': {
                        method: 'GET',
                        path: '/api/v1/items'
                    }
                }
            }
        };

        // Mock xOriginModalStack
        xOriginModalStack.length = 0;
        xOriginModalStack.push({
            opId: 'test-op',
            paramName: 'testParam',
            origins: [{
                api: 'urn:api:test-api',
                operation: 'listItems',
                values: '$.data[*].id'
            }]
        });
    }

    function cleanupDom() {
        document.body.innerHTML = '';
        sessionStorage.clear();
        delete window.__OP_LOOKUP__;
        xOriginModalStack.length = 0;
        delete global.fetch;
    }

    beforeEach(() => {
        setupMinimalDom();
        // Minimal DOM for updateAuthSummary (called by markTokenExpired)
        ['authStatusDot', 'authStatusText', 'authLockIcon'].forEach(id => {
            if (!document.getElementById(id)) {
                const el = document.createElement(id === 'authStatusText' ? 'span' : 'img');
                el.id = id;
                if (el.tagName === 'IMG') el.src = 'assets/icons/placeholder.svg';
                document.body.appendChild(el);
            }
        });
    });

    afterEach(() => {
        cleanupDom();
    });

    // --- 1. Button reset after auth error (no token) ---

    test('resets button to original text after auth error (no token)', async () => {
        sessionStorage.removeItem('anypoint_token');
        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
    });

    test('re-enables button after auth error (no token)', async () => {
        sessionStorage.removeItem('anypoint_token');
        await executeXOriginSource(0, btn);
        expect(btn.disabled).toBe(false);
    });

    // --- 2. Auth CTA link for no-token case ---

    test('shows auth error message when no token', async () => {
        sessionStorage.removeItem('anypoint_token');
        await executeXOriginSource(0, btn);

        const errorDiv = responseBodyDiv.querySelector('.xorigin-error');
        expect(errorDiv).not.toBeNull();
        expect(errorDiv.textContent).toContain('Please authenticate first');
    });

    // --- 3. Error message for expired-token case ---

    test('shows expired token error message', async () => {
        sessionStorage.setItem('anypoint_token', 'expired-token');
        sessionStorage.setItem('anypoint_token_expires_at', '0');
        await executeXOriginSource(0, btn);

        const errorDiv = responseBodyDiv.querySelector('.xorigin-error');
        expect(errorDiv).not.toBeNull();
        expect(errorDiv.textContent).toContain('Token expired');
    });

    test('resets button to original text after expired token error', async () => {
        sessionStorage.setItem('anypoint_token', 'expired-token');
        sessionStorage.setItem('anypoint_token_expires_at', '0');
        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    // --- 4. Button reset after non-2xx response (including 401/403) ---

    test('resets button after 401 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 401, body: 'Unauthorized' })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    test('resets button after 403 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 403, body: 'Forbidden' })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    test('resets button after 404 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 404, body: 'Not Found' })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    test('resets button after 500 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 500, body: 'Internal Server Error' })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    // --- 5. Auth CTA link for 401/403 responses ---

    test('shows status error for 401 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 401, body: 'Unauthorized' })
        }));

        await executeXOriginSource(0, btn);

        const errorDiv = responseBodyDiv.querySelector('.xorigin-error');
        expect(errorDiv).not.toBeNull();
        expect(errorDiv.textContent).toContain('Request returned status 401');
    });

    test('shows status error for 403 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 403, body: 'Forbidden' })
        }));

        await executeXOriginSource(0, btn);

        const errorDiv = responseBodyDiv.querySelector('.xorigin-error');
        expect(errorDiv).not.toBeNull();
        expect(errorDiv.textContent).toContain('Request returned status 403');
    });

    // --- 6. No regression: button resets after generic error (data.error) ---

    test('resets button after generic proxy error (data.error)', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ error: 'Connection timeout' })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    test('shows error message for generic proxy error', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ error: 'Network error' })
        }));

        await executeXOriginSource(0, btn);

        const errorDiv = responseBodyDiv.querySelector('.xorigin-error');
        expect(errorDiv).not.toBeNull();
        expect(errorDiv.textContent).toContain('Network error');
    });

    // --- 7. Additional edge cases ---

    test('button shows "Sending..." while request is pending', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        // Create a promise that we'll resolve manually
        let resolvePromise;
        const promise = new Promise(resolve => { resolvePromise = resolve; });

        global.fetch = jest.fn(() => promise);

        // Start the request (don't await)
        const execution = executeXOriginSource(0, btn);

        // Check button state immediately
        expect(textSpan.textContent).toBe('Sending...');
        expect(btn.disabled).toBe(true);

        // Resolve the promise
        resolvePromise({ json: () => Promise.resolve({ status: 200, body: '{"data":[]}' }) });

        // Wait for execution to complete
        await execution;
    });

    test('does not reset button when no button element provided', async () => {
        sessionStorage.removeItem('anypoint_token');
        await executeXOriginSource(0, null);
        // Should not throw, just handle gracefully
    });

    test('handles missing text span gracefully', async () => {
        sessionStorage.removeItem('anypoint_token');
        const btnNoSpan = document.createElement('button');
        await executeXOriginSource(0, btnNoSpan);
        // Should not throw
    });

    // --- 8. Button reset after successful 200 response ---

    test('resets button after successful 200 response', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 200, body: '{"data":[{"id":"abc"}]}', headers: {} })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });

    // --- 9. Button reset after JSON parse failure ---

    test('resets button after invalid JSON in response body', async () => {
        sessionStorage.setItem('anypoint_token', 'valid-token');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));

        global.fetch = jest.fn(() => Promise.resolve({
            json: () => Promise.resolve({ status: 200, body: 'not-valid-json{{{', headers: {} })
        }));

        await executeXOriginSource(0, btn);
        expect(textSpan.textContent).toBe('Send');
        expect(btn.disabled).toBe(false);
    });
});

// ===========================================================================
// applyAuthModalMode — logged-in state hides credential inputs
// ===========================================================================
describe('applyAuthModalMode (logged-in state)', () => {
    function buildAuthModalDom() {
        document.body.innerHTML = `
            <select id="serverSelect"><option value="us">US</option></select>
            <select id="regionPreset"><option value="eu1">eu1</option></select>
            <input id="regionCustomInput" type="text">
            <button class="auth-tab" data-tab="bearer"></button>
            <button class="auth-tab" data-tab="oauth2"></button>
            <input id="authUsername" type="text">
            <input id="authPassword" type="password">
            <input id="authClientId" type="text">
            <input id="authClientSecret" type="password">
            <button id="authBearerLoginBtn"></button>
            <button id="authBearerLogoutBtn" class="btn-auth-logout"></button>
            <button id="authOauth2LoginBtn"></button>
            <button id="authOauth2LogoutBtn" class="btn-auth-logout"></button>
            <div id="authBearerLoggedAs" class="auth-logged-as"><strong id="authBearerLoggedAsValue"></strong></div>
            <div id="authOauth2LoggedAs" class="auth-logged-as"><strong id="authOauth2LoggedAsValue"></strong></div>
        `;
    }

    afterEach(() => {
        sessionStorage.clear();
        document.body.innerHTML = '';
    });

    test('hides bearer credential inputs and shows logout button when authenticated as Bearer', () => {
        buildAuthModalDom();
        sessionStorage.setItem('anypoint_token', 'tok');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));
        sessionStorage.setItem('anypoint_auth_method', 'Bearer');
        sessionStorage.setItem('anypoint_identity', 'Roberto Cantalapiedra');

        applyAuthModalMode();

        expect(document.getElementById('authUsername').style.display).toBe('none');
        expect(document.getElementById('authPassword').style.display).toBe('none');
        expect(document.getElementById('authBearerLoginBtn').style.display).toBe('none');
        expect(document.getElementById('authBearerLogoutBtn').style.display).toBe('');
        expect(document.getElementById('authBearerLoggedAs').style.display).toBe('');
        expect(document.getElementById('authBearerLoggedAsValue').textContent).toBe('Roberto Cantalapiedra');
    });

    test('hides oauth2 credential inputs and shows logout button when authenticated as OAuth2', () => {
        buildAuthModalDom();
        sessionStorage.setItem('anypoint_token', 'tok');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));
        sessionStorage.setItem('anypoint_auth_method', 'OAuth2');
        sessionStorage.setItem('anypoint_identity', 'svc-account');

        applyAuthModalMode();

        expect(document.getElementById('authClientId').style.display).toBe('none');
        expect(document.getElementById('authClientSecret').style.display).toBe('none');
        expect(document.getElementById('authOauth2LoginBtn').style.display).toBe('none');
        expect(document.getElementById('authOauth2LogoutBtn').style.display).toBe('');
        expect(document.getElementById('authOauth2LoggedAs').style.display).toBe('');
    });

    test('restores credential inputs when not authenticated', () => {
        buildAuthModalDom();
        sessionStorage.clear();

        applyAuthModalMode();

        expect(document.getElementById('authUsername').style.display).toBe('');
        expect(document.getElementById('authPassword').style.display).toBe('');
        expect(document.getElementById('authClientId').style.display).toBe('');
        expect(document.getElementById('authClientSecret').style.display).toBe('');
        expect(document.getElementById('authBearerLogoutBtn').style.display).toBe('none');
        expect(document.getElementById('authOauth2LogoutBtn').style.display).toBe('none');
        expect(document.getElementById('authBearerLoggedAs').style.display).toBe('none');
        expect(document.getElementById('authOauth2LoggedAs').style.display).toBe('none');
    });

    test('falls back to em-dash when identity is missing', () => {
        buildAuthModalDom();
        sessionStorage.setItem('anypoint_token', 'tok');
        sessionStorage.setItem('anypoint_token_expires_at', String(Date.now() + 3600000));
        sessionStorage.setItem('anypoint_auth_method', 'Bearer');
        sessionStorage.setItem('anypoint_identity', '');

        applyAuthModalMode();

        expect(document.getElementById('authBearerLoggedAsValue').textContent).toBe('—');
    });
});

// ---------------------------------------------------------------------------
// getEffectiveServer — region-aware server picker (W-23196976).
// ---------------------------------------------------------------------------
describe('getEffectiveServer', () => {
    afterEach(() => {
        cleanupServerElements();
    });

    test('picks the first matching server for the selected region', () => {
        withServerType('eu', 'eu1', () => {
            const servers = [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
                { url: 'https://{region}.anypoint.mulesoft.com/v1',
                  variables: { region: { default: 'eu1' } } },
            ];
            const result = getEffectiveServer(servers, null);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://eu1.anypoint.mulesoft.com/v1');
        });
    });

    test('forces region substitution when no server matches (supported=false)', () => {
        withServerType('eu', 'eu1', () => {
            // Only a US-fixed server declared; eu1 has no match.
            const servers = [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
            ];
            const result = getEffectiveServer(servers, null);
            expect(result.supported).toBe(false);
            expect(result.server).toBeNull();
            // Host rewrite injects the selected region as subdomain even when the
            // server URL is fixed (no {region} template). This mirrors the auth
            // modal's live URL preview so "Try it" hits the selected region.
            expect(result.url).toBe('https://eu1.anypoint.mulesoft.com/v1');
        });
    });

    test('multi-server list: first matching wins deterministically', () => {
        withServerType('platform', 'ca1', () => {
            const servers = [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
                { url: 'https://ca1.platform.mulesoft.com/v1', variables: {} },
                { url: 'https://jp1.platform.mulesoft.com/v1', variables: {} },
            ];
            const result = getEffectiveServer(servers, null);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://ca1.platform.mulesoft.com/v1');
        });
    });

    test('unknown region marks supported=false and rewrites host', () => {
        withServerType('platform', 'xyz1', () => {
            const servers = [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
                { url: 'https://{region}.platform.mulesoft.com/v1',
                  variables: { region: { default: 'ca1' } } },
            ];
            const result = getEffectiveServer(servers, null);
            // Custom / unsupported: an API cannot declare a server for a region
            // outside DOMAIN_REGIONS, so we surface the notice AND rewrite the
            // URL so "Try it" still hits the selected region.
            expect(result.supported).toBe(false);
            expect(result.url).toBe('https://xyz1.platform.mulesoft.com/v1');
        });
    });

    test('cross-domain: platform region selected but API only declares anypoint servers', () => {
        withServerType('platform', 'in1', () => {
            // API like AEH Consumer API that only has anypoint.mulesoft.com servers.
            // Selected region in1 (platform domain) — URL must be rewritten to
            // in1.platform.mulesoft.com even though the server host is anypoint.
            const servers = [
                { url: 'https://anypoint.mulesoft.com/api-experience-hub/xapi/v1', variables: {} },
            ];
            const result = getEffectiveServer(servers, null);
            expect(result.supported).toBe(false);
            expect(result.server).toBeNull();
            expect(result.url).toBe('https://in1.platform.mulesoft.com/api-experience-hub/xapi/v1');
        });
    });

    test('cross-domain: eu region selected but API only declares platform servers', () => {
        withServerType('eu', 'eu1', () => {
            const servers = [
                { url: 'https://ca1.platform.mulesoft.com/some/api/v1', variables: {} },
            ];
            const result = getEffectiveServer(servers, null);
            expect(result.supported).toBe(false);
            expect(result.server).toBeNull();
            expect(result.url).toBe('https://eu1.anypoint.mulesoft.com/some/api/v1');
        });
    });

    test('empty servers array returns empty URL, supported=true, no throw', () => {
        withServerType('us', null, () => {
            const result = getEffectiveServer([], null);
            expect(result).toEqual({ server: null, url: '', supported: true });
        });
    });
});

// ---------------------------------------------------------------------------
// getEffectiveMcpRemote — region-aware MCP remote picker (W-23196976).
// ---------------------------------------------------------------------------
describe('getEffectiveMcpRemote', () => {
    afterEach(() => {
        cleanupServerElements();
    });

    test('picks the remote whose host matches the selected region', () => {
        withServerType('eu', 'eu1', () => {
            const remotes = [
                { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
                { type: 'streamable-http', url: 'https://eu1.anypoint.mulesoft.com/exchange/mcp' },
                { type: 'streamable-http', url: 'https://ca1.platform.mulesoft.com/exchange/mcp' },
            ];
            const result = getEffectiveMcpRemote(remotes);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://eu1.anypoint.mulesoft.com/exchange/mcp');
        });
    });

    test('returns supported=false and cross-domain rewritten URL when no host matches the region', () => {
        withServerType('platform', 'in1', () => {
            // No remote declares in1; ca1 is a different platform region.
            // Fallback rewrites remotes[0] (anypoint host) cross-domain to in1.platform.mulesoft.com.
            const remotes = [
                { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
                { type: 'streamable-http', url: 'https://eu1.anypoint.mulesoft.com/exchange/mcp' },
                { type: 'streamable-http', url: 'https://ca1.platform.mulesoft.com/exchange/mcp' },
            ];
            const result = getEffectiveMcpRemote(remotes);
            expect(result.supported).toBe(false);
            expect(result.remote).toBeNull();
            expect(result.url).toBe('https://in1.platform.mulesoft.com/exchange/mcp');
        });
    });

    test('unknown region rewrites host and marks supported=false', () => {
        withServerType('platform', 'xyz1', () => {
            const remotes = [
                { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
                { type: 'streamable-http', url: 'https://ca1.platform.mulesoft.com/exchange/mcp' },
            ];
            const result = getEffectiveMcpRemote(remotes);
            // Custom / unsupported: rewrites the platform remote to the custom
            // subdomain AND surfaces the notice via supported=false.
            expect(result.supported).toBe(false);
            expect(result.url).toBe('https://xyz1.platform.mulesoft.com/exchange/mcp');
        });
    });

    // --- omni.mulesoft.com: product-specific host, region prefixed as
    // subdomain regardless of server type, supported always true (no notice).
    const OMNI_REMOTES = [
        { type: 'streamable-http', url: 'https://omni.mulesoft.com/mcp/' },
        { type: 'sse', url: 'https://omni.mulesoft.com/mcp-sse/sse' },
    ];

    test('omni: no region keeps the bare host', () => {
        withServerType('us', null, () => {
            const result = getEffectiveMcpRemote(OMNI_REMOTES);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://omni.mulesoft.com/mcp/');
        });
    });

    test('omni: eu1 region prefixes the subdomain', () => {
        withServerType('eu', 'eu1', () => {
            const result = getEffectiveMcpRemote(OMNI_REMOTES);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://eu1.omni.mulesoft.com/mcp/');
        });
    });

    test('omni: prefix is applied regardless of server type (platform)', () => {
        // Same region string, server type = platform: URL must be identical to
        // the eu case above — omni ignores server type entirely.
        withServerType('platform', 'jp1', () => {
            const result = getEffectiveMcpRemote(OMNI_REMOTES);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://jp1.omni.mulesoft.com/mcp/');
        });
    });

    test('omni: custom region prefixes without a notice (supported stays true)', () => {
        withServerType('eu', 'aaa', () => {
            const result = getEffectiveMcpRemote(OMNI_REMOTES);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://aaa.omni.mulesoft.com/mcp/');
        });
    });

    test('omni: rewrite targets the host only, preserving the path', () => {
        // Only the SSE remote declared → path /mcp-sse/sse must survive.
        withServerType('platform', 'ca1', () => {
            const result = getEffectiveMcpRemote([
                { type: 'sse', url: 'https://omni.mulesoft.com/mcp-sse/sse' },
            ]);
            expect(result.supported).toBe(true);
            expect(result.url).toBe('https://ca1.omni.mulesoft.com/mcp-sse/sse');
        });
    });

    test('omni: never double-prefixes a host that already has a subdomain', () => {
        withServerType('eu', 'eu1', () => {
            const result = getEffectiveMcpRemote([
                { type: 'streamable-http', url: 'https://ca1.omni.mulesoft.com/mcp/' },
            ]);
            expect(result.url).toBe('https://eu1.omni.mulesoft.com/mcp/');
        });
    });
});

// ---------------------------------------------------------------------------
// _renderMcpUrlBar — MCP URL bar never surfaces a region notice (product
// decision). Also proves the omni prefix reaches the rendered DOM.
// ---------------------------------------------------------------------------
describe('_renderMcpUrlBar', () => {
    let bar;

    beforeEach(() => {
        bar = document.createElement('code');
        bar.className = 'operation-url-bar';
        bar.setAttribute('data-mcp', '1');
        document.body.appendChild(bar);
    });

    afterEach(() => {
        bar.remove();
        cleanupServerElements();
    });

    test('renders the region-prefixed omni URL as plain text', () => {
        withServerType('eu', 'eu1', () => {
            _renderMcpUrlBar(bar, [
                { type: 'streamable-http', url: 'https://omni.mulesoft.com/mcp/' },
            ]);
            const plain = bar.querySelector('.url-text-plain');
            expect(plain).not.toBeNull();
            expect(plain.textContent).toBe('https://eu1.omni.mulesoft.com/mcp/');
        });
    });

    test('never renders a region notice for omni, even for a custom region', () => {
        withServerType('eu', 'aaa', () => {
            _renderMcpUrlBar(bar, [
                { type: 'streamable-http', url: 'https://omni.mulesoft.com/mcp/' },
            ]);
            expect(bar.parentElement.querySelector('.operation-region-notice')).toBeNull();
        });
    });

    test('never renders a region notice for an anypoint MCP in an unsupported region', () => {
        // anypoint host + unknown region → getEffectiveMcpRemote returns
        // supported=false, but MCP must NOT surface a notice.
        withServerType('platform', 'xyz1', () => {
            _renderMcpUrlBar(bar, [
                { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
            ]);
            expect(bar.parentElement.querySelector('.operation-region-notice')).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// __mcpEndpointUrl — the Try It / Copy cURL endpoint must match the rendered
// URL bar. Both go through getEffectiveMcpRemote, NOT the API-operations path,
// so the omni region prefix reaches the actual request payload.
// ---------------------------------------------------------------------------
describe('__mcpEndpointUrl', () => {
    afterEach(() => {
        cleanupServerElements();
        delete window.__MCP_META__;
    });

    test('returns null when __MCP_META__ is absent', () => {
        delete window.__MCP_META__;
        expect(__mcpEndpointUrl()).toBeNull();
    });

    test('applies the omni region prefix (matches the URL bar)', () => {
        window.__MCP_META__ = {
            servers: [{ type: 'streamable-http', url: 'https://omni.mulesoft.com/mcp/' }],
        };
        withServerType('eu', 'eu1', () => {
            expect(__mcpEndpointUrl()).toBe('https://eu1.omni.mulesoft.com/mcp/');
        });
    });

    test('omni prefix is server-type independent for the request endpoint', () => {
        window.__MCP_META__ = {
            servers: [{ type: 'streamable-http', url: 'https://omni.mulesoft.com/mcp/' }],
        };
        withServerType('platform', 'jp1', () => {
            expect(__mcpEndpointUrl()).toBe('https://jp1.omni.mulesoft.com/mcp/');
        });
    });

    test('keeps the bare omni host when no region is selected', () => {
        window.__MCP_META__ = {
            servers: [{ type: 'streamable-http', url: 'https://omni.mulesoft.com/mcp/' }],
        };
        withServerType('us', null, () => {
            expect(__mcpEndpointUrl()).toBe('https://omni.mulesoft.com/mcp/');
        });
    });

    test('anypoint MCP still picks the region-matching remote', () => {
        window.__MCP_META__ = {
            servers: [
                { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
                { type: 'streamable-http', url: 'https://eu1.anypoint.mulesoft.com/exchange/mcp' },
            ],
        };
        withServerType('eu', 'eu1', () => {
            expect(__mcpEndpointUrl()).toBe('https://eu1.anypoint.mulesoft.com/exchange/mcp');
        });
    });
});

// ---------------------------------------------------------------------------
// buildUrlBar — DOM behavior + region reactivity (W-23196976).
// ---------------------------------------------------------------------------
describe('buildUrlBar', () => {
    let wrapper, bar;

    beforeEach(() => {
        wrapper = document.createElement('div');
        bar = document.createElement('code');
        bar.className = 'operation-url-bar';
        bar.setAttribute('data-op-id', 'getFoo');
        bar.setAttribute('data-path', '/foo');
        wrapper.appendChild(bar);
        document.body.appendChild(wrapper);
    });

    afterEach(() => {
        wrapper.remove();
        cleanupServerElements();
        delete window.__API_META__;
    });

    test('single-server API renders url-text-plain, no notice', () => {
        withServerType('us', null, () => {
            const servers = [{ url: 'https://api.example.com/v1', variables: {} }];
            buildUrlBar(bar, 'getFoo', '/foo', servers);

            const plain = bar.querySelector('.url-text-plain');
            expect(plain).not.toBeNull();
            expect(plain.textContent).toBe('https://api.example.com/v1/foo');
            expect(wrapper.querySelector('.operation-region-notice')).toBeNull();
        });
    });

    test('multi-server, region-matching server renders as plain URL, no notice', () => {
        withServerType('platform', 'ca1', () => {
            const servers = [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
                { url: 'https://ca1.platform.mulesoft.com/v1', variables: {} },
            ];
            buildUrlBar(bar, 'getFoo', '/foo', servers);

            const plain = bar.querySelector('.url-text-plain');
            expect(plain).not.toBeNull();
            expect(plain.textContent).toBe('https://ca1.platform.mulesoft.com/v1/foo');
            expect(wrapper.querySelector('.operation-region-notice')).toBeNull();
        });
    });

    test('region not supported: renders plain URL AND a region-notice sibling', () => {
        withServerType('eu', 'eu1', () => {
            // Only a US-fixed server declared; eu1 has no match.
            const servers = [{ url: 'https://anypoint.mulesoft.com/v1', variables: {} }];
            buildUrlBar(bar, 'getFoo', '/foo', servers);

            expect(bar.querySelector('.url-text-plain')).not.toBeNull();
            const notice = wrapper.querySelector('.operation-region-notice');
            expect(notice).not.toBeNull();
            expect(notice.getAttribute('role')).toBe('status');
            expect(notice.getAttribute('aria-live')).toBe('polite');
            expect(notice.textContent.toLowerCase()).toContain('not available');
        });
    });

    test('updateAllServerBars re-renders after a region change', () => {
        window.__API_META__ = {
            servers: [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
                { url: 'https://ca1.platform.mulesoft.com/v1', variables: {} },
                { url: 'https://eu1.anypoint.mulesoft.com/v1', variables: {} },
            ],
        };
        withServerType('platform', 'ca1', () => {
            buildUrlBar(bar, 'getFoo', '/foo', window.__API_META__.servers);
            expect(bar.querySelector('.url-text-plain').textContent)
                .toBe('https://ca1.platform.mulesoft.com/v1/foo');
        });
        withServerType('eu', 'eu1', () => {
            updateAllServerBars();
            expect(bar.querySelector('.url-text-plain').textContent)
                .toBe('https://eu1.anypoint.mulesoft.com/v1/foo');
        });
    });

    test('region-change re-render clears old notice (never accumulates duplicate notices)', () => {
        window.__API_META__ = {
            servers: [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
            ],
        };
        // First render in unsupported region → notice appears
        withServerType('eu', 'eu1', () => {
            buildUrlBar(bar, 'getFoo', '/foo', window.__API_META__.servers);
            expect(wrapper.querySelectorAll('.operation-region-notice').length).toBe(1);
        });
        // Re-render in same unsupported region → still only 1 notice
        withServerType('eu', 'eu1', () => {
            updateAllServerBars();
            expect(wrapper.querySelectorAll('.operation-region-notice').length).toBe(1);
        });
        // Switch to supported region → notice removed
        withServerType('us', null, () => {
            updateAllServerBars();
            expect(wrapper.querySelectorAll('.operation-region-notice').length).toBe(0);
        });
    });

    // Regression: the combobox with chevron + click-to-open dropdown must not
    // exist. It was removed in W-23196976 because the auth modal region is
    // the single source of truth.
    test('regression: buildUrlBar NEVER renders .url-combobox or .server-dropdown', () => {
        withServerType('platform', 'ca1', () => {
            const servers = [
                { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
                { url: 'https://ca1.platform.mulesoft.com/v1', variables: {} },
                { url: 'https://jp1.platform.mulesoft.com/v1', variables: {} },
            ];
            buildUrlBar(bar, 'getFoo', '/foo', servers);

            expect(bar.querySelector('.url-combobox')).toBeNull();
            expect(bar.querySelector('.url-combobox-text')).toBeNull();
            expect(bar.querySelector('.url-combobox-chevron')).toBeNull();
            expect(document.querySelector('.server-dropdown')).toBeNull();
        });
    });
});

describe('refreshAuthUiFor — region-led lock state', () => {
    function setupMinimalDom() {
        // Only the elements refreshAuthUiFor reads that we care about here.
        const region = document.createElement('select');
        region.id = 'regionSelect';
        document.body.appendChild(region);
        const server = document.createElement('select');
        server.id = 'serverSelect';
        document.body.appendChild(server);
        const custom = document.createElement('input');
        custom.id = 'regionCustomInput';
        document.body.appendChild(custom);
        // Placeholders for other fields refreshAuthUiFor prods but which don't
        // affect the assertions here.
        ['authUsername','authPassword','authClientId','authClientSecret',
         'authBearerLoginBtn','authBearerLogoutBtn','authOauth2LoginBtn',
         'authOauth2LogoutBtn','authBearerLoggedAs','authBearerLoggedAsValue',
         'authOauth2LoggedAs','authOauth2LoggedAsValue'].forEach((id) => {
            const el = document.createElement('div');
            el.id = id;
            document.body.appendChild(el);
        });
        // Auth tabs
        const btab = document.createElement('button');
        btab.className = 'auth-tab';
        btab.setAttribute('data-tab', 'bearer');
        document.body.appendChild(btab);
        const otab = document.createElement('button');
        otab.className = 'auth-tab';
        otab.setAttribute('data-tab', 'oauth2');
        document.body.appendChild(otab);
    }
    function cleanupAll() {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        sessionStorage.clear();
    }
    afterEach(() => cleanupAll());

    test('authenticated=true disables regionSelect, serverSelect, regionCustomInput', () => {
        setupMinimalDom();
        refreshAuthUiFor(true, 'me@example.com', 'Bearer Token');
        expect(document.getElementById('regionSelect').disabled).toBe(true);
        expect(document.getElementById('serverSelect').disabled).toBe(true);
        expect(document.getElementById('regionCustomInput').disabled).toBe(true);
    });

    test('authenticated=false re-enables all three', () => {
        setupMinimalDom();
        refreshAuthUiFor(false, null, null);
        expect(document.getElementById('regionSelect').disabled).toBe(false);
        expect(document.getElementById('serverSelect').disabled).toBe(false);
        expect(document.getElementById('regionCustomInput').disabled).toBe(false);
    });
});

describe('restoreServerSelection (legacy migration)', () => {
    function setupDom() {
        const region = document.createElement('select');
        region.id = 'regionSelect';
        ['us', 'eu1', 'ca1', 'jp1', 'in1', 'custom'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; region.appendChild(o);
        });
        document.body.appendChild(region);
        const row = document.createElement('div');
        row.id = 'customServerRow';
        row.style.display = 'none';
        document.body.appendChild(row);
        const server = document.createElement('select');
        server.id = 'serverSelect';
        ['eu', 'platform'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; server.appendChild(o);
        });
        document.body.appendChild(server);
        const input = document.createElement('input');
        input.id = 'regionCustomInput';
        document.body.appendChild(input);
    }
    function cleanup() {
        ['regionSelect', 'customServerRow', 'serverSelect', 'regionCustomInput']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        sessionStorage.removeItem('anypoint_server_type');
        sessionStorage.removeItem('anypoint_region');
    }
    afterEach(() => cleanup());

    test('legacy (eu, eu1) restores regionSelect=eu1', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'eu');
        sessionStorage.setItem('anypoint_region', 'eu1');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('eu1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('legacy (platform, ca1) restores regionSelect=ca1', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'platform');
        sessionStorage.setItem('anypoint_region', 'ca1');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('ca1');
    });

    test('legacy (us, "") restores regionSelect=us', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'us');
        sessionStorage.setItem('anypoint_region', '');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('us');
    });

    test('legacy (platform, apac2 = unknown) restores custom row', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'platform');
        sessionStorage.setItem('anypoint_region', 'apac2');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('custom');
        expect(document.getElementById('customServerRow').style.display).toBe('flex');
        expect(document.getElementById('serverSelect').value).toBe('platform');
        expect(document.getElementById('regionCustomInput').value).toBe('apac2');
    });

    test('legacy (eu, mytest = unknown) restores custom row with serverSelect=eu', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'eu');
        sessionStorage.setItem('anypoint_region', 'mytest');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('custom');
        expect(document.getElementById('serverSelect').value).toBe('eu');
        expect(document.getElementById('regionCustomInput').value).toBe('mytest');
    });

    test('no legacy data restores regionSelect=us (default)', () => {
        setupDom();
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('us');
    });
});

describe('onRegionSelectChange', () => {
    function setupDom(regionValue, serverValue) {
        // Region select
        const region = document.createElement('select');
        region.id = 'regionSelect';
        ['us', 'eu1', 'ca1', 'jp1', 'in1', 'custom'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; region.appendChild(o);
        });
        region.value = regionValue;
        document.body.appendChild(region);
        // Custom row wrapper
        const row = document.createElement('div');
        row.id = 'customServerRow';
        row.style.display = 'none';
        document.body.appendChild(row);
        // Server select (inside custom row conceptually — DOM presence is what matters)
        const server = document.createElement('select');
        server.id = 'serverSelect';
        ['eu', 'platform'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; server.appendChild(o);
        });
        server.value = serverValue || 'eu';
        document.body.appendChild(server);
        // Custom input
        const input = document.createElement('input');
        input.id = 'regionCustomInput';
        document.body.appendChild(input);
    }
    function cleanup() {
        ['regionSelect', 'customServerRow', 'serverSelect', 'regionCustomInput']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        sessionStorage.removeItem('anypoint_server_type');
        sessionStorage.removeItem('anypoint_region');
    }
    afterEach(() => cleanup());

    test('picking us stores type=us and region=""', () => {
        setupDom('us');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('us');
        expect(sessionStorage.getItem('anypoint_region')).toBe('');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('picking eu1 stores type=eu and region=eu1', () => {
        setupDom('eu1');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('eu');
        expect(sessionStorage.getItem('anypoint_region')).toBe('eu1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('picking ca1 stores type=platform and region=ca1', () => {
        setupDom('ca1');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('platform');
        expect(sessionStorage.getItem('anypoint_region')).toBe('ca1');
    });

    test('picking custom shows customServerRow and defaults type to eu', () => {
        setupDom('custom');
        onRegionSelectChange();
        expect(document.getElementById('customServerRow').style.display).toBe('flex');
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('eu');
    });

    test('picking custom preserves server=platform if already selected', () => {
        setupDom('custom', 'platform');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('platform');
        expect(document.getElementById('customServerRow').style.display).toBe('flex');
    });
});

describe('getSelectedServerType / getSelectedRegion — region-led DOM', () => {
    function makeRegionSelect(value) {
        const sel = document.createElement('select');
        sel.id = 'regionSelect';
        const opt = document.createElement('option');
        opt.value = value;
        sel.appendChild(opt);
        sel.value = value;
        document.body.appendChild(sel);
        return sel;
    }
    function makeServerSelect(value) {
        const sel = document.createElement('select');
        sel.id = 'serverSelect';
        const opt = document.createElement('option');
        opt.value = value;
        sel.appendChild(opt);
        sel.value = value;
        document.body.appendChild(sel);
        return sel;
    }
    function makeCustomInput(value) {
        const inp = document.createElement('input');
        inp.id = 'regionCustomInput';
        inp.value = value;
        document.body.appendChild(inp);
        return inp;
    }
    function cleanup() {
        ['regionSelect', 'serverSelect', 'regionCustomInput', 'regionPreset']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
    }
    afterEach(() => cleanup());

    test('us region → type us, region null', () => {
        makeRegionSelect('us');
        expect(getSelectedServerType()).toBe('us');
        expect(getSelectedRegion()).toBeNull();
    });

    test('eu1 → type eu, region eu1', () => {
        makeRegionSelect('eu1');
        expect(getSelectedServerType()).toBe('eu');
        expect(getSelectedRegion()).toBe('eu1');
    });

    test('ca1 → type platform, region ca1', () => {
        makeRegionSelect('ca1');
        expect(getSelectedServerType()).toBe('platform');
        expect(getSelectedRegion()).toBe('ca1');
    });

    test('custom with server=platform and input=apac2 → type platform, region apac2', () => {
        makeRegionSelect('custom');
        makeServerSelect('platform');
        makeCustomInput('apac2');
        expect(getSelectedServerType()).toBe('platform');
        expect(getSelectedRegion()).toBe('apac2');
    });

    test('custom with empty input → falls back to sessionStorage region', () => {
        makeRegionSelect('custom');
        makeServerSelect('eu');
        makeCustomInput('');
        sessionStorage.setItem('anypoint_server_type', 'eu');
        sessionStorage.setItem('anypoint_region', 'legacy-custom');
        try {
            expect(getSelectedServerType()).toBe('eu');
            expect(getSelectedRegion()).toBe('legacy-custom');
        } finally {
            sessionStorage.removeItem('anypoint_server_type');
            sessionStorage.removeItem('anypoint_region');
        }
    });
});

describe('getServerTypeForRegion', () => {
    test('returns "us" for us / null / empty', () => {
        expect(getServerTypeForRegion('us')).toBe('us');
        expect(getServerTypeForRegion(null)).toBe('us');
        expect(getServerTypeForRegion('')).toBe('us');
    });

    test('returns "eu" for anypoint-domain regions', () => {
        expect(getServerTypeForRegion('eu1')).toBe('eu');
    });

    test('returns "platform" for platform-domain regions', () => {
        expect(getServerTypeForRegion('ca1')).toBe('platform');
        expect(getServerTypeForRegion('jp1')).toBe('platform');
        expect(getServerTypeForRegion('in1')).toBe('platform');
        expect(getServerTypeForRegion('au1')).toBe('platform');
    });

    test('returns null for unknown / custom regions', () => {
        expect(getServerTypeForRegion('mytest')).toBeNull();
        expect(getServerTypeForRegion('apac2')).toBeNull();
    });
});

// ===========================================================================
// W-23425814 — additional coverage for acceptance criteria not covered by
// the plan's baseline tests.
// ===========================================================================

// ---------------------------------------------------------------------------
// AC 1: Template contract — the auth modal shows a single Region dropdown
// with options US, EU1, CA1, JP1, IN1, Custom; server picker is scoped to
// the Custom sub-row and no longer offers `us`; legacy #regionPreset and
// #regionDefaultOption are gone.
// ---------------------------------------------------------------------------
describe('auth_panel.html template — region-led layout', () => {
    const authPanelHtml = fs.readFileSync(
        path.resolve(__dirname, '../portal_generator/templates/partials/auth_panel.html'),
        'utf-8',
    );

    // Isolate the `.server-section` block so subsequent assertions don't
    // false-match elsewhere in the template.
    function sliceServerSection(src) {
        const startIdx = src.indexOf('server-section');
        expect(startIdx).toBeGreaterThan(-1);
        // Take a wide slice; assertions below are string-contains so extra
        // trailing HTML is harmless.
        return src.slice(Math.max(0, startIdx - 40), startIdx + 1500);
    }

    test('exposes a single #regionSelect with the seven expected options', () => {
        const section = sliceServerSection(authPanelHtml);
        expect(section).toMatch(/id\s*=\s*["']regionSelect["']/);
        expect(section).toMatch(/onchange\s*=\s*["']onRegionSelectChange\(\)["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']us["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']eu1["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']ca1["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']jp1["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']in1["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']au1["']/);
        expect(section).toMatch(/<option[^>]*value\s*=\s*["']custom["']/);
    });

    test('#serverSelect lives inside #customServerRow and offers only eu/platform', () => {
        const section = sliceServerSection(authPanelHtml);
        expect(section).toMatch(/id\s*=\s*["']customServerRow["']/);
        // Custom sub-row is hidden by default.
        expect(section).toMatch(/id\s*=\s*["']customServerRow["'][^>]*style\s*=\s*["']display\s*:\s*none/);
        // serverSelect keeps its id but drops the "us" option.
        expect(section).toMatch(/id\s*=\s*["']serverSelect["']/);
        // No <option value="us"> inside serverSelect. We approximate by
        // ensuring the serverSelect block does not contain a `us` option:
        // slice from `serverSelect` to the next closing </select>.
        const serverSelectStart = section.indexOf('id="serverSelect"');
        expect(serverSelectStart).toBeGreaterThan(-1);
        const serverSelectEnd = section.indexOf('</select>', serverSelectStart);
        const serverSelectBlock = section.slice(serverSelectStart, serverSelectEnd);
        expect(serverSelectBlock).not.toMatch(/<option[^>]*value\s*=\s*["']us["']/);
        expect(serverSelectBlock).toMatch(/<option[^>]*value\s*=\s*["']eu["']/);
        expect(serverSelectBlock).toMatch(/<option[^>]*value\s*=\s*["']platform["']/);
    });

    test('#regionCustomInput lives inside customServerRow with no inline display:none', () => {
        const section = sliceServerSection(authPanelHtml);
        const customRowStart = section.indexOf('id="customServerRow"');
        expect(customRowStart).toBeGreaterThan(-1);
        // Slice the customServerRow container; find a reasonable closing bound.
        const customRowSlice = section.slice(customRowStart, customRowStart + 800);
        expect(customRowSlice).toMatch(/id\s*=\s*["']regionCustomInput["']/);
        // The parent hides the row, so the input itself must NOT be inline-hidden.
        const inputStart = customRowSlice.indexOf('id="regionCustomInput"');
        // Isolate just the <input ...> opening tag (up to the next `>`).
        const inputTagEnd = customRowSlice.indexOf('>', inputStart);
        const inputTag = customRowSlice.slice(inputStart, inputTagEnd);
        expect(inputTag).not.toMatch(/style\s*=\s*["'][^"']*display\s*:\s*none/);
    });

    test('legacy #regionPreset and #regionDefaultOption are removed', () => {
        expect(authPanelHtml).not.toMatch(/id\s*=\s*["']regionPreset["']/);
        expect(authPanelHtml).not.toMatch(/id\s*=\s*["']regionDefaultOption["']/);
        expect(authPanelHtml).not.toMatch(/onRegionPresetChange/);
    });
});

// ---------------------------------------------------------------------------
// AC 2 completeness — the plan tests onRegionSelectChange for us / eu1 / ca1
// / custom, but not the other two platform-domain presets. Cover jp1 and in1
// so every option in the flat list is exercised.
// ---------------------------------------------------------------------------
describe('onRegionSelectChange — remaining preset regions (jp1, in1, au1)', () => {
    function setupDom(regionValue) {
        const region = document.createElement('select');
        region.id = 'regionSelect';
        ['us', 'eu1', 'ca1', 'jp1', 'in1', 'au1', 'custom'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; region.appendChild(o);
        });
        region.value = regionValue;
        document.body.appendChild(region);
        const row = document.createElement('div');
        row.id = 'customServerRow';
        row.style.display = 'none';
        document.body.appendChild(row);
        const server = document.createElement('select');
        server.id = 'serverSelect';
        ['eu', 'platform'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; server.appendChild(o);
        });
        server.value = 'eu';
        document.body.appendChild(server);
        const input = document.createElement('input');
        input.id = 'regionCustomInput';
        document.body.appendChild(input);
    }
    function cleanup() {
        ['regionSelect', 'customServerRow', 'serverSelect', 'regionCustomInput']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        sessionStorage.removeItem('anypoint_server_type');
        sessionStorage.removeItem('anypoint_region');
    }
    afterEach(() => cleanup());

    test('picking jp1 stores type=platform, region=jp1, and hides custom row', () => {
        setupDom('jp1');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('platform');
        expect(sessionStorage.getItem('anypoint_region')).toBe('jp1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('picking in1 stores type=platform, region=in1, and hides custom row', () => {
        setupDom('in1');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('platform');
        expect(sessionStorage.getItem('anypoint_region')).toBe('in1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('picking au1 stores type=platform, region=au1, and hides custom row', () => {
        setupDom('au1');
        onRegionSelectChange();
        expect(sessionStorage.getItem('anypoint_server_type')).toBe('platform');
        expect(sessionStorage.getItem('anypoint_region')).toBe('au1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });
});

// ---------------------------------------------------------------------------
// AC 3: Picking Custom exposes both the server-domain picker and the custom
// region input, and both are required to produce a working URL. The plan
// tests the (type, region) accessors in isolation, but not that the URL
// composition through getSelectedBaseUrl works end-to-end with a region-led
// DOM in Custom mode.
// ---------------------------------------------------------------------------
describe('Custom row — both selectors required for a working URL', () => {
    function makeRegionSelect(value) {
        const sel = document.createElement('select');
        sel.id = 'regionSelect';
        const opt = document.createElement('option');
        opt.value = value;
        sel.appendChild(opt);
        sel.value = value;
        document.body.appendChild(sel);
        return sel;
    }
    function makeServerSelect(value) {
        const sel = document.createElement('select');
        sel.id = 'serverSelect';
        ['eu', 'platform'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; sel.appendChild(o);
        });
        sel.value = value;
        document.body.appendChild(sel);
        return sel;
    }
    function makeCustomInput(value) {
        const inp = document.createElement('input');
        inp.id = 'regionCustomInput';
        inp.value = value;
        document.body.appendChild(inp);
        return inp;
    }
    function cleanup() {
        ['regionSelect', 'serverSelect', 'regionCustomInput'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        sessionStorage.removeItem('anypoint_server_type');
        sessionStorage.removeItem('anypoint_region');
    }
    afterEach(() => cleanup());

    test('custom + server=platform + input=apac2 composes a platform URL', () => {
        makeRegionSelect('custom');
        makeServerSelect('platform');
        makeCustomInput('apac2');
        expect(getSelectedBaseUrl()).toBe('https://apac2.platform.mulesoft.com');
    });

    test('custom + server=eu + input=eu2 composes an anypoint URL', () => {
        makeRegionSelect('custom');
        makeServerSelect('eu');
        makeCustomInput('eu2');
        expect(getSelectedBaseUrl()).toBe('https://eu2.anypoint.mulesoft.com');
    });

    test('custom with empty input still yields a defaulted, non-throwing URL', () => {
        // AC 3 requires both fields to produce a *working* URL — but the
        // helper must never throw when the user has selected Custom without
        // typing anything yet. It should fall back to a defaulted URL
        // (empty region string or a default region), not crash.
        makeRegionSelect('custom');
        makeServerSelect('platform');
        makeCustomInput('');
        expect(() => getSelectedBaseUrl()).not.toThrow();
        // Behavioral floor: the URL must at least be a well-formed https URL
        // for the selected server domain.
        const url = getSelectedBaseUrl();
        expect(url).toMatch(/^https:\/\/[^/]*platform\.mulesoft\.com$/);
    });
});

// ---------------------------------------------------------------------------
// AC 4: getEffectiveServer / getEffectiveMcpRemote must produce the same
// URLs they do today for a given (server_type, region) pair — including
// when the region originates from the new #regionSelect DOM path (not the
// legacy #serverSelect + #regionPreset combo).
// ---------------------------------------------------------------------------
describe('AC 4 — downstream URL resolvers still work with region-led DOM', () => {
    function makeRegionSelect(value) {
        const sel = document.createElement('select');
        sel.id = 'regionSelect';
        const opt = document.createElement('option');
        opt.value = value;
        sel.appendChild(opt);
        sel.value = value;
        document.body.appendChild(sel);
        return sel;
    }
    function cleanup() {
        ['regionSelect', 'serverSelect', 'regionCustomInput'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }
    afterEach(() => cleanup());

    test('getEffectiveServer picks the eu1 server when regionSelect=eu1', () => {
        makeRegionSelect('eu1');
        const servers = [
            { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
            { url: 'https://eu1.anypoint.mulesoft.com/v1', variables: {} },
        ];
        const result = getEffectiveServer(servers, null);
        expect(result.supported).toBe(true);
        expect(result.url).toBe('https://eu1.anypoint.mulesoft.com/v1');
    });

    test('getEffectiveServer picks the ca1 platform server when regionSelect=ca1', () => {
        makeRegionSelect('ca1');
        const servers = [
            { url: 'https://anypoint.mulesoft.com/v1', variables: {} },
            { url: 'https://ca1.platform.mulesoft.com/v1', variables: {} },
            { url: 'https://jp1.platform.mulesoft.com/v1', variables: {} },
        ];
        const result = getEffectiveServer(servers, null);
        expect(result.supported).toBe(true);
        expect(result.url).toBe('https://ca1.platform.mulesoft.com/v1');
    });

    test('getEffectiveServer returns US-fixed URL when regionSelect=us', () => {
        makeRegionSelect('us');
        const servers = [{ url: 'https://anypoint.mulesoft.com/v1', variables: {} }];
        const result = getEffectiveServer(servers, null);
        expect(result.supported).toBe(true);
        expect(result.url).toBe('https://anypoint.mulesoft.com/v1');
    });

    test('getEffectiveMcpRemote picks the eu1 remote when regionSelect=eu1', () => {
        makeRegionSelect('eu1');
        const remotes = [
            { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
            { type: 'streamable-http', url: 'https://eu1.anypoint.mulesoft.com/exchange/mcp' },
            { type: 'streamable-http', url: 'https://ca1.platform.mulesoft.com/exchange/mcp' },
        ];
        const result = getEffectiveMcpRemote(remotes);
        expect(result.supported).toBe(true);
        expect(result.url).toBe('https://eu1.anypoint.mulesoft.com/exchange/mcp');
    });

    test('getEffectiveMcpRemote picks the in1 remote when regionSelect=in1', () => {
        makeRegionSelect('in1');
        const remotes = [
            { type: 'streamable-http', url: 'https://anypoint.mulesoft.com/exchange/mcp' },
            { type: 'streamable-http', url: 'https://in1.platform.mulesoft.com/exchange/mcp' },
        ];
        const result = getEffectiveMcpRemote(remotes);
        expect(result.supported).toBe(true);
        expect(result.url).toBe('https://in1.platform.mulesoft.com/exchange/mcp');
    });
});

// ---------------------------------------------------------------------------
// AC 5 completeness — the plan tests legacy migration for eu1, ca1, us,
// custom (platform+apac2, eu+mytest). Cover the remaining platform presets
// jp1 and in1 so every preset region is exercised through the restore path.
// ---------------------------------------------------------------------------
describe('restoreServerSelection — remaining preset regions (jp1, in1)', () => {
    function setupDom() {
        const region = document.createElement('select');
        region.id = 'regionSelect';
        ['us', 'eu1', 'ca1', 'jp1', 'in1', 'custom'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; region.appendChild(o);
        });
        document.body.appendChild(region);
        const row = document.createElement('div');
        row.id = 'customServerRow';
        row.style.display = 'none';
        document.body.appendChild(row);
        const server = document.createElement('select');
        server.id = 'serverSelect';
        ['eu', 'platform'].forEach((v) => {
            const o = document.createElement('option'); o.value = v; server.appendChild(o);
        });
        document.body.appendChild(server);
        const input = document.createElement('input');
        input.id = 'regionCustomInput';
        document.body.appendChild(input);
    }
    function cleanup() {
        ['regionSelect', 'customServerRow', 'serverSelect', 'regionCustomInput']
            .forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
        sessionStorage.removeItem('anypoint_server_type');
        sessionStorage.removeItem('anypoint_region');
    }
    afterEach(() => cleanup());

    test('legacy (platform, jp1) restores regionSelect=jp1 with custom row hidden', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'platform');
        sessionStorage.setItem('anypoint_region', 'jp1');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('jp1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('legacy (platform, in1) restores regionSelect=in1 with custom row hidden', () => {
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'platform');
        sessionStorage.setItem('anypoint_region', 'in1');
        restoreServerSelection();
        expect(document.getElementById('regionSelect').value).toBe('in1');
        expect(document.getElementById('customServerRow').style.display).toBe('none');
    });

    test('legacy (eu, "") restores regionSelect=eu1 (eu1 is the sole eu preset)', () => {
        // A stored server_type=eu with an empty region is ambiguous. The
        // migration table treats it as "unknown region for eu" → custom,
        // OR (defensible alternative) as a plain eu1 restoration. Either
        // way, the resulting regionSelect must not stay at the default 'us',
        // and the customServerRow visibility must be coherent with the
        // chosen mapping.
        setupDom();
        sessionStorage.setItem('anypoint_server_type', 'eu');
        sessionStorage.setItem('anypoint_region', '');
        restoreServerSelection();
        const rv = document.getElementById('regionSelect').value;
        const rowDisplay = document.getElementById('customServerRow').style.display;
        // Accept either: (a) region='eu1', row hidden; or (b) region='custom', row visible.
        expect(['eu1', 'custom']).toContain(rv);
        if (rv === 'custom') {
            expect(rowDisplay).toBe('flex');
        } else {
            expect(rowDisplay).toBe('none');
        }
    });
});

// ---------------------------------------------------------------------------
// AC 6: While logged in, all three inputs are disabled with the
// SERVER_LOCKED_TOOLTIP tooltip. The plan tests only check `.disabled` but
// AC 6 explicitly requires the tooltip contents; also verifies the reverse
// (unauthenticated removes the title attribute).
// ---------------------------------------------------------------------------
describe('refreshAuthUiFor — locked-state tooltip contents (SERVER_LOCKED_TOOLTIP)', () => {
    function setupMinimalDom() {
        const region = document.createElement('select');
        region.id = 'regionSelect';
        document.body.appendChild(region);
        const server = document.createElement('select');
        server.id = 'serverSelect';
        document.body.appendChild(server);
        const custom = document.createElement('input');
        custom.id = 'regionCustomInput';
        document.body.appendChild(custom);
        ['authUsername','authPassword','authClientId','authClientSecret',
         'authBearerLoginBtn','authBearerLogoutBtn','authOauth2LoginBtn',
         'authOauth2LogoutBtn','authBearerLoggedAs','authBearerLoggedAsValue',
         'authOauth2LoggedAs','authOauth2LoggedAsValue'].forEach((id) => {
            const el = document.createElement('div');
            el.id = id;
            document.body.appendChild(el);
        });
        const btab = document.createElement('button');
        btab.className = 'auth-tab';
        btab.setAttribute('data-tab', 'bearer');
        document.body.appendChild(btab);
        const otab = document.createElement('button');
        otab.className = 'auth-tab';
        otab.setAttribute('data-tab', 'oauth2');
        document.body.appendChild(otab);
    }
    function cleanupAll() {
        document.body.innerHTML = '';
    }
    afterEach(() => cleanupAll());

    test('authenticated=true sets the SERVER_LOCKED_TOOLTIP title on all three inputs', () => {
        setupMinimalDom();
        refreshAuthUiFor(true, 'me@example.com', 'Bearer Token');
        const EXPECTED = 'Log out and log in again to switch server.';
        expect(document.getElementById('regionSelect').getAttribute('title')).toBe(EXPECTED);
        expect(document.getElementById('serverSelect').getAttribute('title')).toBe(EXPECTED);
        expect(document.getElementById('regionCustomInput').getAttribute('title')).toBe(EXPECTED);
    });

    test('authenticated=false removes the title attribute from all three inputs', () => {
        setupMinimalDom();
        // Pre-populate a title to prove it gets cleared.
        document.getElementById('regionSelect').setAttribute('title', 'stale');
        document.getElementById('serverSelect').setAttribute('title', 'stale');
        document.getElementById('regionCustomInput').setAttribute('title', 'stale');
        refreshAuthUiFor(false, null, null);
        expect(document.getElementById('regionSelect').hasAttribute('title')).toBe(false);
        expect(document.getElementById('serverSelect').hasAttribute('title')).toBe(false);
        expect(document.getElementById('regionCustomInput').hasAttribute('title')).toBe(false);
    });
});

// ===========================================================================
// W-23256513 — AU (au1) region label parity
//
// Spec AC #2: "Region appears in the auth modal's region preset dropdown when
// platform is selected." The spec explicitly treats the human-friendly
// `_REGION_LABELS` entry as part of AC #2 — the region must "appear the same
// way the peers do" (e.g. `Australia (au1)`, not the bare code `au1`).
//
// The plan's baseline tests only assert the `value="au1"` attribute exists in
// the template and that `au1` is recognized by the region contract helpers;
// they do NOT verify that:
//   (a) `_regionLabel('au1')` returns the human-friendly label, matching the
//       peer regions' shape (e.g. `Canada (ca1)`, `Japan (jp1)`).
//   (b) the rendered <option> for `au1` in auth_panel.html displays the
//       "Australia (au1)" text (not just the value attribute).
// These are the two label-parity assertions this block adds.
// ===========================================================================
describe('W-23256513 — au1 label parity (_REGION_LABELS + template display text)', () => {
    test('_regionLabel("au1") returns "Australia (au1)"', () => {
        expect(_regionLabel('au1')).toBe('Australia (au1)');
    });

    test('_regionLabel shape matches the peer platform-domain regions', () => {
        // Peer regions all render as `<Country name> (<code>)`. The au1 label
        // must follow the same convention so the dropdown reads uniformly.
        expect(_regionLabel('ca1')).toBe('Canada (ca1)');
        expect(_regionLabel('jp1')).toBe('Japan (jp1)');
        expect(_regionLabel('in1')).toBe('India (in1)');
        expect(_regionLabel('au1')).toBe('Australia (au1)');
    });

    test('auth_panel.html renders the au1 option with "Australia (au1)" display text', () => {
        const authPanelHtml = fs.readFileSync(
            path.resolve(__dirname, '../portal_generator/templates/partials/auth_panel.html'),
            'utf-8',
        );
        // Match the full <option value="au1">Australia (au1)</option> shape,
        // tolerating single/double quotes and inner whitespace.
        expect(authPanelHtml).toMatch(
            /<option[^>]*value\s*=\s*["']au1["'][^>]*>\s*Australia\s*\(au1\)\s*<\/option>/,
        );
    });
});

// ===========================================================================
// W-23256513 — au1 in the DOMAIN_REGIONS matrix (source-of-truth check)
//
// Spec AC #1: `au1` is present in `DOMAIN_REGIONS.platform`. The plan verifies
// this only *indirectly*, by exercising the three helper functions that read
// the matrix. This block asserts the invariant more directly at the template
// / source layer, so a regression that removes `au1` from `DOMAIN_REGIONS`
// (or from `_REGION_LABELS`) surfaces even if the helpers happen to keep
// working through some other code path.
// ===========================================================================
describe('W-23256513 — au1 is registered in portal.js source', () => {
    const portalSource = fs.readFileSync(
        path.resolve(__dirname, '../portal_generator/assets/portal.js'),
        'utf-8',
    );

    test('DOMAIN_REGIONS.platform contains "au1"', () => {
        // Isolate the DOMAIN_REGIONS literal.
        const match = portalSource.match(
            /var\s+DOMAIN_REGIONS\s*=\s*\{[\s\S]*?platform\s*:\s*\[([^\]]*)\]/,
        );
        expect(match).not.toBeNull();
        const platformArrayContents = match[1];
        expect(platformArrayContents).toMatch(/['"]au1['"]/);
    });

    test('_REGION_LABELS has an "au1" entry with the Australia label', () => {
        // Isolate the _REGION_LABELS literal.
        const match = portalSource.match(
            /var\s+_REGION_LABELS\s*=\s*\{([\s\S]*?)\}/,
        );
        expect(match).not.toBeNull();
        const labelsBlock = match[1];
        expect(labelsBlock).toMatch(/au1\s*:\s*['"]Australia \(au1\)['"]/);
    });
});

