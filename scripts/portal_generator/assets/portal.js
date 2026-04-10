// Anypoint API Portal - Interactive Features

// ============================================================================
// Helper Functions for Rendering
// ============================================================================

function renderJsonPath(jsonPath) {
    if (!jsonPath) return '';

    // Syntax highlighting for JSONPath
    var html = '<code class="jsonpath">';

    // Color different parts of the JSONPath
    var parts = jsonPath.split('.');
    var colored = parts.map(function(part, idx) {
        if (part.startsWith('$')) {
            return '<span class="jsonpath-root">' + escapeHtml(part) + '</span>';
        } else if (part.includes('[')) {
            // Handle array notation
            var match = part.match(/^([^\[]+)(\[.+\])$/);
            if (match) {
                return '<span class="jsonpath-field">' + escapeHtml(match[1]) + '</span>' +
                       '<span class="jsonpath-bracket">' + escapeHtml(match[2]) + '</span>';
            }
            return '<span class="jsonpath-field">' + escapeHtml(part) + '</span>';
        } else if (part === '*') {
            return '<span class="jsonpath-wildcard">' + escapeHtml(part) + '</span>';
        } else {
            return '<span class="jsonpath-field">' + escapeHtml(part) + '</span>';
        }
    });

    html += colored.join('<span class="jsonpath-dot">.</span>');
    html += '</code>';

    return html;
}

/**
 * Build a [method] [serverUrl + path] URL bar as an HTML string.
 * Used in x-origin modals, workflow steps, and anywhere operation info is shown.
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} serverUrl - Resolved server base URL
 * @param {string} path - Operation path template
 * @param {string} [link] - Optional href to link the whole bar to an operation detail page
 */
function buildUrlBarHtml(method, serverUrl, path, link) {
    var methodClass = method.toLowerCase();
    var html = '<div class="operation-url-bar-inline">';
    if (link) html += '<a href="' + escapeHtml(link) + '" class="operation-url-bar-link">';
    html += '<span class="method method-' + methodClass + '">' + escapeHtml(method) + '</span>';
    html += '<code class="url-bar-text">';
    html += '<span class="url-server-part">' + escapeHtml(serverUrl) + '</span>';
    html += '<span class="url-path-part">' + escapeHtml(path) + '</span>';
    html += '</code>';
    if (link) html += '</a>';
    html += '</div>';
    return html;
}

// ============================================================================
// X-Origin Modal and Interactive Fetching
// ============================================================================

var currentXOriginModal = {
    opId: null,
    paramName: null,
    location: null
};

function openXOriginModal(opId, paramName, location) {
    console.log('openXOriginModal called with:', { opId, paramName, location });
    var inputId = 'param-' + opId + '-' + paramName;
    var input = document.getElementById(inputId);
    if (!input) {
        console.error('X-Origin modal: Could not find input element with ID:', inputId);
        return;
    }

    var originsJson = input.getAttribute('data-x-origins');
    if (!originsJson) {
        console.error('X-Origin modal: No data-x-origins attribute found on input:', inputId);
        return;
    }

    var origins = [];
    try {
        origins = JSON.parse(originsJson);
    } catch (e) {
        console.error('Failed to parse x-origins:', e);
        return;
    }

    currentXOriginModal = { opId: opId, paramName: paramName, location: location };

    var modal = document.getElementById('xorigin-modal');
    var title = document.getElementById('xorigin-modal-title');
    var body = document.getElementById('xorigin-modal-body');

    if (!modal || !title || !body) {
        console.error('X-Origin modal: Modal elements not found', { modal: !!modal, title: !!title, body: !!body });
        return;
    }

    title.textContent = 'Fetch values for: ' + paramName;

    // Get operation lookup for parameter details
    var opLookup = window.__OP_LOOKUP__ || {};

    // Build source selector dropdown and execute button
    var html = '<div class="xorigin-selector-container">';
    html += '<select id="xorigin-source-selector" class="xorigin-source-select" onchange="switchXOriginSource()">';

    origins.forEach(function(origin, idx) {
        var apiSlug = (origin.api || '').replace('urn:api:', '');
        var operationId = origin.operation || '';
        var name = origin.name;
        var technicalRef = apiSlug + '#' + operationId;

        var optionLabel = name ? (name + ' - ' + technicalRef) : technicalRef;
        html += '<option value="' + idx + '">' + escapeHtml(optionLabel) + '</option>';
    });

    html += '</select>';
    html += '<button class="btn-execute-xorigin" onclick="executeXOriginSource()">Execute</button>';
    html += '</div>';

    // Build source containers (hidden by default, first one visible)
    origins.forEach(function(origin, idx) {
        var apiSlug = (origin.api || '').replace('urn:api:', '');
        var operationId = origin.operation || '';

        html += '<div class="xorigin-source" data-source-idx="' + idx + '" style="display:' + (idx === 0 ? 'block' : 'none') + '">';

        // Get operation details for this source
        var apiEntry = opLookup[apiSlug];
        var opMeta = apiEntry ? apiEntry.ops[operationId] : null; 

        // Show operation URL bar and parameters
        if (opMeta) {
            var xoriginServerUrl = getServerForApi(apiSlug).replace(/\/$/, '');
            // Don't make the URL bar a link
            html += buildUrlBarHtml(opMeta.method, xoriginServerUrl, opMeta.path, null);

            // Add Information section
            html += '<details class="xorigin-info-section">';
            html += '<summary>Information</summary>';
            html += '<div class="xorigin-info-content">';

            // Operation ID with link
            html += '<div class="xorigin-info-item">';
            html += '<label>Operation ID:</label>';
            var linkPrefix = window.__API_LINK_PREFIX__ || '';
            html += '<a href="' + escapeHtml(linkPrefix + apiSlug + '.html#op-' + operationId) + '" target="_blank" class="xorigin-operation-link">';
            html += '<code>' + escapeHtml(operationId) + '</code>';
            html += '</a>';
            html += '</div>';

            // JSON Path for values
            if (origin.values) {
                html += '<div class="xorigin-info-item">';
                html += '<label>Values JSON Path:</label>';
                html += '<code class="xorigin-jsonpath">' + escapeHtml(origin.values) + '</code>';
                html += '</div>';
            }

            // JSON Path for labels (if exists)
            if (origin.labels) {
                html += '<div class="xorigin-info-item">';
                html += '<label>Labels JSON Path:</label>';
                html += '<code class="xorigin-jsonpath">' + escapeHtml(origin.labels) + '</code>';
                html += '</div>';
            }

            html += '</div>';
            html += '</details>';

            var params = opMeta.parameters || [];
            var envMap = getEnvVarsMap();

            // Group parameters by location
            var pathParams = params.filter(function(p) { return p.in === 'path'; });
            var queryParams = params.filter(function(p) { return p.in === 'query'; });
            var headerParams = params.filter(function(p) { return p.in === 'header'; });

            var paramGroups = [
                { location: 'path', label: 'Path Parameters', params: pathParams },
                { location: 'query', label: 'Query Parameters', params: queryParams },
                { location: 'header', label: 'Header Parameters', params: headerParams }
            ];

            paramGroups.forEach(function(group) {
                if (group.params.length > 0) {
                    // Check if any parameter is required
                    var hasRequired = group.params.some(function(p) { return p.required || false; });
                    html += '<details class="xorigin-params-section"' + (hasRequired ? ' open' : '') + '>';
                    html += '<summary>' + group.label + '</summary>';
                    html += '<div class="xorigin-params-content">';

                    group.params.forEach(function(param) {
                        var paramName = param.name || '';
                        var paramRequired = param.required || false;
                        var paramType = (param.schema && param.schema.type) ? param.schema.type : 'string';
                        var paramDefault = (param.schema && param.schema.default) ? param.schema.default : '';
                        var paramEnum = (param.schema && param.schema.enum) ? param.schema.enum : null;
                        var paramDescription = param.description || '';

                        // Pre-fill from environment variables
                        var value = envMap[paramName] || paramDefault;

                        html += '<div class="try-param-row">';
                        html += '<label>';
                        html += '<span class="param-name-wrapper">';
                        html += '<code>' + escapeHtml(paramName) + '</code>';
                        if (paramRequired) {
                            html += '&nbsp;<span class="param-required" aria-label="required" title="Required">*</span>';
                        }
                        html += '</span>';
                        if (paramDescription) {
                            html += '<span class="param-info-wrapper" data-tooltip="' + escapeHtml(paramDescription) + '">';
                            html += '<span class="param-info-icon" aria-label="more-info"></span>';
                            html += '</span>';
                        }
                        html += '</label>';

                        if (paramEnum) {
                            // Enum dropdown
                            html += '<select data-param="' + escapeHtml(paramName) + '" data-in="' + escapeHtml(group.location) + '"';
                            if (paramRequired) html += ' required';
                            html += '>';
                            paramEnum.forEach(function(enumVal) {
                                var selected = (String(enumVal) === String(value)) ? ' selected' : '';
                                html += '<option value="' + escapeHtml(String(enumVal)) + '"' + selected + '>' + escapeHtml(String(enumVal)) + '</option>';
                            });
                            html += '</select>';
                        } else {
                            // Text input
                            html += '<input type="text" ';
                            html += 'data-param="' + escapeHtml(paramName) + '" ';
                            html += 'data-in="' + escapeHtml(group.location) + '" ';
                            html += 'placeholder="' + escapeHtml(paramType) + '" ';
                            html += 'value="' + escapeHtml(String(value)) + '"';
                            if (paramRequired) html += ' required';
                            html += '>';
                        }

                        html += '</div>';
                    });

                    html += '</div>';
                    html += '</details>';
                }
            });

            // Add custom query parameters section
            html += '<details class="xorigin-params-section try-custom-params">';
            html += '<summary>Custom Query Parameters</summary>';
            html += '<div class="xorigin-params-content">';
            html += '<div id="custom-query-xorigin-' + idx + '" class="custom-params-container"></div>';
            html += '<button type="button" class="btn-add-custom-param" onclick="addCustomParamXOrigin(' + idx + ', \'query\')">+ Add Query Parameter</button>';
            html += '</div>';
            html += '</details>';

            // Add custom headers section
            html += '<details class="xorigin-params-section try-custom-params">';
            html += '<summary>Custom Headers</summary>';
            html += '<div class="xorigin-params-content">';
            html += '<div id="custom-header-xorigin-' + idx + '" class="custom-params-container"></div>';
            html += '<button type="button" class="btn-add-custom-param" onclick="addCustomParamXOrigin(' + idx + ', \'header\')">+ Add Header</button>';
            html += '</div>';
            html += '</details>';
        }

        html += '<div class="xorigin-result" id="xorigin-result-' + idx + '" style="display:none"></div>';
        html += '</div>';
    });

    body.innerHTML = html;
    modal.style.display = 'flex';
    // Focus trap: focus the first focusable element and store previous focus
    modal._previousFocus = document.activeElement;
    var firstFocusable = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
}

function closeXOriginModal() {
    var modal = document.getElementById('xorigin-modal');
    modal.style.display = 'none';
    // Restore focus to the element that opened the modal
    if (modal._previousFocus) modal._previousFocus.focus();
    currentXOriginModal = { opId: null, paramName: null, location: null };
}

function switchXOriginSource() {
    var selector = document.getElementById('xorigin-source-selector');
    if (!selector) return;

    var selectedIdx = parseInt(selector.value, 10);
    var allSources = document.querySelectorAll('.xorigin-source');

    allSources.forEach(function(source, idx) {
        source.style.display = (idx === selectedIdx) ? 'block' : 'none';
    });
}

async function executeXOriginSource(sourceIdx) {
    // If sourceIdx not provided, get it from the selector
    if (sourceIdx === undefined) {
        var selector = document.getElementById('xorigin-source-selector');
        if (selector) {
            sourceIdx = parseInt(selector.value, 10);
        } else {
            sourceIdx = 0;
        }
    }

    var btn = document.querySelector('.xorigin-selector-container .btn-execute-xorigin');
    var resultDiv = document.getElementById('xorigin-result-' + sourceIdx);

    if (!btn || !resultDiv) {
        console.error('Execute button or result div not found', { btn: !!btn, resultDiv: !!resultDiv, sourceIdx: sourceIdx });
        return;
    }

    // Get the origin configuration
    var input = document.getElementById('param-' + currentXOriginModal.opId + '-' + currentXOriginModal.paramName);
    var originsJson = input.getAttribute('data-x-origins');
    var origins = JSON.parse(originsJson);
    var origin = origins[sourceIdx];

    // Check authentication
    var token = sessionStorage.getItem('anypoint_token');
    if (!token) {
        resultDiv.innerHTML = '<div class="xorigin-error">Please authenticate first.</div>';
        resultDiv.style.display = 'block';
        return;
    }
    if (isTokenExpired()) {
        resultDiv.innerHTML = '<div class="xorigin-error">Token expired. Please re-authenticate.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    var apiSlug = (origin.api || '').replace('urn:api:', '');
    var operationId = origin.operation || '';
    var valuesPath = origin.values || '';
    var labelsPath = origin.labels || '';

    // Get operation metadata
    var opLookup = window.__OP_LOOKUP__ || {};
    var apiEntry = opLookup[apiSlug];
    if (!apiEntry) {
        resultDiv.innerHTML = '<div class="xorigin-error">API "' + escapeHtml(apiSlug) + '" not found.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    var opMeta = apiEntry.ops[operationId];
    if (!opMeta) {
        resultDiv.innerHTML = '<div class="xorigin-error">Operation "' + escapeHtml(operationId) + '" not found.</div>';
        resultDiv.style.display = 'block';
        return;
    }

    var method = opMeta.method;
    var pathTemplate = opMeta.path;

    // Collect parameters from input fields in the modal
    var sourceDiv = document.querySelector('.xorigin-source[data-source-idx="' + sourceIdx + '"]');
    var paramInputs = sourceDiv.querySelectorAll('input[data-param], select[data-param]');

    var paramsByLocation = { path: {}, query: {}, header: {} };
    var missingParams = [];

    paramInputs.forEach(function(input) {
        var paramName = input.getAttribute('data-param');
        var paramIn = input.getAttribute('data-in');
        var value = input.value;

        if (value) {
            paramsByLocation[paramIn][paramName] = value;
        } else if (input.hasAttribute('required')) {
            missingParams.push(paramName);
        }
    });

    if (missingParams.length > 0) {
        resultDiv.innerHTML = '<div class="xorigin-error">Missing required parameters: ' + escapeHtml(missingParams.join(', ')) + '</div>';
        resultDiv.style.display = 'block';
        return;
    }

    // Build URL - substitute path parameters
    var path = pathTemplate;
    for (var paramName in paramsByLocation.path) {
        var value = paramsByLocation.path[paramName];
        path = path.replace('{' + paramName + '}', encodeURIComponent(value));
    }

    // Check for any remaining unsubstituted path parameters
    var unresolvedParams = (path.match(/\{([^}]+)\}/g) || []);
    if (unresolvedParams.length > 0) {
        resultDiv.innerHTML = '<div class="xorigin-error">Missing path parameters: ' + escapeHtml(unresolvedParams.join(', ')) + '</div>';
        resultDiv.style.display = 'block';
        return;
    }

    // Build query string
    var queryParts = [];
    for (var paramName in paramsByLocation.query) {
        queryParts.push(encodeURIComponent(paramName) + '=' + encodeURIComponent(paramsByLocation.query[paramName]));
    }
    if (queryParts.length > 0) {
        path += '?' + queryParts.join('&');
    }

    // Get server URL for the target API
    var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
    var fullUrl = serverUrl + path;

    // Update button state
    btn.disabled = true;
    var originalText = btn.textContent;
    btn.textContent = 'Executing...';

    try {
        // Build headers including auth headers and parameter headers
        var headers = Object.assign(
            {'Content-Type': 'application/json'},
            getAuthHeaders(),
            paramsByLocation.header
        );

        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: method,
                url: fullUrl,
                headers: headers,
                body: null
            })
        });

        var data = await resp.json();

        btn.disabled = false;
        btn.textContent = originalText;

        if (data.error) {
            resultDiv.innerHTML = '<div class="xorigin-error">Error: ' + escapeHtml(data.error) + '</div>';
            resultDiv.style.display = 'block';
            return;
        }

        if (data.status < 200 || data.status >= 300) {
            resultDiv.innerHTML = '<div class="xorigin-error">Request returned status ' + data.status + '</div>';
            resultDiv.style.display = 'block';
            return;
        }

        // Parse response body
        var body = null;
        try {
            body = JSON.parse(data.body || '{}');
        } catch (e) {
            resultDiv.innerHTML = '<div class="xorigin-error">Response is not valid JSON</div>';
            resultDiv.style.display = 'block';
            return;
        }

        // Extract values and labels using paths
        var values = extractXOriginValues(body, valuesPath);
        var labels = [];
        if (labelsPath) {
            labels = extractXOriginValues(body, labelsPath);
            if (labels.length !== values.length) {
                console.warn('Labels count mismatch: ' + labels.length + ' labels vs ' + values.length + ' values.');
                labels = [];
            }
        }

        // Build result HTML with tabs
        var html = '<div class="xorigin-result-header">';
        html += '<h5>Results</h5>';
        html += '</div>';

        // Tabs
        html += '<div class="xorigin-result-tabs">';
        html += '<button class="xorigin-tab-btn active" onclick="switchXOriginTab(' + sourceIdx + ', \'values\')">Values (' + values.length + ')</button>';
        html += '<button class="xorigin-tab-btn" onclick="switchXOriginTab(' + sourceIdx + ', \'body\')">Response Body</button>';
        html += '<button class="xorigin-tab-btn" onclick="switchXOriginTab(' + sourceIdx + ', \'headers\')">Response Headers</button>';
        html += '</div>';

        // Tab content container
        html += '<div class="xorigin-tab-content">';

        // Values tab
        if (values.length === 0) {
            html += '<div class="xorigin-tab-panel active" id="xorigin-tab-values-' + sourceIdx + '">';
            html += '<div class="xorigin-error">No values found at path: ' + escapeHtml(valuesPath) + '</div>';
            html += '</div>';
        } else {
            html += '<div class="xorigin-tab-panel active" id="xorigin-tab-values-' + sourceIdx + '">';
            html += '<div class="xorigin-values-list">';
            values.forEach(function(val, valIdx) {
                var valueStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                var labelStr = labels[valIdx] ? String(labels[valIdx]) : valueStr;

                html += '<div class="xorigin-value-item">';
                // Show label if different from value
                if (labels[valIdx] && labelStr !== valueStr) {
                    html += '<div class="xorigin-value-label">' + escapeHtml(labelStr) + '</div>';
                    html += '<code class="xorigin-value-id">' + escapeHtml(valueStr) + '</code>';
                } else {
                    html += '<code>' + escapeHtml(valueStr) + '</code>';
                }
                html += '<button class="btn-use-value" onclick="useXOriginValue(' + sourceIdx + ', ' + valIdx + ')">Use</button>';
                html += '</div>';
            });
            html += '</div>';
            html += '</div>';
        }

        // Response body tab
        html += '<div class="xorigin-tab-panel" id="xorigin-tab-body-' + sourceIdx + '">';
        html += '<div class="xorigin-response-body" id="xorigin-respbody-' + sourceIdx + '"></div>';
        html += '</div>';

        // Response headers tab
        html += '<div class="xorigin-tab-panel" id="xorigin-tab-headers-' + sourceIdx + '">';
        html += '<div class="xorigin-response-headers" id="xorigin-respheaders-' + sourceIdx + '"></div>';
        html += '</div>';

        html += '</div>'; // End tab content

        resultDiv.innerHTML = html;
        resultDiv.style.display = 'block';

        // Store values for later use
        resultDiv.dataset.values = JSON.stringify(values);

        // Create Ace editors for response body and headers
        var responseBodyDiv = document.getElementById('xorigin-respbody-' + sourceIdx);
        var responseHeadersDiv = document.getElementById('xorigin-respheaders-' + sourceIdx);
        displayResponseInAceEditors(responseBodyDiv, responseHeadersDiv, data);

    } catch (e) {
        btn.disabled = false;
        btn.textContent = originalText;
        resultDiv.innerHTML = '<div class="xorigin-error">Cannot reach proxy: ' + escapeHtml(e.message) + '</div>';
        resultDiv.style.display = 'block';
    }
}

function useXOriginValue(sourceIdx, valueIdx) {
    var resultDiv = document.getElementById('xorigin-result-' + sourceIdx);
    var values = JSON.parse(resultDiv.dataset.values || '[]');
    var value = values[valueIdx];

    if (value === undefined) return;

    var displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    var paramName = currentXOriginModal.paramName;

    // Set the value in the input
    var input = document.getElementById('param-' + currentXOriginModal.opId + '-' + paramName);
    if (input) {
        input.value = displayVal;
    }

    // Add or update environment variable
    var vars = loadEnvVars();
    var existingVar = vars.find(function(v) { return v.name === paramName; });

    if (existingVar) {
        // Update existing variable
        existingVar.value = displayVal;
    } else {
        // Add new variable
        vars.push({ name: paramName, value: displayVal });
    }

    // Save and re-render environment variables
    sessionStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(vars));
    renderEnvVars();

    // Close modal
    closeXOriginModal();

    // Show feedback
    showAuthMessage('Value set for ' + paramName + ': ' + displayVal + ' (added to environment variables)', false);
}

function switchXOriginTab(sourceIdx, tabName) {
    var source = document.querySelector('.xorigin-source[data-source-idx="' + sourceIdx + '"]');
    if (!source) return;

    // Update tab buttons
    var tabButtons = source.querySelectorAll('.xorigin-tab-btn');
    tabButtons.forEach(function(btn) {
        btn.classList.remove('active');
    });
    var activeButton = Array.from(tabButtons).find(function(btn) {
        return btn.textContent.toLowerCase().startsWith(tabName.toLowerCase());
    });
    if (activeButton) activeButton.classList.add('active');

    // Update tab panels
    var panels = source.querySelectorAll('.xorigin-tab-panel');
    panels.forEach(function(panel) {
        panel.classList.remove('active');
    });
    var activePanel = document.getElementById('xorigin-tab-' + tabName + '-' + sourceIdx);
    if (activePanel) activePanel.classList.add('active');
}

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ============================================================================
// X-Origin configurations for common global parameters
// ============================================================================

var GLOBAL_PARAM_X_ORIGIN = {};

// ============================================================================
// Filter APIs by category
// ============================================================================

// ============================================================================
// Tag-based Search System
// ============================================================================

var selectedTags = [];
var availableTags = [];
var currentSuggestionIndex = -1;

function buildAvailableTags() {
    const tagSet = new Set();
    const cardLinks = document.querySelectorAll('.catalog-card-link');

    cardLinks.forEach(cardLink => {
        // Add name
        const name = cardLink.dataset.name || '';
        if (name) tagSet.add(name.toLowerCase());

        // Add category
        const category = cardLink.dataset.category || '';
        if (category) tagSet.add(category.toLowerCase());

        // Add type
        const type = cardLink.dataset.type || '';
        if (type) {
            tagSet.add(type.toLowerCase());
            // Also add variations
            if (type === 'api') tagSet.add('rest api');
        }

        // Extract individual words from name
        name.split(/\s+/).forEach(word => {
            if (word.length > 2) tagSet.add(word.toLowerCase());
        });

        // Extract individual words from category
        category.split(/\s+/).forEach(word => {
            if (word.length > 2) tagSet.add(word.toLowerCase());
        });
    });

    availableTags = Array.from(tagSet).sort();
}

function showTagSuggestions(query) {
    const suggestionsDiv = document.getElementById('tagSuggestions');
    if (!suggestionsDiv) return;

    if (!query || query.length < 1) {
        suggestionsDiv.style.display = 'none';
        currentSuggestionIndex = -1;
        return;
    }

    const lowerQuery = query.toLowerCase();
    const matches = availableTags.filter(tag =>
        tag.includes(lowerQuery) && !selectedTags.includes(tag)
    ).slice(0, 10);

    if (matches.length === 0) {
        suggestionsDiv.style.display = 'none';
        currentSuggestionIndex = -1;
        return;
    }

    let html = '';
    matches.forEach((tag, index) => {
        const activeClass = index === currentSuggestionIndex ? 'active' : '';
        html += '<div class="tag-suggestion-item ' + activeClass + '" data-tag="' + escapeHtml(tag) + '">' + escapeHtml(tag) + '</div>';
    });

    suggestionsDiv.innerHTML = html;
    suggestionsDiv.style.display = 'block';

    // Add click handlers
    suggestionsDiv.querySelectorAll('.tag-suggestion-item').forEach((item, index) => {
        item.addEventListener('click', function() {
            addTag(item.dataset.tag);
        });
    });
}

function addTag(tag) {
    if (!tag || selectedTags.includes(tag.toLowerCase())) return;

    const normalizedTag = tag.toLowerCase();
    selectedTags.push(normalizedTag);
    renderSelectedTags();
    filterByTags();

    // Clear input
    const input = document.getElementById('tagSearchInput');
    if (input) {
        input.value = '';
        input.focus();
    }

    // Hide suggestions
    const suggestionsDiv = document.getElementById('tagSuggestions');
    if (suggestionsDiv) {
        suggestionsDiv.style.display = 'none';
    }
    currentSuggestionIndex = -1;
}

function removeTag(tag) {
    selectedTags = selectedTags.filter(t => t !== tag);
    renderSelectedTags();
    filterByTags();
}

function renderSelectedTags() {
    const container = document.getElementById('selectedTags');
    if (!container) return;

    if (selectedTags.length === 0) {
        container.innerHTML = '';
        updatePlaceholder();
        return;
    }

    let html = '';
    selectedTags.forEach(tag => {
        html += '<div class="tag-chip">';
        html += '<span>' + escapeHtml(tag) + '</span>';
        html += '<button class="tag-chip-remove" onclick="removeTag(\'' + escapeHtml(tag) + '\')" aria-label="Remove tag">&times;</button>';
        html += '</div>';
    });

    container.innerHTML = html;
    updatePlaceholder();
}

function updatePlaceholder() {
    const input = document.getElementById('tagSearchInput');
    if (!input) return;

    if (selectedTags.length > 0) {
        input.placeholder = '';
    } else {
        input.placeholder = 'Search by keywords...';
    }
}

function filterByTags() {
    const cardLinks = document.querySelectorAll('.catalog-card-link');
    const activeTab = document.querySelector('.hero-tab.active');
    const selectedType = activeTab ? activeTab.dataset.filter : 'all';

    let visibleApis = 0;
    let visibleSkills = 0;

    cardLinks.forEach(cardLink => {
        const name = (cardLink.dataset.name || '').toLowerCase();
        const category = (cardLink.dataset.category || '').toLowerCase();
        const type = (cardLink.dataset.type || '').toLowerCase();

        // Check type filter
        const matchesType = selectedType === 'all' || type === selectedType;

        // Check tag filter
        let matchesTags = true;
        if (selectedTags.length > 0) {
            const searchableText = name + ' ' + category + ' ' + type;
            matchesTags = selectedTags.some(tag => searchableText.includes(tag));
        }

        // Show if matches both type AND tags (or no tags selected)
        if (matchesType && matchesTags) {
            cardLink.style.display = '';
            // Count visible items by type
            if (type === 'api') {
                visibleApis++;
            } else if (type === 'skill') {
                visibleSkills++;
            }
        } else {
            cardLink.style.display = 'none';
        }
    });

    // Update results count and type
    updateResultsCount(visibleApis + visibleSkills, selectedType);
}

function updateResultsCount(count, filterType) {
    const resultsCount = document.getElementById('resultsCount');
    const resultsType = document.getElementById('resultsType');

    if (resultsCount) {
        resultsCount.textContent = count;
    }

    if (resultsType) {
        if (filterType === 'api') {
            resultsType.textContent = 'APIs';
        } else if (filterType === 'skill') {
            resultsType.textContent = 'Skills';
        } else {
            resultsType.textContent = 'All';
        }
    }
}


// ============================================================================
// Toggle between grid and list view
// ============================================================================

function toggleView(viewMode) {
    const catalogGrids = document.querySelectorAll('.catalog-grid');
    const viewButtons = document.querySelectorAll('.view-toggle-btn');

    if (catalogGrids.length === 0) return;

    // Update active button
    viewButtons.forEach(btn => {
        if (btn.dataset.view === viewMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Toggle view class on all catalog grids
    catalogGrids.forEach(grid => {
        if (viewMode === 'list') {
            grid.classList.add('list-view');
        } else {
            grid.classList.remove('list-view');
        }
    });

    // Store preference
    try {
        localStorage.setItem('catalogViewMode', viewMode);
    } catch (e) {
        // Ignore localStorage errors
    }
}

// ============================================================================
// Search operations
// ============================================================================

function searchOperations(query) {
    const operations = document.querySelectorAll('.operation');
    const lowerQuery = query.toLowerCase();

    operations.forEach(op => {
        const text = op.textContent.toLowerCase();
        if (text.includes(lowerQuery)) {
            op.style.display = 'block';
        } else {
            op.style.display = 'none';
        }
    });
}

// ============================================================================
// Initialize
// ============================================================================

// ============================================================================
// Navigate to a hash target (shared logic for all navigation)
// ============================================================================

function navigateToHash(hash, smooth) {
    if (!hash || hash === '#') return false;

    const targetId = hash.substring(1);
    const targetElement = document.getElementById(targetId);
    if (!targetElement) return false;

    const placeholder = document.getElementById('operations-placeholder');
    const overview = document.getElementById('overview');

    // Hide placeholder
    if (placeholder) placeholder.style.display = 'none';

    // Hide all operations
    document.querySelectorAll('.operation-detail').forEach(op => op.classList.remove('active'));

    // Hide overview
    if (overview) overview.style.display = 'none';

    // Show the target
    if (targetId.startsWith('op-')) {
        targetElement.classList.add('active');
        applyEnvVarsToPanel('try-' + targetId.substring(3));
    } else if (targetId === 'overview' || targetId === 'main-content') {
        if (overview) overview.style.display = 'block';
        if (placeholder) placeholder.style.display = 'block';
    }

    targetElement.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });

    // Update sidebar active state
    const navLinks = document.querySelectorAll('.nav-link');
    const navLink = document.querySelector('.nav-link[href="' + hash + '"]');
    if (navLink) {
        navLinks.forEach(l => l.classList.remove('active'));
        navLink.classList.add('active');
    }

    return true;
}

function updateSuggestionHighlight(items) {
    items.forEach((item, index) => {
        if (index === currentSuggestionIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Close modal on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var modal = document.getElementById('xorigin-modal');
            if (modal && modal.style.display !== 'none') {
                closeXOriginModal();
            }
        }
    });

    // Build available tags from catalog
    buildAvailableTags();

    // Set up hero tabs for filtering
    const heroTabs = document.querySelectorAll('.hero-tab');
    heroTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            heroTabs.forEach(t => t.classList.remove('active'));
            // Add active class to clicked tab
            tab.classList.add('active');
            // Filter catalog
            filterByTags();
        });
    });

    // Set up tag search input
    const tagSearchInput = document.getElementById('tagSearchInput');
    const tagSearchContainer = document.getElementById('tagSearchInputContainer');

    if (tagSearchInput && tagSearchContainer) {
        // Click on container focuses input
        tagSearchContainer.addEventListener('click', (e) => {
            if (e.target !== tagSearchInput && !e.target.closest('.tag-chip-remove')) {
                tagSearchInput.focus();
            }
        });

        // Input event for suggestions
        tagSearchInput.addEventListener('input', (e) => {
            showTagSuggestions(e.target.value);
            updatePlaceholder();
        });

        // Keyboard navigation
        tagSearchInput.addEventListener('keydown', (e) => {
            const suggestionsDiv = document.getElementById('tagSuggestions');

            // Handle backspace to delete last tag when input is empty
            if (e.key === 'Backspace' && e.target.value === '' && selectedTags.length > 0) {
                e.preventDefault();
                removeTag(selectedTags[selectedTags.length - 1]);
                return;
            }

            if (!suggestionsDiv || suggestionsDiv.style.display === 'none') {
                return;
            }

            const items = suggestionsDiv.querySelectorAll('.tag-suggestion-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentSuggestionIndex = Math.min(currentSuggestionIndex + 1, items.length - 1);
                updateSuggestionHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentSuggestionIndex = Math.max(currentSuggestionIndex - 1, -1);
                updateSuggestionHighlight(items);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentSuggestionIndex >= 0 && items[currentSuggestionIndex]) {
                    addTag(items[currentSuggestionIndex].dataset.tag);
                } else if (e.target.value.trim()) {
                    // Add current input as tag
                    addTag(e.target.value.trim());
                }
            } else if (e.key === 'Escape') {
                suggestionsDiv.style.display = 'none';
                currentSuggestionIndex = -1;
            }
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', function(e) {
            const suggestionsDiv = document.getElementById('tagSuggestions');
            const wrapper = tagSearchInput.closest('.tag-search-wrapper');
            if (suggestionsDiv && wrapper && !wrapper.contains(e.target)) {
                suggestionsDiv.style.display = 'none';
                currentSuggestionIndex = -1;
            }
        });
    }

    // Set up view toggle buttons
    const viewToggleButtons = document.querySelectorAll('.view-toggle-btn');
    viewToggleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const viewMode = e.currentTarget.dataset.view;
            toggleView(viewMode);
        });
    });

    // Restore saved view preference
    try {
        const savedView = localStorage.getItem('catalogViewMode');
        if (savedView && (savedView === 'list' || savedView === 'grid')) {
            toggleView(savedView);
        }
    } catch (e) {
        // Ignore localStorage errors
    }

    // Set up operation search (for detail pages)
    const searchInput = document.getElementById('searchOperations');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchOperations(e.target.value);
        });
    }

    // Sidebar navigation (for detail pages)
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                if (navigateToHash(href, true)) {
                    history.pushState(null, null, href);
                }
            }
        });
    });

    // Highlight active section on scroll (detail pages)
    const detailContent = document.getElementById('main-content');
    if (detailContent) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.id;
                    if (!id.startsWith('op-') || entry.target.classList.contains('active')) {
                        const link = document.querySelector('.nav-link[href="#' + id + '"]');
                        if (link && !id.startsWith('op-')) {
                            navLinks.forEach(l => l.classList.remove('active'));
                            link.classList.add('active');
                        }
                    }
                }
            });
        }, {
            threshold: 0.2,
            rootMargin: '-100px 0px -50% 0px'
        });

        document.querySelectorAll('.content-section:not(.operation-detail)').forEach(section => {
            observer.observe(section);
        });
    }

    // Handle in-page links to operations/skills (e.g., from skill step "API Call" links)
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a');
        if (!anchor || anchor.classList.contains('nav-link')) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        // Extract hash from href (handles both "#op-..." and "same-page.html#op-...")
        let hash = '';
        if (href.startsWith('#')) {
            hash = href;
        } else if (href.includes('#')) {
            const [filePart, fragment] = href.split('#', 2);
            const currentFile = window.location.pathname.split('/').pop() || 'index.html';
            if (filePart === currentFile || filePart === '') {
                hash = '#' + fragment;
            } else {
                return; // Different page, let normal navigation happen
            }
        } else {
            return;
        }

        if (!hash.startsWith('#op-') && !hash.startsWith('#skill-')) return;

        e.preventDefault();
        if (navigateToHash(hash, true)) {
            history.pushState(null, null, hash);
        }
    });

    // Handle back/forward browser navigation
    window.addEventListener('popstate', () => {
        const hash = window.location.hash;
        if (hash) {
            navigateToHash(hash, false);
        } else {
            // No hash — show overview (default state)
            navigateToHash('#overview', false);
        }
    });

    // Handle hash on initial page load
    if (window.location.hash) {
        setTimeout(() => {
            navigateToHash(window.location.hash, true);
        }, 100);
    }
});

// ============================================================================
// Sidebar Search/Filter
// ============================================================================

function clearSidebarSearch() {
    var input = document.getElementById('sidebarSearch');
    if (input) {
        input.value = '';
        filterSidebar('');
    }
}

// ============================================================================
// Sidebar tabs
// ============================================================================

function switchSidebarTab(tabName) {
    // Update tab buttons
    var tabs = document.querySelectorAll('.sidebar-tab');
    tabs.forEach(function(tab) {
        var isActive = tab.getAttribute('data-tab') === tabName;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', isActive);
    });

    // Update tab panels
    var panels = document.querySelectorAll('.sidebar-panel');
    panels.forEach(function(panel) {
        var isActive = panel.id === tabName + '-panel';
        panel.classList.toggle('active', isActive);
        if (isActive) {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    });
}

// Helper function to highlight text matches
function highlightText(text, query) {
    if (!query) return text;

    var lowerText = text.toLowerCase();
    var lowerQuery = query.toLowerCase();
    var index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    var before = text.substring(0, index);
    var match = text.substring(index, index + query.length);
    var after = text.substring(index + query.length);

    return before + '<span class="search-highlight">' + match + '</span>' + highlightText(after, query);
}

function filterSidebar(query) {
    var lowerQuery = query.toLowerCase();
    var clearBtn = document.querySelector('.btn-clear-sidebar-search');

    // Show/hide clear button
    if (clearBtn) {
        clearBtn.style.display = query ? 'block' : 'none';
    }

    // Count visible items
    var visibleOperationsCount = 0;
    var visibleSkillsCount = 0;

    // Filter operations - match by method, path, summary, or description
    var operationLinks = document.querySelectorAll('.nav-operation');

    operationLinks.forEach(function(link) {
        var method = link.querySelector('.method-badge')?.textContent.toLowerCase() || '';
        var summaryElement = link.querySelector('.op-summary-only, .op-name');
        var summaryText = summaryElement?.textContent || '';
        var title = link.getAttribute('title') || '';
        var titleLines = title.toLowerCase().split('\n');
        var path = titleLines[0] || '';
        var description = titleLines[1] || '';

        var matches = !query ||
                      method.includes(lowerQuery) ||
                      summaryText.toLowerCase().includes(lowerQuery) ||
                      path.includes(lowerQuery) ||
                      description.includes(lowerQuery);

        var listItem = link.closest('li');
        if (listItem) {
            listItem.style.display = matches ? 'block' : 'none';
            if (matches) visibleOperationsCount++;
        }

        // Apply highlighting to summary if searching
        if (summaryElement) {
            if (!summaryElement.hasAttribute('data-original-text')) {
                summaryElement.setAttribute('data-original-text', summaryText);
            }
            if (query && matches && summaryText.toLowerCase().includes(lowerQuery)) {
                summaryElement.innerHTML = highlightText(summaryText, query);
            } else {
                summaryElement.textContent = summaryElement.getAttribute('data-original-text') || summaryText;
            }
        }
    });

    // Filter skill steps
    var stepLinks = document.querySelectorAll('.nav-skill-step');

    stepLinks.forEach(function(link) {
        var titleElement = link.querySelector('.step-title-short');
        var titleText = titleElement?.textContent || '';
        var fullTitle = link.getAttribute('title') || '';
        var matches = !query ||
                      titleText.toLowerCase().includes(lowerQuery) ||
                      fullTitle.toLowerCase().includes(lowerQuery);

        var listItem = link.closest('li');
        if (listItem) {
            listItem.style.display = matches ? 'block' : 'none';
            if (matches) visibleSkillsCount++;
        }

        // Apply highlighting to title if searching
        if (titleElement) {
            if (!titleElement.hasAttribute('data-original-text')) {
                titleElement.setAttribute('data-original-text', titleText);
            }
            if (query && matches && titleText.toLowerCase().includes(lowerQuery)) {
                titleElement.innerHTML = highlightText(titleText, query);
            } else {
                titleElement.textContent = titleElement.getAttribute('data-original-text') || titleText;
            }
        }
    });

    // Filter skills in skills panel
    var skillLinks = document.querySelectorAll('#skills-panel .nav-operation-flat');

    skillLinks.forEach(function(link) {
        var nameElement = link.querySelector('.op-name');
        var nameText = nameElement?.textContent || '';
        var matches = !query || nameText.toLowerCase().includes(lowerQuery);

        var listItem = link.closest('li');
        if (listItem) {
            listItem.style.display = matches ? 'block' : 'none';
            if (matches) visibleSkillsCount++;
        }

        if (nameElement) {
            if (!nameElement.hasAttribute('data-original-text')) {
                nameElement.setAttribute('data-original-text', nameText);
            }
            if (query && matches && nameText.toLowerCase().includes(lowerQuery)) {
                nameElement.innerHTML = highlightText(nameText, query);
            } else {
                nameElement.textContent = nameElement.getAttribute('data-original-text') || nameText;
            }
        }
    });

    // Show/hide groups based on visible children
    var operationGroups = document.querySelectorAll('.nav-group');
    operationGroups.forEach(function(group) {
        var groupItems = group.querySelectorAll('.nav-group-items li');
        var hasVisible = false;

        groupItems.forEach(function(item) {
            if (item.style.display !== 'none') {
                hasVisible = true;
            }
        });

        // Show group if it has visible children
        group.style.display = hasVisible ? 'block' : 'none';

        // Auto-expand groups when searching
        if (query && hasVisible) {
            var groupId = group.querySelector('.nav-group-header')?.getAttribute('onclick')?.match(/toggleGroup\('([^']+)'\)/)?.[1];
            if (groupId) {
                var groupItemsContainer = document.getElementById('group-' + groupId);
                var toggle = document.getElementById('toggle-' + groupId);
                if (groupItemsContainer && toggle) {
                    groupItemsContainer.style.display = 'block';
                    toggle.classList.add('expanded');
                }
            }
        }

        // Apply highlighting to group names if searching
        var groupNameElement = group.querySelector('.group-name');
        if (groupNameElement) {
            var groupNameText = groupNameElement.textContent;
            if (!groupNameElement.hasAttribute('data-original-text')) {
                groupNameElement.setAttribute('data-original-text', groupNameText);
            }
            if (query && groupNameText.toLowerCase().includes(lowerQuery)) {
                groupNameElement.innerHTML = highlightText(groupNameText, query);
            } else {
                groupNameElement.textContent = groupNameElement.getAttribute('data-original-text') || groupNameText;
            }
        }
    });

    // Update tab counts - only show when searching
    var skillsCountEl = document.getElementById('skills-count');
    var operationsCountEl = document.getElementById('operations-count');

    if (query) {
        // Show filtered counts when searching
        if (skillsCountEl) {
            skillsCountEl.textContent = '(' + visibleSkillsCount + ')';
            skillsCountEl.style.display = 'inline';
        }
        if (operationsCountEl) {
            operationsCountEl.textContent = '(' + visibleOperationsCount + ')';
            operationsCountEl.style.display = 'inline';
        }
    } else {
        // Hide counts when not searching
        if (skillsCountEl) {
            skillsCountEl.style.display = 'none';
        }
        if (operationsCountEl) {
            operationsCountEl.style.display = 'none';
        }
    }
}

// ============================================================================
// Collapsible sidebar groups
// ============================================================================

function toggleGroup(groupId) {
    const group = document.getElementById('group-' + groupId);
    const toggle = document.getElementById('toggle-' + groupId);
    const header = toggle ? toggle.closest('.nav-group-header') : null;

    if (group && toggle) {
        var expanded = group.style.display === 'none' || group.style.display === '';
        group.style.display = expanded ? 'block' : 'none';
        toggle.classList.toggle('expanded', expanded);
        if (header) header.setAttribute('aria-expanded', expanded);
    }
}

function expandAllGroups() {
    document.querySelectorAll('.nav-group-items').forEach(group => {
        group.style.display = 'block';
    });
    document.querySelectorAll('.group-toggle').forEach(toggle => {
        toggle.classList.add('expanded');
    });
    document.querySelectorAll('.nav-group-header[aria-expanded]').forEach(h => {
        h.setAttribute('aria-expanded', 'true');
    });
}

function collapseAllGroups() {
    document.querySelectorAll('.nav-group-items').forEach(group => {
        group.style.display = 'none';
    });
    document.querySelectorAll('.group-toggle').forEach(toggle => {
        toggle.classList.remove('expanded');
    });
    document.querySelectorAll('.nav-group-header[aria-expanded]').forEach(h => {
        h.setAttribute('aria-expanded', 'false');
    });
}

// ============================================================================
// Collapsible skills
// ============================================================================

function switchSkillView(slug, view) {
    var structured = document.getElementById('structured-' + slug);
    var markdown = document.getElementById('markdown-' + slug);
    var section = structured ? structured.closest('.skill-detail') : null;
    if (!section) return;
    var tabs = section.querySelectorAll('.skill-tab');

    if (view === 'markdown') {
        structured.style.display = 'none';
        markdown.style.display = 'block';
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
    } else {
        structured.style.display = 'block';
        markdown.style.display = 'none';
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
    }
}

function toggleSkill(skillId) {
    const content = document.getElementById('content-skill-' + skillId);
    const toggle = document.getElementById('toggle-skill-' + skillId);

    if (content && toggle) {
        if (content.style.display === 'none' || content.style.display === '') {
            content.style.display = 'block';
            toggle.textContent = '▲';
        } else {
            content.style.display = 'none';
            toggle.textContent = '▼';
        }
    }
}

// ============================================================================
// Try It Out — Authentication
// ============================================================================

// Proxy URL can be configured via window.__PROXY_CONFIG__ or defaults to localhost:8080
var PROXY_URL = (window.__PROXY_CONFIG__ && window.__PROXY_CONFIG__.url) || 'http://localhost:8080/proxy';

function openAuthModal() {
    var modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'flex';
    // Focus trap: focus the first focusable element
    modal._previousFocus = document.activeElement;
    var firstFocusable = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
}

function closeAuthModal() {
    var modal = document.getElementById('authModal');
    if (!modal) return;
    modal.style.display = 'none';
    // Restore focus to the element that opened the modal
    if (modal._previousFocus) modal._previousFocus.focus();
}

function isTokenExpired() {
    var token = sessionStorage.getItem('anypoint_token');
    if (!token) return true;

    var expiresAt = sessionStorage.getItem('anypoint_token_expires_at');
    if (!expiresAt) return false; // If no expiration info, assume valid

    var now = Date.now();
    return now >= parseInt(expiresAt, 10);
}

function updateAuthSummary() {
    var token = sessionStorage.getItem('anypoint_token');
    var authMethod = sessionStorage.getItem('anypoint_auth_method') || '';
    var identity = sessionStorage.getItem('anypoint_identity') || '';
    var expired = isTokenExpired();

    // Auth status dot + text + container state
    var dot = document.getElementById('authStatusDot');
    var statusText = document.getElementById('authStatusText');
    var statusContainer = document.getElementById('authStatusContainer');
    var lockIcon = document.getElementById('authLockIcon');

    if (dot) {
        // Extract base path from current src (e.g., "assets/icons" or "../assets/icons")
        var basePath = dot.src.substring(0, dot.src.lastIndexOf('/'));
        if (token && !expired) {
            dot.src = basePath + '/status-dot-green.svg';
        } else if (token && expired) {
            dot.src = basePath + '/status-dot-amber.svg';
        } else {
            dot.src = basePath + '/status-dot-red.svg';
        }
    }

    if (lockIcon) {
        // Extract base path from current src
        var basePath = lockIcon.src.substring(0, lockIcon.src.lastIndexOf('/'));
        if (token && !expired) {
            lockIcon.src = basePath + '/lock-green.svg';
        } else if (token && expired) {
            lockIcon.src = basePath + '/lock-amber.svg';
        } else {
            lockIcon.src = basePath + '/lock-red.svg';
        }
    }

    if (statusText) {
        if (token && expired) {
            statusText.textContent = 'Token Expired';
        } else if (token) {
            statusText.textContent = 'Authenticated';
        } else {
            statusText.textContent = 'Not authenticated';
        }
    }

    if (statusContainer) {
        if (token && !expired) {
            statusContainer.classList.add('authenticated');
            statusContainer.classList.remove('not-authenticated', 'expired');
        } else if (token && expired) {
            statusContainer.classList.add('expired');
            statusContainer.classList.remove('authenticated', 'not-authenticated');
        } else {
            statusContainer.classList.add('not-authenticated');
            statusContainer.classList.remove('authenticated', 'expired');
        }
    }

    // User section (show only when authenticated)
    var userSection = document.getElementById('authUserSection');
    var userText = document.getElementById('authUserText');
    var infoSeparator = document.getElementById('authInfoSeparator');
    if (userSection && userText) {
        if (token && !expired && identity) {
            userText.textContent = identity;
            userSection.style.display = '';
            if (infoSeparator) infoSeparator.style.display = '';
        } else {
            userSection.style.display = 'none';
            if (infoSeparator) infoSeparator.style.display = 'none';
        }
    }

    // Auth method
    var methodItem = document.getElementById('authSummaryMethod');
    var methodText = document.getElementById('authMethodText');
    if (methodItem && methodText) {
        if (token && authMethod) {
            methodText.textContent = authMethod;
            methodItem.style.display = '';
        } else {
            methodItem.style.display = 'none';
        }
    }

    // Identity (username or clientId)
    var identityItem = document.getElementById('authSummaryIdentity');
    var identityText = document.getElementById('authIdentityText');
    if (identityItem && identityText) {
        if (token && identity) {
            identityText.textContent = identity;
            identityItem.style.display = '';
        } else {
            identityItem.style.display = 'none';
        }
    }

    // Region
    var regionText = document.getElementById('authRegionText');
    if (regionText) {
        var type = getSelectedServerType();
        if (type === 'eu') {
            regionText.textContent = 'EU';
        } else if (type === 'platform') {
            var region = getSelectedRegion();
            regionText.textContent = region ? region.toUpperCase() : 'CA1';
        } else {
            regionText.textContent = 'US';
        }
    }
}

function setAuthStatus(authenticated, message, authMethod) {
    // Store auth method for display
    if (authenticated && authMethod) {
        sessionStorage.setItem('anypoint_auth_method', authMethod);
    }
    if (!authenticated) {
        sessionStorage.removeItem('anypoint_auth_method');
        sessionStorage.removeItem('anypoint_identity');
        sessionStorage.removeItem('anypoint_token_expires_at');
    }

    updateAuthSummary();
}

function showAuthMessage(msg, isError) {
    var el = document.getElementById('authMessage');
    if (!el) return;
    el.textContent = msg;
    el.className = 'auth-message ' + (isError ? 'auth-error' : 'auth-success');
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 5000);
}

async function loginBearer() {
    var username = document.getElementById('authUsername').value.trim();
    var password = document.getElementById('authPassword').value;
    if (!username || !password) {
        showAuthMessage('Please enter username and password.', true);
        return;
    }
    var serverBase = getSelectedBaseUrl();
    try {
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: 'POST',
                url: serverBase + '/accounts/login',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: username, password: password})
            })
        });
        var data = await resp.json();
        if (data.error) {
            showAuthMessage('Proxy error: ' + data.error, true);
            return;
        }
        var body = JSON.parse(data.body);
        if (data.status === 200 && body.access_token) {
            sessionStorage.setItem('anypoint_token', body.access_token);
            sessionStorage.setItem('anypoint_identity', username);

            // Store token expiration time
            if (body.expires_in) {
                var expiresAt = Date.now() + (body.expires_in * 1000);
                sessionStorage.setItem('anypoint_token_expires_at', expiresAt.toString());
            }

            setAuthStatus(true, null, 'Bearer');
            showAuthMessage('Login successful!', false);
        } else {
            showAuthMessage('Login failed: ' + (body.message || body.error || 'Unknown error'), true);
        }
    } catch (e) {
        showAuthMessage('Cannot reach proxy at ' + PROXY_URL + '. Is the proxy server running?', true);
    }
}

async function loginOAuth2() {
    var clientId = document.getElementById('authClientId').value.trim();
    var clientSecret = document.getElementById('authClientSecret').value.trim();
    if (!clientId || !clientSecret) {
        showAuthMessage('Please enter Client ID and Client Secret.', true);
        return;
    }
    var serverBase = getSelectedBaseUrl();
    try {
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: 'POST',
                url: serverBase + '/accounts/api/v2/oauth2/token',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: 'grant_type=client_credentials&client_id=' + encodeURIComponent(clientId) + '&client_secret=' + encodeURIComponent(clientSecret)
            })
        });
        var data = await resp.json();
        if (data.error) {
            showAuthMessage('Proxy error: ' + data.error, true);
            return;
        }
        var body = JSON.parse(data.body);
        if (data.status === 200 && body.access_token) {
            sessionStorage.setItem('anypoint_token', body.access_token);
            sessionStorage.setItem('anypoint_identity', clientId);

            // Store token expiration time
            if (body.expires_in) {
                var expiresAt = Date.now() + (body.expires_in * 1000);
                sessionStorage.setItem('anypoint_token_expires_at', expiresAt.toString());
            }

            setAuthStatus(true, null, 'OAuth2');
            showAuthMessage('Token obtained successfully!', false);
        } else {
            showAuthMessage('Token request failed: ' + (body.error_description || body.error || 'Unknown error'), true);
        }
    } catch (e) {
        showAuthMessage('Cannot reach proxy at ' + PROXY_URL + '. Is the proxy server running?', true);
    }
}

function getAuthHeaders() {
    var token = sessionStorage.getItem('anypoint_token');
    if (token) return {'Authorization': 'Bearer ' + token};
    return {};
}

// ============================================================================
// Try It Out — Environment Variables
// ============================================================================

var ENV_STORAGE_KEY = 'anypoint_env_vars';
var DEFAULT_ENV_VARS = [];

function loadEnvVars() {
    try {
        var stored = sessionStorage.getItem(ENV_STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {}
    return DEFAULT_ENV_VARS.map(function(v) { return {name: v.name, value: v.value}; });
}

function saveEnvVars() {
    var vars = [];
    var rows = document.querySelectorAll('.env-var-row');
    rows.forEach(function(row) {
        var nameInput = row.querySelector('.env-var-name');
        var valueInput = row.querySelector('.env-var-value');
        if (nameInput && valueInput) {
            var name = nameInput.value.trim();
            if (name) vars.push({name: name, value: valueInput.value});
        }
    });
    sessionStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(vars));
}

function renderEnvVars() {
    var container = document.getElementById('envVarsList');
    if (!container) return;
    var vars = loadEnvVars();
    container.innerHTML = '';
    vars.forEach(function(v, i) {
        var row = document.createElement('div');
        row.className = 'env-var-row';

        // Check if this parameter has x-origin configuration
        var xorigin = GLOBAL_PARAM_X_ORIGIN[v.name];
        var valueHtml = '';
        if (xorigin) {
            var xoriginId = 'envvar-' + v.name;
            var datalistId = 'datalist-envvar-' + v.name;
            var xoriginJson = JSON.stringify(xorigin).replace(/"/g, '&quot;');
            valueHtml = '<div class="x-origin-input-group">' +
                '<input type="text" class="env-var-value" id="' + xoriginId + '" ' +
                'data-x-origin="' + xoriginJson + '" ' +
                'value="' + escapeAttr(v.value) + '" placeholder="Value" ' +
                'onchange="saveEnvVars()" autocomplete="off" list="' + datalistId + '">' +
                '<datalist id="' + datalistId + '"></datalist>' +
                '<button class="btn-load-xorigin" ' +
                'onclick="loadXOriginValuesForEnv(\'' + v.name + '\'); return false;" ' +
                'title="' + escapeAttr(xorigin.description) + '">↻</button>' +
                '</div>';
        } else {
            valueHtml = '<input type="text" class="env-var-value" value="' + escapeAttr(v.value) + '" placeholder="Value" onchange="saveEnvVars()">';
        }

        row.innerHTML =
            '<input type="text" class="env-var-name" value="' + escapeAttr(v.name) + '" placeholder="Variable name" onchange="saveEnvVars()">' +
            valueHtml +
            '<button class="btn-env-remove" onclick="removeEnvVar(this)" title="Remove">&#x2715;</button>';
        container.appendChild(row);
    });
}

function escapeAttr(str) {
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function addEnvVar() {
    var vars = loadEnvVars();
    vars.push({name: '', value: ''});
    sessionStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(vars));
    renderEnvVars();
    // Focus the new name input
    var rows = document.querySelectorAll('.env-var-row');
    if (rows.length > 0) {
        var lastRow = rows[rows.length - 1];
        var nameInput = lastRow.querySelector('.env-var-name');
        if (nameInput) nameInput.focus();
    }
}

function removeEnvVar(btn) {
    var row = btn.closest('.env-var-row');
    if (row) row.remove();
    saveEnvVars();
}

function getEnvVarsMap() {
    var vars = loadEnvVars();
    var map = {};
    vars.forEach(function(v) {
        if (v.name && v.value) map[v.name] = v.value;
    });
    return map;
}

function applyEnvVarsToPanel(panelId) {
    var panel = document.getElementById(panelId);
    if (!panel) return;
    var envMap = getEnvVarsMap();
    var inputs = panel.querySelectorAll('[data-param]');
    inputs.forEach(function(input) {
        var paramName = input.getAttribute('data-param');
        if (paramName in envMap && !input.value) {
            input.value = envMap[paramName];
        }
    });
}

// ============================================================================
// x-origin Auto-populate with suggestions
// ============================================================================

async function loadXOriginValues(opId, paramName) {
    var input = document.getElementById('xorigin-' + opId + '-' + paramName);
    var datalist = document.getElementById('datalist-' + opId + '-' + paramName);
    if (!input || !datalist) return;

    // Check if authenticated
    var token = sessionStorage.getItem('anypoint_token');
    if (!token) {
        showAuthMessage('Please authenticate first to fetch values.', true);
        return;
    }
    if (isTokenExpired()) {
        showAuthMessage('Token expired. Please re-authenticate to fetch values.', true);
        return;
    }

    // Parse x-origin configuration
    var originJson = input.getAttribute('data-x-origin');
    if (!originJson) return;

    var origin = {};
    try {
        origin = JSON.parse(originJson);
    } catch (e) {
        console.error('Failed to parse x-origin:', e);
        return;
    }

    var apiSlug = origin.api ? origin.api.replace('urn:api:', '') : '';
    var operationId = origin.operation || '';
    var valuesPath = origin.values || '';
    var labelsPath = origin.labels || '';

    if (!apiSlug || !operationId || !valuesPath) {
        console.error('Invalid x-origin configuration');
        return;
    }

    // Get operation metadata
    var opLookup = window.__OP_LOOKUP__ || {};
    var apiEntry = opLookup[apiSlug];
    if (!apiEntry) {
        showAuthMessage('API "' + apiSlug + '" not found in lookup.', true);
        return;
    }

    var opMeta = apiEntry.ops[operationId];
    if (!opMeta) {
        showAuthMessage('Operation "' + operationId + '" not found in ' + apiSlug + '.', true);
        return;
    }

    var method = opMeta.method;
    var pathTemplate = opMeta.path;

    // Build URL - substitute any {param} from environment variables
    var envMap = getEnvVarsMap();
    var path = pathTemplate;
    var missingParams = [];

    var pathParams = (path.match(/\{([^}]+)\}/g) || []).map(function(m) {
        return m.slice(1, -1);
    });

    pathParams.forEach(function(paramName) {
        var value = envMap[paramName];
        if (value) {
            path = path.replace('{' + paramName + '}', encodeURIComponent(value));
        } else {
            missingParams.push(paramName);
        }
    });

    if (missingParams.length > 0) {
        showAuthMessage('Missing path parameters for x-origin: ' + missingParams.join(', ') + '. Set them in environment variables.', true);
        return;
    }

    // Get server URL for the target API
    var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
    var fullUrl = serverUrl + path;

    // Update button state
    var btn = input.nextElementSibling.nextElementSibling; // Skip datalist
    if (btn && btn.classList.contains('btn-load-xorigin')) {
        btn.disabled = true;
        btn.textContent = '⟳';
        btn.classList.add('loading');
    }

    try {
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: method,
                url: fullUrl,
                headers: Object.assign(
                    {'Content-Type': 'application/json'},
                    getAuthHeaders()
                ),
                body: null
            })
        });

        var data = await resp.json();

        if (btn) {
            btn.disabled = false;
            btn.textContent = '↻';
            btn.classList.remove('loading');
        }

        if (data.error) {
            showAuthMessage('x-origin fetch error: ' + data.error, true);
            return;
        }

        if (data.status < 200 || data.status >= 300) {
            showAuthMessage('x-origin returned status ' + data.status, true);
            return;
        }

        // Parse response body
        var body = null;
        try {
            body = JSON.parse(data.body || '{}');
        } catch (e) {
            showAuthMessage('x-origin response is not valid JSON', true);
            return;
        }

        // Extract values and labels using paths
        var values = extractXOriginValues(body, valuesPath);
        if (!values || values.length === 0) {
            showAuthMessage('No values found at path: ' + valuesPath, true);
            return;
        }

        var labels = [];
        if (labelsPath) {
            labels = extractXOriginValues(body, labelsPath);
            // Ensure labels array matches values length
            if (labels.length !== values.length) {
                console.warn('Labels count mismatch: ' + labels.length + ' labels vs ' + values.length + ' values. Using values only.');
                labels = [];
            }
        }

        // Populate datalist for autocomplete
        datalist.innerHTML = '';
        values.forEach(function(val, idx) {
            var valueStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
            var labelStr = labels[idx] ? String(labels[idx]) : valueStr;

            var option = document.createElement('option');
            option.value = valueStr;
            // If we have a label different from value, show "label (value)"
            if (labels[idx] && labelStr !== valueStr) {
                option.label = labelStr + ' (' + valueStr + ')';
            } else {
                option.label = valueStr;
            }
            datalist.appendChild(option);
        });

        // Show success message
        var message = 'Loaded ' + values.length + ' suggestion(s) from ' + apiSlug + '#' + operationId;
        if (labelsPath) {
            message += ' with labels';
        }
        message += '. Start typing to see suggestions.';
        showAuthMessage(message, false);

        // Focus the input to show suggestions
        input.focus();

    } catch (e) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '↻';
            btn.classList.remove('loading');
        }
        showAuthMessage('Cannot reach proxy: ' + e.message, true);
    }
}

function extractXOriginValues(responseBody, fieldPath) {
    // Handle array of paths (v2 format supports multiple extraction paths)
    if (Array.isArray(fieldPath)) {
        var allValues = [];
        fieldPath.forEach(function(path) {
            var extracted = extractXOriginValues(responseBody, path);
            if (extracted && extracted.length > 0) {
                allValues = allValues.concat(extracted);
            }
        });
        return allValues;
    }

    // Single path extraction
    if (!fieldPath || !responseBody) {
        if (Array.isArray(responseBody)) return responseBody;
        return [responseBody];
    }

    var result = extractByPath(responseBody, fieldPath);
    if (result === undefined || result === null) return [];
    if (Array.isArray(result)) return result;
    return [result];
}

async function loadXOriginValuesForEnv(paramName) {
    var xorigin = GLOBAL_PARAM_X_ORIGIN[paramName];
    if (!xorigin) return;

    var inputId = 'envvar-' + paramName;
    var input = document.getElementById(inputId);
    var datalistId = 'datalist-envvar-' + paramName;
    var datalist = document.getElementById(datalistId);
    if (!input || !datalist) return;

    // Check if authenticated
    var token = sessionStorage.getItem('anypoint_token');
    if (!token) {
        showAuthMessage('Please authenticate first to fetch values.', true);
        return;
    }
    if (isTokenExpired()) {
        showAuthMessage('Token expired. Please re-authenticate to fetch values.', true);
        return;
    }

    var apiSlug = xorigin.api.replace('urn:api:', '');
    var operationId = xorigin.operation;
    var valuesPath = xorigin.values || '';
    var labelsPath = xorigin.labels || '';

    // Get operation metadata
    var opLookup = window.__OP_LOOKUP__ || {};
    var apiEntry = opLookup[apiSlug];
    if (!apiEntry) {
        showAuthMessage('API "' + apiSlug + '" not found in lookup.', true);
        return;
    }

    var opMeta = apiEntry.ops[operationId];
    if (!opMeta) {
        showAuthMessage('Operation "' + operationId + '" not found in ' + apiSlug + '.', true);
        return;
    }

    var method = opMeta.method;
    var pathTemplate = opMeta.path;

    // Build URL - substitute any {param} from environment variables
    var envMap = getEnvVarsMap();
    var path = pathTemplate;
    var missingParams = [];

    var pathParams = (path.match(/\{([^}]+)\}/g) || []).map(function(m) {
        return m.slice(1, -1);
    });

    pathParams.forEach(function(paramName) {
        var value = envMap[paramName];
        if (value) {
            path = path.replace('{' + paramName + '}', encodeURIComponent(value));
        } else {
            missingParams.push(paramName);
        }
    });

    if (missingParams.length > 0) {
        showAuthMessage('Missing parameters: ' + missingParams.join(', ') + '. Set them in environment variables first.', true);
        return;
    }

    // Get server URL for the target API
    var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
    var fullUrl = serverUrl + path;

    // Update button state
    var btn = input.parentElement.querySelector('.btn-load-xorigin');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⟳';
        btn.classList.add('loading');
    }

    try {
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: method,
                url: fullUrl,
                headers: Object.assign(
                    {'Content-Type': 'application/json'},
                    getAuthHeaders()
                ),
                body: null
            })
        });

        var data = await resp.json();

        if (btn) {
            btn.disabled = false;
            btn.textContent = '↻';
            btn.classList.remove('loading');
        }

        if (data.error) {
            showAuthMessage('Error: ' + data.error, true);
            return;
        }

        if (data.status < 200 || data.status >= 300) {
            showAuthMessage('Request returned status ' + data.status, true);
            return;
        }

        // Parse response body
        var body = null;
        try {
            body = JSON.parse(data.body || '{}');
        } catch (e) {
            showAuthMessage('Response is not valid JSON', true);
            return;
        }

        // Extract values and labels using paths
        var values = extractXOriginValues(body, valuesPath);
        if (!values || values.length === 0) {
            showAuthMessage('No values found at path: ' + valuesPath, true);
            return;
        }

        var labels = [];
        if (labelsPath) {
            labels = extractXOriginValues(body, labelsPath);
            if (labels.length !== values.length) {
                console.warn('Labels count mismatch for ' + paramName + ': ' + labels.length + ' labels vs ' + values.length + ' values.');
                labels = [];
            }
        }

        // Populate datalist for autocomplete
        datalist.innerHTML = '';
        values.forEach(function(val, idx) {
            var valueStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
            var labelStr = labels[idx] ? String(labels[idx]) : valueStr;

            var option = document.createElement('option');
            option.value = valueStr;
            // If we have a label different from value, show "label (value)"
            if (labels[idx] && labelStr !== valueStr) {
                option.label = labelStr + ' (' + valueStr + ')';
            } else {
                option.label = valueStr;
            }
            datalist.appendChild(option);
        });

        // Show success message
        showAuthMessage('Loaded ' + values.length + ' suggestion(s). Start typing to see them.', false);

        // Focus the input to show suggestions
        input.focus();

    } catch (e) {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '↻';
            btn.classList.remove('loading');
        }
        showAuthMessage('Cannot reach proxy: ' + e.message, true);
    }
}

// ============================================================================
// Try It Out — Request execution
// ============================================================================

function toggleTryItOut(opId) {
    var section = document.getElementById('op-' + opId);
    if (!section) return;

    var wrapper = section.querySelector('.operation-content-wrapper');
    if (!wrapper) return;

    var isCollapsed = wrapper.classList.contains('try-panel-collapsed');

    // Find the button
    var btn = section.querySelector('.btn-try-it');

    if (isCollapsed) {
        // Expanding - apply env vars first
        applyEnvVarsToPanel('try-' + opId);
        wrapper.classList.remove('try-panel-collapsed');
        if (btn) btn.textContent = 'Hide Try It Out';
    } else {
        // Collapsing
        wrapper.classList.add('try-panel-collapsed');
        if (btn) btn.textContent = 'Try It Out';
    }
}

function toggleTryItOutExpand(opId) {
    var container = document.getElementById('op-container-' + opId);
    if (!container) return;

    var isExpanded = container.classList.contains('try-expanded');
    var btn = container.querySelector('.btn-expand-try');
    var icon = btn ? btn.querySelector('img') : null;
    var responseDiv = document.getElementById('response-' + opId);

    if (isExpanded) {
        // Collapse
        container.classList.remove('try-expanded');
        if (btn) {
            btn.setAttribute('aria-label', 'Expand try it out panel');
            btn.setAttribute('title', 'Expand');
        }
        if (icon) {
            var basePath = icon.src.substring(0, icon.src.lastIndexOf('/'));
            icon.src = basePath + '/expand.svg';
        }
    } else {
        // Expand
        container.classList.add('try-expanded');
        if (btn) {
            btn.setAttribute('aria-label', 'Collapse try it out panel');
            btn.setAttribute('title', 'Collapse');
        }
        if (icon) {
            var basePath = icon.src.substring(0, icon.src.lastIndexOf('/'));
            icon.src = basePath + '/collapse.svg';
        }

        // If response div is hidden, mark it as empty for placeholder
        if (responseDiv && responseDiv.style.display === 'none') {
            responseDiv.classList.add('empty');
        }
    }
}

// ============================================================================
// Server URL resolution
// ============================================================================

function getSelectedServerType() {
    var sel = document.getElementById('serverSelect');
    if (!sel) return 'us';
    return sel.value; // 'us', 'eu', or 'platform'
}

function getSelectedRegion() {
    var sel = document.getElementById('serverSelect');
    if (!sel || sel.value !== 'platform') return null;
    var preset = document.getElementById('regionPreset');
    if (!preset) return null;
    if (preset.value === 'custom') {
        var customInput = document.getElementById('regionCustomInput');
        return (customInput && customInput.value.trim()) ? customInput.value.trim() : null;
    }
    return preset.value;
}

function getSelectedBaseUrl() {
    // Returns just the domain part (no API path) for auth endpoints
    var type = getSelectedServerType();
    if (type === 'eu') return 'https://eu1.anypoint.mulesoft.com';
    if (type === 'platform') {
        var region = getSelectedRegion();
        return 'https://' + (region || 'ca1') + '.platform.mulesoft.com';
    }
    return 'https://anypoint.mulesoft.com';
}

/**
 * Pick the right server template from a servers array based on region selection.
 * If region is set, pick the server whose URL contains {region} (or similar region var).
 * Otherwise pick the first server (typically the global one).
 */
function pickServerTemplate(servers) {
    if (!servers || servers.length === 0) return null;
    var type = getSelectedServerType();
    if (type === 'eu') {
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].url.indexOf('eu1.anypoint.mulesoft.com') !== -1) return servers[i];
        }
    } else if (type === 'platform') {
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].url.indexOf('platform.mulesoft.com') !== -1) return servers[i];
        }
    }
    // 'us' or fallback
    return servers[0];
}

/**
 * Get the list of server variables that are NOT region-related.
 * These need user input in the operation UI.
 */
function getNonRegionVars(server) {
    if (!server || !server.variables) return {};
    var result = {};
    for (var vname in server.variables) {
        if (vname !== 'region' && vname !== 'REGION_ID') {
            result[vname] = server.variables[vname];
        }
    }
    return result;
}

/**
 * Resolve a server URL template by substituting all variables.
 * - region/REGION_ID: uses the auth panel selection
 * - other vars: uses values from the operation's server-var inputs, or defaults
 */
function resolveServerUrl(server, opId) {
    if (!server) return 'https://anypoint.mulesoft.com';
    var url = server.url;
    var vars = server.variables || {};
    var region = getSelectedRegion();

    for (var vname in vars) {
        var placeholder = '{' + vname + '}';
        if (url.indexOf(placeholder) === -1) continue;

        if (vname === 'region' || vname === 'REGION_ID') {
            url = url.replace(placeholder, region || vars[vname].default || '');
        } else {
            // Look for input in the operation's server-vars section
            var value = vars[vname].default || '';
            if (opId) {
                var input = document.querySelector('#server-vars-' + opId + ' [data-server-var="' + vname + '"]');
                if (input && input.value.trim()) {
                    value = input.value.trim();
                }
            }
            url = url.replace(placeholder, value);
        }
    }
    return url;
}

/**
 * Get the resolved server URL for the current API page.
 * Uses the per-operation selection if available.
 */
function getSelectedServer(opId) {
    var meta = window.__API_META__;
    if (!meta || !meta.servers) return 'https://anypoint.mulesoft.com';

    var idx = getActiveServerIndex(opId, meta.servers);
    return resolveServerUrl(meta.servers[idx], opId);
}

/**
 * Get the resolved server URL for a cross-API call (x-origin).
 */
function getServerForApi(apiSlug) {
    var opLookup = window.__OP_LOOKUP__;
    if (opLookup && opLookup[apiSlug] && opLookup[apiSlug].servers && opLookup[apiSlug].servers.length > 0) {
        var server = pickServerTemplate(opLookup[apiSlug].servers);
        return resolveServerUrl(server, null);
    }
    return getSelectedServer(null);
}

function onServerChange() {
    var sel = document.getElementById('serverSelect');
    var regionRow = document.getElementById('serverRegionRow');
    if (sel && regionRow) {
        regionRow.style.display = sel.value === 'platform' ? 'flex' : 'none';
    }
    updateAuthSummary();
    updateAllServerCombos();
}

function onRegionPresetChange() {
    var preset = document.getElementById('regionPreset');
    var customInput = document.getElementById('regionCustomInput');
    if (preset && customInput) {
        customInput.style.display = preset.value === 'custom' ? 'block' : 'none';
        if (preset.value === 'custom') customInput.focus();
    }
    updateAuthSummary();
    updateAllServerCombos();
}

/**
 * Track selected server index per operation. Default null = auto.
 */
var _serverSelections = {};

/**
 * Return the index of the preferred server based on region selection.
 */
function getPreferredServerIndex(servers) {
    var type = getSelectedServerType();
    if (type === 'eu') {
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].url.indexOf('eu1.anypoint.mulesoft.com') !== -1) return i;
        }
    } else if (type === 'platform') {
        for (var i = 0; i < servers.length; i++) {
            if (servers[i].url.indexOf('platform.mulesoft.com') !== -1) return i;
        }
    }
    return 0;
}

/**
 * Get the active server index for an operation.
 */
function getActiveServerIndex(opId, servers) {
    if (_serverSelections[opId] != null) return _serverSelections[opId];
    return getPreferredServerIndex(servers);
}

/**
 * Initialize unified URL bars in all operation headers.
 */
function initServerCombos() {
    var meta = window.__API_META__;
    if (!meta || !meta.servers || meta.servers.length === 0) return;

    var bars = document.querySelectorAll('.operation-url-bar');
    bars.forEach(function(bar) {
        var opId = bar.getAttribute('data-op-id');
        var path = bar.getAttribute('data-path');
        buildUrlBar(bar, opId, path, meta.servers);
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.operation-url-bar')) {
            closeAllServerDropdowns();
        }
    });
}

function buildUrlBar(bar, opId, path, servers) {
    bar.innerHTML = '';

    var idx = getActiveServerIndex(opId, servers);
    var resolvedUrl = resolveServerUrl(servers[idx], opId);

    // Server part (clickable)
    var serverSpan = document.createElement('span');
    serverSpan.className = 'url-server-part';
    serverSpan.textContent = resolvedUrl;
    serverSpan.title = 'Click to change server';

    if (servers.length > 1) {
        serverSpan.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleServerDropdown(bar, opId, servers);
        });
    }

    // Path part
    var pathSpan = document.createElement('span');
    pathSpan.className = 'url-path-part';
    pathSpan.textContent = path;

    bar.appendChild(serverSpan);
    bar.appendChild(pathSpan);
}

function toggleServerDropdown(bar, opId, servers) {
    var existing = bar.querySelector('.server-dropdown');
    if (existing) {
        existing.remove();
        return;
    }
    closeAllServerDropdowns();

    var dropdown = document.createElement('div');
    dropdown.className = 'server-dropdown';

    var activeIdx = getActiveServerIndex(opId, servers);

    servers.forEach(function(server, idx) {
        var btn = document.createElement('button');
        btn.className = 'server-dropdown-option' + (idx === activeIdx ? ' selected' : '');
        btn.textContent = resolveServerUrl(server, opId);
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            _serverSelections[opId] = idx;
            dropdown.remove();
            updateAllServerBars();
        });
        dropdown.appendChild(btn);
    });

    bar.appendChild(dropdown);
}

function closeAllServerDropdowns() {
    document.querySelectorAll('.server-dropdown').forEach(function(d) { d.remove(); });
}

/**
 * Update all URL bars with current resolved server URLs.
 * Called when region or server variables change.
 */
function updateAllServerBars() {
    var meta = window.__API_META__;
    if (!meta || !meta.servers || meta.servers.length === 0) return;

    var bars = document.querySelectorAll('.operation-url-bar');
    bars.forEach(function(bar) {
        var opId = bar.getAttribute('data-op-id');
        var path = bar.getAttribute('data-path');
        buildUrlBar(bar, opId, path, meta.servers);
    });
}

// Alias for backward compat with callers
var updateAllServerCombos = updateAllServerBars;

/**
 * Build server variable inputs for operations that have non-region variables.
 */
function initServerVarInputs() {
    var meta = window.__API_META__;
    if (!meta || !meta.servers || meta.servers.length === 0) return;

    var server = pickServerTemplate(meta.servers);
    if (!server) return;

    var nonRegionVars = getNonRegionVars(server);
    var varNames = Object.keys(nonRegionVars);
    if (varNames.length === 0) return;

    // Find all server-vars containers and populate them
    var containers = document.querySelectorAll('.try-server-vars');
    containers.forEach(function(container) {
        var opId = container.id.replace('server-vars-', '');
        container.style.display = '';
        container.innerHTML = '<h5 class="try-server-vars-title">Server Variables</h5>';

        varNames.forEach(function(vname) {
            var vdef = nonRegionVars[vname];
            var row = document.createElement('div');
            row.className = 'try-param-row';

            var label = document.createElement('label');
            var nameWrapper = document.createElement('span');
            nameWrapper.className = 'param-name-wrapper';
            var code = document.createElement('code');
            code.textContent = vname;
            nameWrapper.appendChild(code);
            label.appendChild(nameWrapper);

            if (vdef.description) {
                var infoWrapper = document.createElement('span');
                infoWrapper.className = 'param-info-wrapper';
                infoWrapper.setAttribute('data-tooltip', vdef.description);
                var infoIcon = document.createElement('span');
                infoIcon.className = 'param-info-icon';
                infoIcon.setAttribute('aria-label', 'more-info');
                infoWrapper.appendChild(infoIcon);
                label.appendChild(infoWrapper);
            }

            var input = document.createElement('input');
            input.type = 'text';
            input.setAttribute('data-server-var', vname);
            input.placeholder = vdef.description || vname;
            input.value = vdef.default || '';
            input.addEventListener('input', function() {
                updateAllServerCombos();
            });

            row.appendChild(label);
            row.appendChild(input);
            container.appendChild(row);
        });
    });
}

/**
 * Replace .step-url-bar placeholders in skill step_yaml templates with URL bars.
 */
function initStepUrlBars() {
    var opLookup = window.__OP_LOOKUP__ || {};
    var bars = document.querySelectorAll('.step-url-bar');
    bars.forEach(function(bar) {
        var apiSlug = bar.getAttribute('data-api-slug');
        var operationId = bar.getAttribute('data-operation-id');
        var link = bar.getAttribute('data-link');
        var apiEntry = opLookup[apiSlug];
        if (!apiEntry) return;
        var opMeta = apiEntry.ops[operationId];
        if (!opMeta) return;
        var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
        bar.innerHTML = buildUrlBarHtml(opMeta.method, serverUrl, opMeta.path, link);
    });
}

// Custom parameter management
function addCustomParam(opId, location) {
    const containerId = location === 'query' ? 'custom-query-' + opId : 'custom-header-' + opId;
    const container = document.getElementById(containerId);
    if (!container) return;

    const paramRow = document.createElement('div');
    paramRow.className = 'custom-param-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = location === 'query' ? 'Parameter name' : 'Header name';
    nameInput.className = 'custom-param-name';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.className = 'custom-param-value';
    valueInput.setAttribute('data-param', '');
    valueInput.setAttribute('data-in', location);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-custom-param';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() {
        paramRow.remove();
    };

    // Update data-param when name changes
    nameInput.addEventListener('input', function() {
        valueInput.setAttribute('data-param', nameInput.value);
    });

    const inputsWrapper = document.createElement('div');
    inputsWrapper.appendChild(nameInput);
    inputsWrapper.appendChild(valueInput);

    paramRow.appendChild(inputsWrapper);
    paramRow.appendChild(removeBtn);
    container.appendChild(paramRow);

    nameInput.focus();
}

// Custom parameter management for x-origin modal
function addCustomParamXOrigin(sourceIdx, location) {
    const containerId = location === 'query' ? 'custom-query-xorigin-' + sourceIdx : 'custom-header-xorigin-' + sourceIdx;
    const container = document.getElementById(containerId);
    if (!container) return;

    const paramRow = document.createElement('div');
    paramRow.className = 'custom-param-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = location === 'query' ? 'Parameter name' : 'Header name';
    nameInput.className = 'custom-param-name';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.className = 'custom-param-value';
    valueInput.setAttribute('data-param', '');
    valueInput.setAttribute('data-in', location);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-custom-param';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() {
        paramRow.remove();
    };

    // Update data-param when name changes
    nameInput.addEventListener('input', function() {
        valueInput.setAttribute('data-param', nameInput.value);
    });

    const inputsWrapper = document.createElement('div');
    inputsWrapper.appendChild(nameInput);
    inputsWrapper.appendChild(valueInput);

    paramRow.appendChild(inputsWrapper);
    paramRow.appendChild(removeBtn);
    container.appendChild(paramRow);

    nameInput.focus();
}

// Custom parameter management for workflow steps
function addCustomParamWf(sid, location) {
    const containerId = location === 'query' ? 'custom-query-wf-' + sid : 'custom-header-wf-' + sid;
    const container = document.getElementById(containerId);
    if (!container) return;

    const paramRow = document.createElement('div');
    paramRow.className = 'custom-param-row';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = location === 'query' ? 'Parameter name' : 'Header name';
    nameInput.className = 'custom-param-name';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.className = 'custom-param-value';
    valueInput.setAttribute('data-wf-param', '');
    valueInput.setAttribute('data-in', location);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove-custom-param';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() {
        paramRow.remove();
    };

    // Update data-wf-param when name changes
    nameInput.addEventListener('input', function() {
        valueInput.setAttribute('data-wf-param', nameInput.value);
    });

    const inputsWrapper = document.createElement('div');
    inputsWrapper.appendChild(nameInput);
    inputsWrapper.appendChild(valueInput);

    paramRow.appendChild(inputsWrapper);
    paramRow.appendChild(removeBtn);
    container.appendChild(paramRow);

    nameInput.focus();
}

function copyCurlCommand(opId) {
    var section = document.getElementById('op-' + opId);
    if (!section) return;

    var method = section.getAttribute('data-method');
    var pathTemplate = section.getAttribute('data-path');
    var tryPanel = document.getElementById('try-' + opId);
    if (!tryPanel) return;

    // Collect parameters
    var path = pathTemplate;
    var queryParams = [];
    var extraHeaders = {};

    var inputs = tryPanel.querySelectorAll('[data-param]');
    inputs.forEach(function(input) {
        var name = input.getAttribute('data-param');
        var location = input.getAttribute('data-in');
        var value = input.value;
        if (!value) return;

        if (location === 'path') {
            path = path.replace('{' + name + '}', encodeURIComponent(value));
        } else if (location === 'query') {
            queryParams.push(encodeURIComponent(name) + '=' + encodeURIComponent(value));
        } else if (location === 'header') {
            extraHeaders[name] = value;
        }
    });

    // Build full URL
    var serverUrl = getSelectedServer(opId).replace(/\/$/, '');
    var fullUrl = serverUrl + path;
    if (queryParams.length > 0) {
        fullUrl += '?' + queryParams.join('&');
    }

    // Request body
    var body = null;
    var bodyEditor = getCodeMirrorEditor('body-' + opId);
    if (bodyEditor) {
        var editorContent = bodyEditor.getValue();
        if (editorContent.trim()) {
            body = editorContent.trim();
        }
    }

    // Headers
    var headers = Object.assign(
        {'Content-Type': 'application/json'},
        getAuthHeaders(),
        extraHeaders
    );

    // Build cURL command
    var curlCommand = 'curl -X ' + method + ' \\\n';
    curlCommand += '  "' + fullUrl + '"';

    // Add headers
    for (var headerName in headers) {
        curlCommand += ' \\\n  -H "' + headerName + ': ' + headers[headerName] + '"';
    }

    // Add body if present
    if (body) {
        // Escape single quotes in body
        var escapedBody = body.replace(/'/g, "'\\''");
        curlCommand += ' \\\n  -d \'' + escapedBody + '\'';
    }

    // Copy to clipboard
    navigator.clipboard.writeText(curlCommand).then(function() {
        // Show "Copied" status
        var copyText = document.getElementById('copy-text-' + opId);
        if (copyText) {
            var originalText = copyText.textContent;
            var dropdownItem = copyText.closest('.send-dropdown-item');

            copyText.textContent = 'Copied';
            if (dropdownItem) {
                dropdownItem.classList.add('copied');
            }

            // Keep dropdown open longer to show feedback
            setTimeout(function() {
                copyText.textContent = originalText;
                if (dropdownItem) {
                    dropdownItem.classList.remove('copied');
                }
                closeSendDropdown(opId);
            }, 1500);
        }
    }).catch(function(err) {
        console.error('Failed to copy cURL command:', err);
        alert('Failed to copy to clipboard. Please try again.');
    });
}

function toggleSendDropdown(opId) {
    var dropdown = document.getElementById('send-dropdown-' + opId);
    if (!dropdown) return;

    var isVisible = dropdown.style.display !== 'none';

    // Close all other dropdowns first
    document.querySelectorAll('.send-dropdown-menu').forEach(function(d) {
        d.style.display = 'none';
    });

    dropdown.style.display = isVisible ? 'none' : 'block';
}

function closeSendDropdown(opId) {
    var dropdown = document.getElementById('send-dropdown-' + opId);
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

function switchResponseTab(opId, tabName) {
    var responseDiv = document.getElementById('response-' + opId);
    if (!responseDiv) return;

    // Update tab buttons
    var tabButtons = responseDiv.querySelectorAll('.try-tab-btn');
    tabButtons.forEach(function(btn) {
        btn.classList.remove('active');
    });
    var activeTab = Array.from(tabButtons).find(function(btn) {
        return btn.textContent.toLowerCase() === tabName.toLowerCase();
    });
    if (activeTab) activeTab.classList.add('active');

    // Update content
    var bodyContent = document.getElementById('respbody-' + opId);
    var headersContent = document.getElementById('respheaders-' + opId);

    if (tabName === 'body') {
        if (bodyContent) bodyContent.classList.add('active');
        if (headersContent) headersContent.classList.remove('active');
    } else if (tabName === 'headers') {
        if (bodyContent) bodyContent.classList.remove('active');
        if (headersContent) headersContent.classList.add('active');
    }
}

async function sendRequest(opId) {
    var section = document.getElementById('op-' + opId);
    if (!section) return;

    var method = section.getAttribute('data-method');
    var pathTemplate = section.getAttribute('data-path');
    var tryPanel = document.getElementById('try-' + opId);
    if (!tryPanel) return;

    // Collect parameters
    var path = pathTemplate;
    var queryParams = [];
    var extraHeaders = {};

    var inputs = tryPanel.querySelectorAll('[data-param]');
    inputs.forEach(function(input) {
        var name = input.getAttribute('data-param');
        var location = input.getAttribute('data-in');
        var value = input.value;
        if (!value) return;

        if (location === 'path') {
            path = path.replace('{' + name + '}', encodeURIComponent(value));
        } else if (location === 'query') {
            queryParams.push(encodeURIComponent(name) + '=' + encodeURIComponent(value));
        } else if (location === 'header') {
            extraHeaders[name] = value;
        }
    });

    // Build full URL
    var serverUrl = getSelectedServer(opId).replace(/\/$/, '');
    var fullUrl = serverUrl + path;
    if (queryParams.length > 0) {
        fullUrl += '?' + queryParams.join('&');
    }

    // Request body
    var body = null;
    var bodyEditor = getCodeMirrorEditor('body-' + opId);
    if (bodyEditor) {
        var editorContent = bodyEditor.getValue();
        if (editorContent.trim()) {
            body = editorContent.trim();
        }
    }
    // Ensure body is always a string (not an object)
    if (body !== null && typeof body !== 'string') {
        body = JSON.stringify(body);
    }

    // Headers
    var headers = Object.assign(
        {'Content-Type': 'application/json'},
        getAuthHeaders(),
        extraHeaders
    );

    // UI feedback
    var spinner = document.getElementById('spinner-' + opId);
    var responseDiv = document.getElementById('response-' + opId);
    var statusBadge = document.getElementById('status-' + opId);
    var responseBody = document.getElementById('respbody-' + opId);
    var responseHeaders = document.getElementById('respheaders-' + opId);

    if (spinner) spinner.style.display = 'inline';

    // Check if we're in expanded mode
    var container = document.getElementById('op-container-' + opId);
    var isExpanded = container && container.classList.contains('try-expanded');

    if (isExpanded) {
        // In expanded mode, keep response visible but add 'empty' class
        if (responseDiv) responseDiv.classList.add('empty');
    } else {
        // In collapsed mode, hide the response
        if (responseDiv) responseDiv.style.display = 'none';
    }

    try {
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: method,
                url: fullUrl,
                headers: headers,
                body: body
            })
        });
        var data = await resp.json();

        if (spinner) spinner.style.display = 'none';
        if (responseDiv) {
            responseDiv.style.display = 'block';
            responseDiv.classList.remove('empty');
        }

        if (data.error) {
            if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.className = 'response-status-badge status-5xx'; }
            if (responseBody) {
                createReadOnlyAceEditor(responseBody, data.error, 'text');
            }
            if (responseDiv) responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Display status
        var status = data.status;
        var statusClass = 'status-' + String(status).charAt(0) + 'xx';
        if (statusBadge) { statusBadge.textContent = status; statusBadge.className = 'response-status-badge ' + statusClass; }

        // Display response body and headers
        displayResponseInAceEditors(responseBody, responseHeaders, data);

        // Scroll response into view
        if (responseDiv) responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    } catch (e) {
        if (spinner) spinner.style.display = 'none';
        if (responseDiv) {
            responseDiv.style.display = 'block';
            responseDiv.classList.remove('empty');
        }
        if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.className = 'response-status-badge status-5xx'; }
        if (responseBody) {
            createReadOnlyAceEditor(responseBody, 'Cannot reach proxy at ' + PROXY_URL + '.\nMake sure the proxy server is running:\n  python3 scripts/proxy_server.py', 'text');
        }
        if (responseDiv) responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ============================================================================
// Ace Editor Initialization
// ============================================================================

function initCodeMirrorEditors() {
    if (typeof ace === 'undefined') {
        setTimeout(initCodeMirrorEditors, 500);
        return;
    }

    if (!window.aceEditors) {
        window.aceEditors = {};
    }

    var requestEditors = document.querySelectorAll('.try-request-editor-cm');

    requestEditors.forEach(function(el) {
        var contentType = el.dataset.contentType || 'application/json';
        var exampleBody = el.dataset.exampleBody || '';
        var mode = 'ace/mode/json';

        if (contentType.includes('yaml')) {
            mode = 'ace/mode/yaml';
        } else if (contentType.includes('xml')) {
            mode = 'ace/mode/xml';
        }

        var editor = ace.edit(el, {
            mode: mode,
            theme: 'ace/theme/textmate',
            value: exampleBody,
            minLines: 10,
            maxLines: 15,
            showPrintMargin: false,
            highlightActiveLine: true,
            showGutter: true,
            fontSize: '13px'
        });

        window.aceEditors[el.id] = editor;
    });
}

function getCodeMirrorEditor(id) {
    if (!window.aceEditors) {
        window.aceEditors = {};
    }
    return window.aceEditors[id];
}

function createReadOnlyAceEditor(container, content, language) {
    if (typeof ace === 'undefined' || !container) return null;

    var mode = 'ace/mode/json';
    if (language === 'yaml') {
        mode = 'ace/mode/yaml';
    } else if (language === 'xml') {
        mode = 'ace/mode/xml';
    } else if (language === 'none' || language === 'text') {
        mode = 'ace/mode/text';
    }

    // Check if container already has an Ace editor instance
    if (container.env && container.env.editor) {
        // Reuse existing editor, just update content and mode
        var editor = container.env.editor;
        editor.session.setMode(mode);
        editor.setValue(content || '', -1);
        editor.container.style.backgroundColor = '#f8f9fa';
        return editor;
    }

    // Clear container
    container.innerHTML = '';

    var editor = ace.edit(container, {
        mode: mode,
        theme: 'ace/theme/textmate',
        value: content || '',
        readOnly: true,
        minLines: 5,
        maxLines: 20,
        showPrintMargin: false,
        highlightActiveLine: false,
        showGutter: true,
        fontSize: '13px'
    });

    // Set read-only background
    editor.container.style.backgroundColor = '#f8f9fa';

    return editor;
}

// Backward compatibility alias
function createReadOnlyCodeMirror(container, content, language) {
    return createReadOnlyAceEditor(container, content, language);
}

function displayResponseInAceEditors(responseBodyContainer, responseHeadersContainer, data) {
    if (!data) return;

    // Display body (try to pretty-print JSON)
    if (responseBodyContainer) {
        var bodyText = data.body || '';
        var bodyLang = 'json';
        try {
            bodyText = JSON.stringify(JSON.parse(bodyText), null, 2);
        } catch (e) {
            bodyLang = 'text';
        }
        createReadOnlyAceEditor(responseBodyContainer, bodyText, bodyLang);
    }

    // Display headers
    if (responseHeadersContainer && data.headers) {
        var headersText = '';
        for (var headerName in data.headers) {
            headersText += headerName + ': ' + data.headers[headerName] + '\n';
        }
        createReadOnlyAceEditor(responseHeadersContainer, headersText || 'No headers returned', 'text');
    }
}

// ============================================================================
// Initialize server selector
// ============================================================================

(function initServerSelect() {
    document.addEventListener('DOMContentLoaded', function() {
        // Add listener for custom region input
        var customInput = document.getElementById('regionCustomInput');
        if (customInput) {
            customInput.addEventListener('input', function() {
                updateAuthSummary();
                updateAllServerCombos();
            });
        }

        // Check for existing token
        var token = sessionStorage.getItem('anypoint_token');
        var authMethod = sessionStorage.getItem('anypoint_auth_method') || '';
        if (token && authMethod) {
            setAuthStatus(true, null, authMethod);
        }

        // Render environment variables
        renderEnvVars();

        // Initialize auth summary display
        updateAuthSummary();

        // Initialize server URL combos, variable inputs, and step URL bars
        initServerCombos();
        initServerVarInputs();
        initStepUrlBars();

        // Initialize all Try It Out panels with environment variables
        var tryItOutPanels = document.querySelectorAll('.try-it-out');
        tryItOutPanels.forEach(function(panel) {
            applyEnvVarsToPanel(panel.id);
        });

        // Initialize CodeMirror editors
        initCodeMirrorEditors();
    });
})();

// ============================================================================
// Workflow Execution Engine
// ============================================================================

var workflowContexts = {};

function initWorkflowContext(skillSlug) {
    var section = document.querySelector('[data-wf-slug="' + skillSlug + '"]');
    if (!section) return;
    var stepsData = [];
    try {
        stepsData = JSON.parse(section.getAttribute('data-wf-steps') || '[]');
    } catch (e) {}
    workflowContexts[skillSlug] = {
        stepsData: stepsData,
        stepResults: []
    };
    // Reset all step statuses
    for (var i = 0; i < stepsData.length; i++) {
        workflowContexts[skillSlug].stepResults[i] = {inputs: {}, outputs: {}, response: null};
        setWfStepStatus(skillSlug, i, 'pending');
    }
}

function setWfStepStatus(skillSlug, stepIndex, status) {
    var el = document.getElementById('wf-status-' + skillSlug + '-' + stepIndex);
    if (!el) return;
    var labels = {pending: 'Pending', running: 'Running', done: 'Done', error: 'Error'};
    el.textContent = labels[status] || status;
    el.className = 'wf-status-badge wf-' + status;
}

function renderWorkflowStepForms(skillSlug) {
    var panels = document.querySelectorAll('[id^="wf-try-' + skillSlug + '-"]');
    var opLookup = window.__OP_LOOKUP__ || {};
    var envMap = getEnvVarsMap();

    panels.forEach(function(panel, stepIndex) {
        var formContainer = panel.querySelector('.wf-form-container');
        if (!formContainer || formContainer.hasAttribute('data-rendered')) return;

        var apiUrn = panel.getAttribute('data-wf-api');
        var operationId = panel.getAttribute('data-wf-operation');
        var inputsJson = panel.getAttribute('data-wf-inputs');

        if (!apiUrn || !operationId) return;

        var apiSlug = apiUrn.replace('urn:api:', '');
        var apiEntry = opLookup[apiSlug];
        if (!apiEntry) return;

        var opMeta = apiEntry.ops[operationId];
        if (!opMeta) return;

        var yamlInputs = {};
        try {
            yamlInputs = JSON.parse(inputsJson || '{}');
        } catch (e) {
            console.error('Failed to parse yamlInputs:', e);
        }

        // Render URL bar in the section header
        var wfServerUrl = getServerForApi(apiSlug).replace(/\/$/, '');
        var sid = skillSlug + '-' + stepIndex;
        var urlBarHeader = document.getElementById('wf-urlbar-' + sid);
        if (urlBarHeader) {
            urlBarHeader.innerHTML = buildUrlBarHtml(opMeta.method, wfServerUrl, opMeta.path,
                apiSlug + '.html#op-' + operationId);
        }

        // Build form HTML
        var html = '';
        var parameters = opMeta.parameters || [];

        // Group parameters by location
        var paramsByLocation = {
            path: parameters.filter(function(p) { return p.in === 'path'; }),
            query: parameters.filter(function(p) { return p.in === 'query'; }),
            header: parameters.filter(function(p) { return p.in === 'header'; })
        };

        // Render parameter sections
        [
            { location: 'path', label: 'Path Parameters', params: paramsByLocation.path },
            { location: 'query', label: 'Query Parameters', params: paramsByLocation.query },
            { location: 'header', label: 'Header Parameters', params: paramsByLocation.header }
        ].forEach(function(section) {
            if (section.params.length > 0) {
                // Check if any parameter is required
                var hasRequired = section.params.some(function(p) { return p.required || false; });
                html += '<details class="wf-params-section"' + (hasRequired ? ' open' : '') + '>';
                html += '<summary>' + section.label + '</summary>';
                html += '<div class="wf-params-content">';

                section.params.forEach(function(param) {
                    var paramName = param.name || '';
                    var schema = param.schema || {};
                    var paramType = schema.type || 'string';
                    var required = param.required || false;
                    var xOrigin = param['x-origin'];
                    var description = param.description || '';

                    // Get value from YAML inputs or environment variables
                    var value = '';
                    if (yamlInputs[paramName]) {
                        var inputDef = yamlInputs[paramName];
                        if (inputDef.value !== undefined) {
                            value = inputDef.value;
                        }
                    }
                    if (!value && envMap[paramName]) {
                        value = envMap[paramName];
                    }
                    if (!value && schema.default) {
                        value = schema.default;
                    }

                    // Attach YAML input source for step-to-step resolution
                    var sourceAttr = '';
                    if (yamlInputs[paramName]) {
                        sourceAttr = ' data-wf-source="' + escapeAttr(JSON.stringify(yamlInputs[paramName])) + '"';
                    }
                    html += '<div class="wf-param-row"' + sourceAttr + '>';

                    // Label with x-origin support
                    if (xOrigin) {
                        var origins = Array.isArray(xOrigin) ? xOrigin : [xOrigin];
                        var originsJson = JSON.stringify(origins).replace(/"/g, '&quot;');
                        var sid = skillSlug + '-' + stepIndex;
                        html += '<label>';
                        html += '<span class="param-name-wrapper">';
                        html += '<code class="param-with-xorigin" ';
                        html += 'onclick="event.stopPropagation(); openXOriginModal(\'' + sid + '\', \'' + escapeHtml(paramName) + '\', \'' + section.location + '\'); return false;" ';
                        html += 'title="Click to fetch values from ' + origins.length + ' source(s)">';
                        html += escapeHtml(paramName) + '</code>';
                        if (required) html += '&nbsp;<span class="param-required" aria-label="required" title="Required">*</span>';
                        html += '</span>';
                        if (description) {
                            html += '<span class="param-info-wrapper" data-tooltip="' + escapeHtml(description) + '">';
                            html += '<span class="param-info-icon" aria-label="more-info"></span>';
                            html += '</span>';
                        }
                        html += '</label>';
                        html += '<input type="text" data-wf-param="' + escapeHtml(paramName) + '" ';
                        html += 'data-in="' + section.location + '" ';
                        html += 'data-x-origins="' + originsJson + '" ';
                        html += 'id="param-' + sid + '-' + escapeHtml(paramName) + '" ';
                        html += 'placeholder="' + escapeHtml(paramType) + '" ';
                        html += 'value="' + escapeHtml(value) + '"';
                        if (required) html += ' required';
                        html += '>';
                    } else if (schema.enum) {
                        // Enum dropdown
                        html += '<label>';
                        html += '<span class="param-name-wrapper">';
                        html += '<code>' + escapeHtml(paramName) + '</code>';
                        if (required) html += '&nbsp;<span class="param-required" aria-label="required" title="Required">*</span>';
                        html += '</span>';
                        if (description) {
                            html += '<span class="param-info-wrapper" data-tooltip="' + escapeHtml(description) + '">';
                            html += '<span class="param-info-icon" aria-label="more-info"></span>';
                            html += '</span>';
                        }
                        html += '</label>';
                        html += '<select data-wf-param="' + escapeHtml(paramName) + '" data-in="' + section.location + '"';
                        if (required) html += ' required';
                        html += '>';
                        schema.enum.forEach(function(enumVal) {
                            var selected = String(enumVal) === String(value) ? ' selected' : '';
                            html += '<option value="' + escapeHtml(String(enumVal)) + '"' + selected + '>';
                            html += escapeHtml(String(enumVal)) + '</option>';
                        });
                        html += '</select>';
                    } else {
                        // Regular text input
                        html += '<label>';
                        html += '<span class="param-name-wrapper">';
                        html += '<code>' + escapeHtml(paramName) + '</code>';
                        if (required) html += '&nbsp;<span class="param-required" aria-label="required" title="Required">*</span>';
                        html += '</span>';
                        if (description) {
                            html += '<span class="param-info-wrapper" data-tooltip="' + escapeHtml(description) + '">';
                            html += '<span class="param-info-icon" aria-label="more-info"></span>';
                            html += '</span>';
                        }
                        html += '</label>';
                        html += '<input type="text" data-wf-param="' + escapeHtml(paramName) + '" ';
                        html += 'data-in="' + section.location + '" ';
                        html += 'placeholder="' + escapeHtml(paramType) + '" ';
                        html += 'value="' + escapeHtml(value) + '"';
                        if (required) html += ' required';
                        html += '>';
                    }

                    html += '</div>';
                });

                html += '</div></details>';
            }
        });

        // Add custom query parameters section
        var sid = skillSlug + '-' + stepIndex;
        html += '<details class="wf-params-section try-custom-params">';
        html += '<summary>Custom Query Parameters</summary>';
        html += '<div class="wf-params-content">';
        html += '<div id="custom-query-wf-' + sid + '" class="custom-params-container"></div>';
        html += '<button type="button" class="btn-add-custom-param" onclick="addCustomParamWf(\'' + sid + '\', \'query\')">+ Add Query Parameter</button>';
        html += '</div>';
        html += '</details>';

        // Add custom headers section
        html += '<details class="wf-params-section try-custom-params">';
        html += '<summary>Custom Headers</summary>';
        html += '<div class="wf-params-content">';
        html += '<div id="custom-header-wf-' + sid + '" class="custom-params-container"></div>';
        html += '<button type="button" class="btn-add-custom-param" onclick="addCustomParamWf(\'' + sid + '\', \'header\')">+ Add Header</button>';
        html += '</div>';
        html += '</details>';

        // Render request body if present
        var requestBody = opMeta.requestBody;
        if (requestBody) {
            var sid = skillSlug + '-' + stepIndex;

            // Identify body fields from YAML inputs (inputs that aren't path/query/header params)
            var bodyFields = [];
            var bodyObj = {};
            for (var key in yamlInputs) {
                var inputDef = yamlInputs[key];
                var isParam = parameters.find(function(p) { return p.name === key; });
                if (isParam) continue;

                var fieldPath = key;
                if (fieldPath.indexOf('body.') === 0) {
                    fieldPath = fieldPath.substring(5);
                }
                bodyFields.push({key: key, fieldPath: fieldPath, def: inputDef});

                // Build initial body object from static values
                if (inputDef.value !== undefined) {
                    if (fieldPath.indexOf('.') >= 0 || fieldPath.indexOf('[') >= 0) {
                        setNestedValue(bodyObj, fieldPath, inputDef.value);
                    } else {
                        bodyObj[fieldPath] = tryParseJson(String(inputDef.value));
                    }
                }
            }

            // Render individual body field inputs
            if (bodyFields.length > 0) {
                html += '<details class="wf-body-section wf-body-fields" open>';
                html += '<summary>Request Body Fields</summary>';
                html += '<div class="wf-params-content">';

                bodyFields.forEach(function(bf) {
                    var value = '';
                    if (bf.def.value !== undefined) {
                        value = String(bf.def.value);
                    } else if (bf.def.example) {
                        value = '';  // Show as placeholder, not pre-filled
                    }

                    var sourceAttr = ' data-wf-source="' + escapeAttr(JSON.stringify(bf.def)) + '"';
                    var description = bf.def.description || '';
                    var isUserProvided = bf.def.userProvided || false;
                    var hasFrom = bf.def.from && typeof bf.def.from === 'object';

                    html += '<div class="wf-param-row"' + sourceAttr + '>';
                    html += '<label>';
                    html += '<span class="param-name-wrapper">';
                    html += '<code>' + escapeHtml(bf.fieldPath) + '</code>';
                    if (isUserProvided) html += '&nbsp;<span class="param-required" aria-label="user provided" title="User provided">*</span>';
                    html += '</span>';
                    if (description) {
                        html += '<span class="param-info-wrapper" data-tooltip="' + escapeHtml(description) + '">';
                        html += '<span class="param-info-icon" aria-label="more-info"></span>';
                        html += '</span>';
                    }
                    html += '</label>';

                    // Source hint
                    var hint = '';
                    if (hasFrom && bf.def.from.step) {
                        var target = bf.def.from.output || bf.def.from.input || '';
                        hint = 'from Step: ' + bf.def.from.step + (target ? ' → ' + target : '');
                    } else if (isUserProvided) {
                        hint = 'user provided';
                    } else if (bf.def.value !== undefined) {
                        hint = 'static value';
                    }

                    html += '<input type="text" data-wf-param="' + escapeHtml(bf.fieldPath) + '" ';
                    html += 'data-in="body" ';
                    html += 'placeholder="' + escapeHtml(bf.def.example || bf.fieldPath) + '" ';
                    html += 'value="' + escapeHtml(value) + '" ';
                    html += 'oninput="syncBodyFieldsToRaw(\'' + escapeAttr(sid) + '\')">';
                    if (hint) html += '<span class="wf-source-hint">' + escapeHtml(hint) + '</span>';
                    html += '</div>';
                });

                html += '</div></details>';
            }

            // Raw body textarea (advanced override)
            var bodyValue = '';
            if (Object.keys(bodyObj).length > 0) {
                bodyValue = JSON.stringify(bodyObj, null, 2);
            }

            html += '<details class="wf-body-section">';
            html += '<summary>Raw Body <code>application/json</code></summary>';
            html += '<div class="wf-body-content">';
            html += '<div id="wf-body-' + sid + '" class="wf-request-editor-cm" data-wf-param="__body__" data-example-body="' + escapeHtml(bodyValue) + '"></div>';
            html += '</div></details>';
        }

        formContainer.innerHTML = html;
        formContainer.setAttribute('data-rendered', 'true');

        // Initialize Ace editor for workflow body editor
        var bodyEditorEl = document.getElementById('wf-body-' + sid);
        if (bodyEditorEl && typeof ace !== 'undefined') {
            if (!window.aceEditors) {
                window.aceEditors = {};
            }
            var editor = ace.edit(bodyEditorEl, {
                mode: 'ace/mode/json',
                theme: 'ace/theme/textmate',
                value: bodyValue,
                minLines: 10,
                maxLines: 15,
                showPrintMargin: false,
                highlightActiveLine: true,
                showGutter: true,
                fontSize: '13px'
            });
            window.aceEditors['wf-body-' + sid] = editor;
        }
    });
}

function syncBodyFieldsToRaw(sid) {
    var panel = document.getElementById('wf-try-' + sid);
    if (!panel) return;
    var bodyEditor = getCodeMirrorEditor('wf-body-' + sid);
    if (!bodyEditor) return;

    var bodyObj = {};
    panel.querySelectorAll('[data-in="body"][data-wf-param]').forEach(function(input) {
        var fieldPath = input.getAttribute('data-wf-param');
        var value = input.value;
        if (!value) return;
        var parsed = tryParseJson(value);
        if (fieldPath.indexOf('.') >= 0 || fieldPath.indexOf('[') >= 0) {
            setNestedValue(bodyObj, fieldPath, parsed);
        } else {
            bodyObj[fieldPath] = parsed;
        }
    });

    var newContent = Object.keys(bodyObj).length > 0 ? JSON.stringify(bodyObj, null, 2) : '';
    bodyEditor.setValue(newContent, -1);
}

function toggleWorkflow(skillSlug) {
    var panels = document.querySelectorAll('[id^="wf-try-' + skillSlug + '-"]');
    if (!panels.length) return;

    var firstPanel = panels[0];
    var isHidden = firstPanel.style.display === 'none';

    panels.forEach(function(panel) {
        panel.style.display = isHidden ? 'block' : 'none';
    });

    if (isHidden) {
        initWorkflowContext(skillSlug);
        renderWorkflowStepForms(skillSlug);
        for (var i = 0; i < (workflowContexts[skillSlug].stepsData || []).length; i++) {
            resolveWorkflowInputs(skillSlug, i);
        }
    }
}

function injectMissingPathParams(skillSlug) {
    // For each step, check the operation path for {param} placeholders
    // that don't have a matching input field, and inject editable fields for them
    var ctx = workflowContexts[skillSlug];
    if (!ctx) return;
    var opLookup = window.__OP_LOOKUP__ || {};

    ctx.stepsData.forEach(function(stepData, i) {
        if (!stepData || !stepData.api || !stepData.operationId) return;
        var apiSlug = stepData.api.replace('urn:api:', '');
        var apiEntry = opLookup[apiSlug] || {};
        var opMeta = (apiEntry.ops || {})[stepData.operationId];
        if (!opMeta) return;

        var panel = document.getElementById('wf-try-' + skillSlug + '-' + i);
        if (!panel) return;

        // Find all {param} in the path
        var pathParams = (opMeta.path.match(/\{([^}]+)\}/g) || []).map(function(m) {
            return m.slice(1, -1);
        });

        // Check which are already covered by existing input fields
        var existingParams = new Set();
        panel.querySelectorAll('[data-wf-param]').forEach(function(input) {
            existingParams.add(input.getAttribute('data-wf-param'));
        });

        var missing = pathParams.filter(function(p) { return !existingParams.has(p); });
        if (missing.length === 0) return;

        // Find or create the inputs container
        var inputsDiv = panel.querySelector('.wf-inputs');
        if (!inputsDiv) {
            inputsDiv = document.createElement('div');
            inputsDiv.className = 'wf-inputs';
            inputsDiv.innerHTML = '<h5>Inputs</h5>';
            panel.insertBefore(inputsDiv, panel.firstChild);
        }

        // Add fields for missing path params (at the top)
        var h5 = inputsDiv.querySelector('h5');
        missing.forEach(function(paramName) {
            var row = document.createElement('div');
            row.className = 'wf-input-row';
            row.setAttribute('data-wf-source', '{}');
            row.innerHTML =
                '<label><code>' + escapeHtml(paramName) + '</code>' +
                '<span class="wf-source-hint">path parameter</span></label>' +
                '<input type="text" data-wf-param="' + escapeAttr(paramName) + '" placeholder="' + escapeAttr(paramName) + '">';
            if (h5 && h5.nextSibling) {
                inputsDiv.insertBefore(row, h5.nextSibling);
            } else {
                inputsDiv.appendChild(row);
            }
        });
    });
}

// --- JSONPath extraction (powered by jsonpath-plus) ---

function extractByPath(responseBody, path) {
    if (!path || !responseBody) return undefined;
    // Ensure path starts with $
    if (path.charAt(0) !== '$') path = '$.' + path;
    var result = JSONPath.JSONPath({path: path, json: responseBody, wrap: false});
    return result;
}

// --- Input resolution ---

function resolveWorkflowInputs(skillSlug, stepIndex) {
    var ctx = workflowContexts[skillSlug];
    if (!ctx) return;

    var panel = document.getElementById('wf-try-' + skillSlug + '-' + stepIndex);
    if (!panel) return;

    var envMap = getEnvVarsMap();
    var rows = panel.querySelectorAll('.wf-input-row, .wf-param-row');

    rows.forEach(function(row) {
        var input = row.querySelector('[data-wf-param]');
        if (!input) return;
        var paramName = input.getAttribute('data-wf-param');

        var sourceJson = row.getAttribute('data-wf-source');
        var source = {};
        if (sourceJson) {
            try { source = JSON.parse(sourceJson) || {}; } catch (e) {}
        }

        var resolved = null;
        var resolvedFrom = '';

        // 1. Static value
        if ('value' in source) {
            resolved = String(source.value);
            resolvedFrom = 'static';
        }

        // 2. From previous step
        if (source.from && typeof source.from === 'object' && source.from.step) {
            var stepName = source.from.step;
            var fromOutput = source.from.output;
            var fromInput = source.from.input;
            var field = source.from.field || '';

            // Find the step index by title
            var srcStepIdx = findStepByTitle(skillSlug, stepName);
            if (srcStepIdx >= 0 && ctx.stepResults[srcStepIdx]) {
                var srcResult = ctx.stepResults[srcStepIdx];
                var val = null;
                if (fromOutput && srcResult.outputs[fromOutput] !== undefined) {
                    val = srcResult.outputs[fromOutput];
                } else if (fromInput && srcResult.inputs[fromInput] !== undefined) {
                    val = srcResult.inputs[fromInput];
                }
                // Apply field navigation if present
                if (val != null && field) {
                    val = extractByPath(val, field);
                }
                if (val != null) {
                    resolved = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    resolvedFrom = 'step';
                }
            }
        }

        // 3. Environment variables (if not already resolved and matches by name)
        if (resolved == null && envMap[paramName]) {
            resolved = envMap[paramName];
            resolvedFrom = 'env';
        }

        // Apply resolved value
        if (resolved != null) {
            input.value = resolved;
            row.classList.add('wf-resolved');
        } else {
            row.classList.remove('wf-resolved');
        }
    });

    // Sync body field inputs to raw body textarea
    var sid = skillSlug + '-' + stepIndex;
    syncBodyFieldsToRaw(sid);
}

function findStepByTitle(skillSlug, stepName) {
    var ctx = workflowContexts[skillSlug];
    if (!ctx) return -1;
    for (var i = 0; i < ctx.stepsData.length; i++) {
        // The step YAML data doesn't have the title, but we can match from the DOM
        var card = document.getElementById('step-' + skillSlug + '-' + i);
        if (card) {
            var titleEl = card.querySelector('.skill-step-title');
            if (titleEl) {
                var title = titleEl.textContent.trim();
                // Match: "Step N: Title" pattern — stepName might be "Step N: Title" or just partial
                if (title === stepName || title.indexOf(stepName) >= 0 || stepName.indexOf(title) >= 0) {
                    return i;
                }
                // Also try matching without "Step N: " prefix
                var stripped = title.replace(/^Step \d+:\s*/, '');
                if (stripped === stepName || stepName === stripped) {
                    return i;
                }
            }
        }
    }
    return -1;
}

// --- Step execution ---

async function runWorkflowStep(skillSlug, stepIndex) {
    var ctx = workflowContexts[skillSlug];
    if (!ctx) {
        initWorkflowContext(skillSlug);
        ctx = workflowContexts[skillSlug];
    }

    var stepData = ctx.stepsData[stepIndex];
    if (!stepData || !stepData.api || !stepData.operationId) {
        showAuthMessage('Step has no API call defined.', true);
        return;
    }

    var sid = skillSlug + '-' + stepIndex;
    var panel = document.getElementById('wf-try-' + sid);
    if (!panel) return;

    // Collect input values by location
    var pathParams = {};
    var queryParams = {};
    var headerParams = {};
    var bodyFieldValues = {};
    var rawBodyContent = '';

    panel.querySelectorAll('[data-wf-param]').forEach(function(input) {
        var paramName = input.getAttribute('data-wf-param');
        var location = input.getAttribute('data-in');
        var value = input.value;

        // Check if this is an Ace editor
        if (paramName === '__body__' && input.classList.contains('wf-request-editor-cm')) {
            var bodyEditor = getCodeMirrorEditor(input.id);
            if (bodyEditor) {
                value = bodyEditor.getValue();
            } else {
                value = '';
            }
        }

        if (!value) return;

        if (paramName === '__body__') {
            rawBodyContent = value;
        } else if (location === 'body') {
            bodyFieldValues[paramName] = value;
        } else if (location === 'path') {
            pathParams[paramName] = value;
        } else if (location === 'query') {
            queryParams[paramName] = value;
        } else if (location === 'header') {
            headerParams[paramName] = value;
        }
    });

    // Build body from individual fields, falling back to raw textarea
    var bodyContent = '';
    if (Object.keys(bodyFieldValues).length > 0) {
        var bodyObj = {};
        for (var fieldPath in bodyFieldValues) {
            var val = tryParseJson(bodyFieldValues[fieldPath]);
            if (fieldPath.indexOf('.') >= 0 || fieldPath.indexOf('[') >= 0) {
                setNestedValue(bodyObj, fieldPath, val);
            } else {
                bodyObj[fieldPath] = val;
            }
        }
        bodyContent = JSON.stringify(bodyObj);
    } else if (rawBodyContent) {
        bodyContent = rawBodyContent;
    }

    ctx.stepResults[stepIndex].inputs = Object.assign({}, pathParams, queryParams, headerParams, bodyFieldValues);

    // Look up operation method + path + server
    var apiSlug = stepData.api.replace('urn:api:', '');
    var opLookup = window.__OP_LOOKUP__ || {};
    var apiEntry = opLookup[apiSlug] || {};
    var opMeta = (apiEntry.ops || {})[stepData.operationId];

    if (!opMeta) {
        showAuthMessage('Operation ' + stepData.operationId + ' not found in ' + apiSlug + ' spec.', true);
        return;
    }

    var method = opMeta.method;
    var pathTemplate = opMeta.path;

    // Substitute path parameters
    var path = pathTemplate;
    Object.keys(pathParams).forEach(function(name) {
        path = path.replace('{' + name + '}', encodeURIComponent(pathParams[name]));
    });

    // Fill any remaining {param} placeholders from env vars
    var envMap = getEnvVarsMap();
    var remaining = path.match(/\{([^}]+)\}/g);
    if (remaining) {
        remaining.forEach(function(placeholder) {
            var name = placeholder.slice(1, -1);
            if (envMap[name]) {
                path = path.replace(placeholder, encodeURIComponent(envMap[name]));
            }
        });
        // Check if there are still unfilled placeholders
        var stillMissing = path.match(/\{([^}]+)\}/g);
        if (stillMissing) {
            setWfStepStatus(skillSlug, stepIndex, 'error');
            showAuthMessage('Missing path parameters: ' + stillMissing.join(', ') + '. Fill them in the step inputs or environment variables.', true);
            return;
        }
    }

    // Build query string
    var queryString = '';
    var queryParts = [];
    Object.keys(queryParams).forEach(function(name) {
        queryParts.push(encodeURIComponent(name) + '=' + encodeURIComponent(queryParams[name]));
    });
    if (queryParts.length > 0) {
        queryString = '?' + queryParts.join('&');
    }

    // Use the step's API server, not the current page's server
    var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
    var fullUrl = serverUrl + path + queryString;

    // Prepare request body
    var requestBody = null;
    if (bodyContent) {
        requestBody = bodyContent;
    }
    // Ensure requestBody is always a string (not an object)
    if (requestBody !== null && typeof requestBody !== 'string') {
        requestBody = JSON.stringify(requestBody);
    }

    // Build headers
    var headers = Object.assign(
        {'Content-Type': 'application/json'},
        getAuthHeaders(),
        headerParams
    );

    // UI feedback
    setWfStepStatus(skillSlug, stepIndex, 'running');
    var spinner = document.getElementById('wf-spinner-' + sid);
    var rightPanel = document.getElementById('wf-right-' + sid);
    var statusBadge = document.getElementById('wf-respstatus-' + sid);
    var responseBodyEl = document.getElementById('wf-respbody-' + sid);
    var responseHeadersEl = document.getElementById('wf-respheaders-' + sid);
    var outputsTable = document.getElementById('wf-outtable-' + sid);

    if (spinner) spinner.style.display = 'inline';
    if (rightPanel) rightPanel.removeAttribute('open');

    try {
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: method,
                url: fullUrl,
                headers: headers,
                body: requestBody
            })
        });
        var data = await resp.json();

        if (spinner) spinner.style.display = 'none';
        if (rightPanel) rightPanel.setAttribute('open', '');

        if (data.error) {
            setWfStepStatus(skillSlug, stepIndex, 'error');
            if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.className = 'response-status-badge status-5xx'; }
            if (responseBodyEl) createReadOnlyAceEditor(responseBodyEl, data.error, 'text');
            return;
        }

        // Display status
        var status = data.status;
        var statusClass = 'status-' + String(status).charAt(0) + 'xx';
        if (statusBadge) { statusBadge.textContent = status; statusBadge.className = 'response-status-badge ' + statusClass; }

        // Display response body and headers
        displayResponseInAceEditors(responseBodyEl, responseHeadersEl, data);

        // Parse body for output extraction
        var parsedBody = null;
        try {
            parsedBody = JSON.parse(data.body || '{}');
        } catch (e) {}

        ctx.stepResults[stepIndex].response = parsedBody || data.body;

        // Extract outputs
        if (status >= 200 && status < 300 && parsedBody) {
            var outputDefs = [];
            try {
                outputDefs = JSON.parse(panel.getAttribute('data-wf-outputs') || '[]');
            } catch (e) {}

            var extractedOutputs = {};
            var fullArrayOutputs = {};
            var fullArrayLabels = {};

            outputDefs.forEach(function(outDef) {
                if (!outDef || !outDef.name) return;
                var value = extractByPath(parsedBody, outDef.path);

                if (Array.isArray(value) && value.length > 1) {
                    fullArrayOutputs[outDef.name] = value;
                    extractedOutputs[outDef.name] = value[0];

                    // Extract labels if a labels path is defined
                    if (outDef.labels) {
                        var labelVals = extractByPath(parsedBody, outDef.labels);
                        if (!Array.isArray(labelVals)) labelVals = labelVals != null ? [labelVals] : [];
                        if (labelVals.length === value.length) {
                            fullArrayLabels[outDef.name] = labelVals;
                        } else {
                            console.warn('Output labels count mismatch for "' + outDef.name + '": '
                                + labelVals.length + ' labels vs ' + value.length + ' values. Ignoring labels.');
                        }
                    }
                } else {
                    if (Array.isArray(value) && value.length === 1) {
                        value = value[0];
                    }
                    extractedOutputs[outDef.name] = value;
                }
            });

            ctx.stepResults[stepIndex]._fullArrayOutputs = fullArrayOutputs;
            ctx.stepResults[stepIndex].outputs = extractedOutputs;

            // Render outputs UI — one row per output, dropdowns for multi-value
            if (outputsTable) {
                var tbody = outputsTable.querySelector('tbody');
                if (!tbody) { tbody = document.createElement('tbody'); outputsTable.appendChild(tbody); }

                var html = '';
                outputDefs.forEach(function(outDef) {
                    if (!outDef || !outDef.name) return;
                    var name = outDef.name;
                    if (fullArrayOutputs[name]) {
                        html += renderOutputDropdownRow(sid, skillSlug, stepIndex, name, fullArrayOutputs[name], fullArrayLabels[name] || null);
                    } else {
                        var displayVal = extractedOutputs[name];
                        var displayStr = (displayVal != null && typeof displayVal === 'object') ? JSON.stringify(displayVal) : String(displayVal != null ? displayVal : '');
                        html += '<tr><td><code>' + escapeHtml(name) + '</code></td>'
                            + '<td><code class="wf-output-value">' + escapeHtml(displayStr.substring(0, 200)) + '</code></td></tr>';
                    }
                });

                tbody.innerHTML = html;
            }

            setWfStepStatus(skillSlug, stepIndex, 'done');

            // Auto-resolve next step inputs (and all subsequent steps)
            for (var nextIdx = stepIndex + 1; nextIdx < ctx.stepsData.length; nextIdx++) {
                resolveWorkflowInputs(skillSlug, nextIdx);
            }
        } else {
            setWfStepStatus(skillSlug, stepIndex, status >= 200 && status < 300 ? 'done' : 'error');
        }

    } catch (e) {
        if (spinner) spinner.style.display = 'none';
        if (rightPanel) rightPanel.setAttribute('open', '');
        setWfStepStatus(skillSlug, stepIndex, 'error');
        if (statusBadge) { statusBadge.textContent = 'Error'; statusBadge.className = 'response-status-badge status-5xx'; }
        if (responseBodyEl) responseBodyEl.textContent = 'Cannot reach proxy at ' + PROXY_URL + '.\nMake sure the proxy server is running:\n  python3 scripts/proxy_server.py';
    }
}

// --- Array output dropdown ---

function renderOutputDropdownRow(sid, skillSlug, stepIndex, outputName, values, labels) {
    var html = '<tr>';
    html += '<td><code>' + escapeHtml(outputName) + '</code></td>';
    html += '<td><select class="wf-output-select"'
        + ' data-skill="' + escapeAttr(skillSlug) + '"'
        + ' data-step="' + stepIndex + '"'
        + ' data-output-name="' + escapeAttr(outputName) + '">';
    values.forEach(function(val, i) {
        var valueStr = (val != null && typeof val === 'object') ? JSON.stringify(val) : String(val != null ? val : '');
        var labelStr = (labels && labels[i] != null) ? String(labels[i]) : null;
        var optionText;
        if (labelStr && labelStr !== valueStr) {
            optionText = '[' + i + '] ' + labelStr + ' (' + valueStr.substring(0, 60) + ')';
        } else {
            optionText = '[' + i + '] ' + valueStr.substring(0, 80);
        }
        html += '<option value="' + i + '"' + (i === 0 ? ' selected' : '') + '>' + escapeHtml(optionText) + '</option>';
    });
    html += '</select></td>';
    html += '</tr>';
    return html;
}

// Delegated change handler for output dropdowns
document.addEventListener('change', function(e) {
    var select = e.target.closest('select.wf-output-select');
    if (!select) return;

    var skillSlug = select.getAttribute('data-skill');
    var stepIndex = parseInt(select.getAttribute('data-step'), 10);
    var outputName = select.getAttribute('data-output-name');
    var selectedIndex = parseInt(select.value, 10);
    onOutputDropdownChanged(skillSlug, stepIndex, outputName, selectedIndex);
});

function onOutputDropdownChanged(skillSlug, stepIndex, outputName, selectedIndex) {
    var ctx = workflowContexts[skillSlug];
    if (!ctx || !ctx.stepResults[stepIndex]) return;

    var fullArrays = ctx.stepResults[stepIndex]._fullArrayOutputs || {};
    if (fullArrays[outputName] && selectedIndex < fullArrays[outputName].length) {
        ctx.stepResults[stepIndex].outputs[outputName] = fullArrays[outputName][selectedIndex];
    }

    // Re-resolve all subsequent step inputs
    for (var nextIdx = stepIndex + 1; nextIdx < ctx.stepsData.length; nextIdx++) {
        resolveWorkflowInputs(skillSlug, nextIdx);
    }
}

function switchWfTab(sid, tabName) {
    var rightPanel = document.getElementById('wf-right-' + sid);
    if (!rightPanel) return;

    // Update tab buttons
    var tabButtons = rightPanel.querySelectorAll('.wf-tab-btn');
    tabButtons.forEach(function(btn) {
        btn.classList.remove('active');
    });

    var activeButton = rightPanel.querySelector('.wf-tab-btn[onclick*="' + tabName + '"]');
    if (activeButton) activeButton.classList.add('active');

    // Update tab panels
    var tabPanels = rightPanel.querySelectorAll('.wf-tab-panel');
    tabPanels.forEach(function(panel) {
        panel.classList.remove('active');
    });

    var activePanel = document.getElementById('wf-tab-' + tabName + '-' + sid);
    if (activePanel) activePanel.classList.add('active');
}

// --- Helpers ---

function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function tryParseJson(str) {
    try { return JSON.parse(str); } catch (e) { return str; }
}

function highlightJson(json) {
    // Simple JSON syntax highlighting
    if (typeof json !== 'string') {
        json = JSON.stringify(json, null, 2);
    }

    // Replace special characters
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Highlight patterns
    return json
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, function(match) {
            var cls = 'json-key';
            if (match.charAt(match.length - 1) !== ':') {
                cls = 'json-string';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        })
        .replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>')
        .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
}

function setNestedValue(obj, path, value) {
    // Parse path that can contain dots and array indices
    // e.g., "configurationData.rateLimits[0].maximumRequests"
    var tokens = [];
    var current = '';

    for (var i = 0; i < path.length; i++) {
        var char = path[i];
        if (char === '.') {
            if (current) tokens.push({type: 'key', value: current});
            current = '';
        } else if (char === '[') {
            if (current) tokens.push({type: 'key', value: current});
            current = '';
            var endIndex = path.indexOf(']', i);
            if (endIndex > i) {
                tokens.push({type: 'index', value: parseInt(path.substring(i + 1, endIndex), 10)});
                i = endIndex;
            }
        } else if (char !== ']') {
            current += char;
        }
    }
    if (current) tokens.push({type: 'key', value: current});

    // Navigate/create the nested structure
    var target = obj;
    for (var j = 0; j < tokens.length - 1; j++) {
        var token = tokens[j];
        var nextToken = tokens[j + 1];

        if (token.type === 'key') {
            if (!target[token.value]) {
                target[token.value] = (nextToken.type === 'index') ? [] : {};
            }
            target = target[token.value];
        } else if (token.type === 'index') {
            while (target.length <= token.value) {
                target.push(null);
            }
            if (!target[token.value]) {
                target[token.value] = (nextToken.type === 'index') ? [] : {};
            }
            target = target[token.value];
        }
    }

    // Set the final value
    var lastToken = tokens[tokens.length - 1];
    if (lastToken.type === 'key') {
        target[lastToken.value] = tryParseJson(value);
    } else if (lastToken.type === 'index') {
        while (target.length <= lastToken.value) {
            target.push(null);
        }
        target[lastToken.value] = tryParseJson(value);
    }
}

// ============================================================================
// Tooltip system for [data-tooltip] elements
// ============================================================================

(function initTooltips() {
    var tip = null;

    function renderInlineMarkdown(text) {
        if (!text) return '';
        // Escape HTML first
        var safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // Render inline markdown: **bold**, *italic*, `code`
        safe = safe
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`([^`]+)`/g, '<code>$1</code>');
        // Convert newlines to <br>
        safe = safe.replace(/\n/g, '<br>');
        return safe;
    }

    function createTip() {
        var el = document.createElement('div');
        el.id = 'portal-tooltip';
        el.setAttribute('role', 'tooltip');
        el.style.cssText = [
            'position:fixed',
            'z-index:9999',
            'pointer-events:none',
            'opacity:0',
            'transition:opacity 0.15s ease',
            'max-width:300px',
            'padding:7px 11px',
            'border-radius:5px',
            'font-size:12px',
            'line-height:1.5',
            'word-break:break-word',
            'box-shadow:0 2px 10px rgba(0,0,0,0.28)',
        ].join(';');
        document.body.appendChild(el);
        return el;
    }

    function positionTip(anchorRect) {
        if (!tip) return;
        var MARGIN = 8;
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        var tw = tip.offsetWidth;
        var th = tip.offsetHeight;

        // Prefer above; fall back to below if not enough room
        var top = anchorRect.top - th - MARGIN;
        if (top < MARGIN) {
            top = anchorRect.bottom + MARGIN;
        }
        // Horizontally center on anchor, then clamp to viewport
        var left = anchorRect.left + anchorRect.width / 2 - tw / 2;
        left = Math.max(MARGIN, Math.min(left, vw - tw - MARGIN));

        tip.style.top = Math.round(top) + 'px';
        tip.style.left = Math.round(left) + 'px';
    }

    function showTip(el) {
        var text = el.getAttribute('data-tooltip');
        if (!text) return;
        if (!tip) tip = createTip();
        // Apply theme colors at show-time (CSS vars resolved then)
        var cs = getComputedStyle(document.documentElement);
        var bg = cs.getPropertyValue('--lume-color-neutral-10').trim() || '#1a1a2e';
        var fg = cs.getPropertyValue('--lume-color-neutral-1').trim() || '#fff';
        tip.style.background = bg;
        tip.style.color = fg;
        tip.innerHTML = renderInlineMarkdown(text);
        tip.style.opacity = '0';
        tip.style.display = 'block';
        // Position after paint so offsetWidth/Height are available
        requestAnimationFrame(function() {
            positionTip(el.getBoundingClientRect());
            tip.style.opacity = '1';
        });
    }

    function hideTip() {
        if (tip) {
            tip.style.opacity = '0';
        }
    }

    // Use event delegation on document so dynamically added icons work too
    document.addEventListener('mouseover', function(e) {
        var target = e.target.closest('[data-tooltip]');
        if (target) showTip(target);
    });
    document.addEventListener('mouseout', function(e) {
        var target = e.target.closest('[data-tooltip]');
        if (target) hideTip();
    });
    document.addEventListener('scroll', hideTip, true);
})();

// ============================================================================
// Auto-initialize all workflows on page load
// ============================================================================

(function autoInitWorkflows() {
    // Find all skill step containers and collect unique skill slugs
    var containers = document.querySelectorAll('.workflow-try-container');
    var slugs = {};
    containers.forEach(function(el) {
        var id = el.id || '';
        // id format: wf-try-<slug>-<stepIndex>
        var match = id.match(/^wf-try-(.+)-(\d+)$/);
        if (match) {
            slugs[match[1]] = true;
        }
    });

    var slugList = Object.keys(slugs);
    if (slugList.length === 0) return;

    slugList.forEach(function(slug) {
        initWorkflowContext(slug);
        renderWorkflowStepForms(slug);
        var ctx = workflowContexts[slug];
        if (ctx) {
            for (var i = 0; i < (ctx.stepsData || []).length; i++) {
                resolveWorkflowInputs(slug, i);
            }
        }
    });
})();

// Close send dropdown when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.btn-group-send')) {
        document.querySelectorAll('.send-dropdown-menu').forEach(function(dropdown) {
            dropdown.style.display = 'none';
        });
    }
});

// Initialize line numbers for request editors
function updateLineNumbers(textarea) {
    var lineNumbersDiv = textarea.parentElement.querySelector('.request-line-numbers');
    if (!lineNumbersDiv) return;

    var lines = textarea.value.split('\n').length;
    var lineNumbersHtml = '';
    for (var i = 1; i <= lines; i++) {
        lineNumbersHtml += i + '\n';
    }
    lineNumbersDiv.textContent = lineNumbersHtml;
}

// Sync scrolling between textarea and line numbers
function syncScroll(textarea) {
    var lineNumbersDiv = textarea.parentElement.querySelector('.request-line-numbers');
    if (lineNumbersDiv) {
        lineNumbersDiv.scrollTop = textarea.scrollTop;
    }
}

// Map content types to language classes for syntax highlighting
function getLanguageFromContentType(contentType) {
    if (!contentType) return 'json';

    var lower = contentType.toLowerCase();
    if (lower.includes('json')) return 'json';
    if (lower.includes('xml')) return 'xml';
    if (lower.includes('yaml') || lower.includes('yml')) return 'yaml';
    if (lower.includes('html')) return 'html';
    if (lower.includes('javascript')) return 'javascript';
    if (lower.includes('text/plain')) return 'none';

    // Default to JSON
    return 'json';
}

// Initialize all request editors with line numbers
document.addEventListener('DOMContentLoaded', function() {
    var requestEditors = document.querySelectorAll('.try-request-editor');
    requestEditors.forEach(function(textarea) {
        // Initial line numbers
        updateLineNumbers(textarea);

        // Get content type and add language class
        var contentType = textarea.getAttribute('data-content-type');
        var language = getLanguageFromContentType(contentType);
        textarea.classList.add('language-' + language);

        // Update line numbers on input
        textarea.addEventListener('input', function() {
            updateLineNumbers(textarea);
        });

        // Sync scroll
        textarea.addEventListener('scroll', function() {
            syncScroll(textarea);
        });
    });
});