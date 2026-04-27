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
    if (type === 'platform' && region) {
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
});

// ===========================================================================
// getSelectedBaseUrl
// ===========================================================================
describe('getSelectedBaseUrl', () => {
    test('returns US base URL by default', () => {
        expect(getSelectedBaseUrl()).toBe('https://anypoint.mulesoft.com');
    });

    test('returns EU base URL when EU selected', () => {
        withServerType('eu', null, () => {
            expect(getSelectedBaseUrl()).toBe('https://eu1.anypoint.mulesoft.com');
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
    const euServer = { url: 'https://eu1.anypoint.mulesoft.com/api/v1' };
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

    test('returns EU server when EU is selected', () => {
        withServerType('eu', null, () => {
            expect(pickServerTemplate([usServer, euServer, platformServer])).toBe(euServer);
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
// getPreferredServerIndex
// ===========================================================================
describe('getPreferredServerIndex', () => {
    const usServer = { url: 'https://anypoint.mulesoft.com/api' };
    const euServer = { url: 'https://eu1.anypoint.mulesoft.com/api' };
    const platformServer = {
        url: 'https://{region}.platform.mulesoft.com/api',
        variables: { region: { default: 'ca1' } },
    };

    test('returns 0 when US selected', () => {
        withServerType('us', null, () => {
            expect(getPreferredServerIndex([usServer, euServer, platformServer])).toBe(0);
        });
    });

    test('returns index of EU server when EU selected', () => {
        withServerType('eu', null, () => {
            expect(getPreferredServerIndex([usServer, euServer, platformServer])).toBe(1);
        });
    });

    test('returns index of platform server when platform selected', () => {
        withServerType('platform', 'ca1', () => {
            expect(getPreferredServerIndex([usServer, euServer, platformServer])).toBe(2);
        });
    });

    test('returns 0 when EU selected but no EU server exists', () => {
        withServerType('eu', null, () => {
            expect(getPreferredServerIndex([usServer, platformServer])).toBe(0);
        });
    });

    test('returns 0 when platform selected but no platform server exists', () => {
        withServerType('platform', 'ca1', () => {
            expect(getPreferredServerIndex([usServer, euServer])).toBe(0);
        });
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
                servers: [{ url: 'https://anypoint.mulesoft.com/exchange', variables: {} }],
                transport: { kind: 'streamableHttp', path: '/mcp' },
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
            empty: { servers: [], transport: { kind: 'streamableHttp', path: '/mcp' } },
        };
        expect(getMcpEndpointForSlug('empty')).toBeNull();
    });

    test('appends transport path to server URL', () => {
        globalThis.__MCP_LOOKUP__ = {
            test: {
                servers: [{ url: 'https://api.example.com', variables: {} }],
                transport: { kind: 'streamableHttp', path: '/v1/mcp' },
            },
        };
        withServerType('us', null, () => {
            expect(getMcpEndpointForSlug('test')).toBe(
                'https://api.example.com/v1/mcp',
            );
        });
    });

    test('handles transport path without leading slash', () => {
        globalThis.__MCP_LOOKUP__ = {
            test: {
                servers: [{ url: 'https://api.example.com', variables: {} }],
                transport: { kind: 'streamableHttp', path: 'mcp' },
            },
        };
        withServerType('us', null, () => {
            expect(getMcpEndpointForSlug('test')).toBe(
                'https://api.example.com/mcp',
            );
        });
    });

    test('defaults path to /mcp when transport path is empty', () => {
        globalThis.__MCP_LOOKUP__ = {
            test: {
                servers: [{ url: 'https://api.example.com', variables: {} }],
                transport: { kind: 'streamableHttp', path: '' },
            },
        };
        withServerType('us', null, () => {
            expect(getMcpEndpointForSlug('test')).toBe(
                'https://api.example.com/mcp',
            );
        });
    });

    test('resolves server with region variable', () => {
        globalThis.__MCP_LOOKUP__ = {
            regional: {
                servers: [
                    { url: 'https://anypoint.mulesoft.com/exchange', variables: {} },
                    { url: 'https://eu1.anypoint.mulesoft.com/exchange', variables: {} },
                    { url: 'https://{region}.platform.mulesoft.com/exchange', variables: { region: { default: 'ca1' } } },
                ],
                transport: { kind: 'streamableHttp', path: '/mcp' },
            },
        };
        withServerType('eu', null, () => {
            expect(getMcpEndpointForSlug('regional')).toBe(
                'https://eu1.anypoint.mulesoft.com/exchange/mcp',
            );
        });
    });
});
