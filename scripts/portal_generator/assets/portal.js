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

// Stack of x-origin modals for nested pickers
var xOriginModalStack = [];

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
        // Try Base64 decoding first (new format)
        if (originsJson.indexOf('[') !== 0 && originsJson.indexOf('{') !== 0) {
            originsJson = atob(originsJson);
        }
        origins = JSON.parse(originsJson);
    } catch (e) {
        console.error('Failed to parse x-origins:', e);
        console.error('Origins JSON:', originsJson);
        return;
    }

    // Hide current modal if one is open (nested modal)
    var modal = document.getElementById('xorigin-modal');
    if (modal && modal.style.display === 'flex') {
        modal.style.display = 'none';
    }

    // Push new modal context to stack
    xOriginModalStack.push({ opId: opId, paramName: paramName, location: location, origins: origins });

    var modal = document.getElementById('xorigin-modal');
    var title = document.getElementById('xorigin-modal-title');
    var body = document.getElementById('xorigin-modal-body');

    if (!modal || !title || !body) {
        console.error('X-Origin modal: Modal elements not found', { modal: !!modal, title: !!title, body: !!body });
        return;
    }

    title.textContent = 'Select a value for: ' + paramName;

    // Get operation lookup for parameter details
    var opLookup = window.__OP_LOOKUP__ || {};

    // Load environment variables to pre-fill form
    var envVars = loadEnvVars();
    var envVarsMap = {};
    envVars.forEach(function(v) {
        envVarsMap[v.name] = v.value;
    });

    // Build source selector dropdown (no execute button here - it's in the panel)
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

            // Panel header matching try-panel-header structure (title and Send in same row)
            var linkPrefix = window.__API_LINK_PREFIX__ || '';
            html += '<div class="try-panel-header">';

            // Left side: operationId as link (with xpath info if available)
            html += '<div class="xorigin-title-section">';
            html += '<a href="' + escapeHtml(linkPrefix + apiSlug + '.html#op-' + operationId) + '" target="_blank" class="xorigin-operation-link">';
            html += '<h4>' + escapeHtml(apiSlug) + '.' + escapeHtml(operationId) + '</h4>';
            html += '</a>';
            // Xpath expressions inline
            if (origin.values || origin.labels) {
                html += '<span class="xorigin-xpath-info">';
                if (origin.values) {
                    html += '<span class="xorigin-path-inline">';
                    html += '<span class="xorigin-path-label">values:</span>';
                    html += '<code class="xorigin-path-value">' + escapeHtml(origin.values) + '</code>';
                    html += '</span>';
                }
                if (origin.labels) {
                    html += '<span class="xorigin-path-inline">';
                    html += '<span class="xorigin-path-label">labels:</span>';
                    html += '<code class="xorigin-path-value">' + escapeHtml(origin.labels) + '</code>';
                    html += '</span>';
                }
                html += '</span>';
            }
            html += '</div>';

            // Right side: actions (spinner + send button + dropdown)
            html += '<div class="try-header-actions">';
            html += '<span class="try-spinner" id="spinner-xorigin-' + idx + '" style="display:none">Sending...</span>';
            html += '<button class="btn-send" onclick="executeXOriginSource(' + idx + ', this)">';
            html += '<img src="../assets/icons/send-icon.svg" alt="" width="13" height="11">';
            html += '<span>Send</span>';
            html += '</button>';
            html += '<button class="btn-copy-curl" onclick="copyCurlCommand(\'xorigin-' + idx + '\', this)">';
            html += '<img src="../assets/icons/copy-curl-icon.svg" alt="" width="13" height="13">';
            html += '<span>Copy cURL</span>';
            html += '</button>';
            html += '</div>';
            html += '</div>';

            // Operation URL bar (below header)
            html += '<div class="operation-url-bar-container">';
            html += buildUrlBarHtml(opMeta.method, xoriginServerUrl, opMeta.path, null);
            html += '</div>';

            // Use shared panel renderer for two-column layout (no execute button - it's in header)
            var xoriginOpId = 'xorigin-' + idx;
            html += renderOperationPanel(xoriginOpId, opMeta, {
                yamlInputs: envVarsMap,
                enableVariableRefs: false,
                slug: '',
                contextType: 'xorigin',
                showExecuteButton: false  // Button is in header now
            });
            // Extracted values will be shown in the "Extracted Values" tab of the response section
        }

        html += '</div>';
    });

    body.innerHTML = html;
    modal.style.display = 'flex';

    // Initialize ACE editors for request bodies
    initCodeMirrorEditors();

    // Focus trap: focus the first focusable element and store previous focus
    modal._previousFocus = document.activeElement;
    var firstFocusable = modal.querySelector('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
}

function closeXOriginModal() {
    // Pop current modal from stack
    xOriginModalStack.pop();

    var modal = document.getElementById('xorigin-modal');

    // If there's a parent modal in the stack, restore it
    if (xOriginModalStack.length > 0) {
        var parentModal = xOriginModalStack[xOriginModalStack.length - 1];
        // Reopen the parent modal
        reopenXOriginModal(parentModal);
    } else {
        // No parent modal, close completely
        modal.style.display = 'none';
        // Restore focus to the element that opened the modal
        if (modal._previousFocus) modal._previousFocus.focus();
    }
}

function reopenXOriginModal(modalContext) {
    var modal = document.getElementById('xorigin-modal');
    var title = document.getElementById('xorigin-modal-title');
    var body = document.getElementById('xorigin-modal-body');

    if (!modal || !title || !body) {
        console.error('X-Origin modal: Modal elements not found');
        return;
    }

    var opId = modalContext.opId;
    var paramName = modalContext.paramName;
    var origins = modalContext.origins;

    title.textContent = 'Select a value for: ' + paramName;

    // Get operation lookup for parameter details
    var opLookup = window.__OP_LOOKUP__ || {};

    // Load environment variables to pre-fill form
    var envVars = loadEnvVars();
    var envVarsMap = {};
    envVars.forEach(function(v) {
        envVarsMap[v.name] = v.value;
    });

    // Build source selector dropdown
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
    html += '</div>';

    // Build source containers
    origins.forEach(function(origin, idx) {
        var apiSlug = (origin.api || '').replace('urn:api:', '');
        var operationId = origin.operation || '';

        html += '<div class="xorigin-source" data-source-idx="' + idx + '" style="display:' + (idx === 0 ? 'block' : 'none') + '">';

        var apiEntry = opLookup[apiSlug];
        var opMeta = apiEntry ? apiEntry.ops[operationId] : null;

        if (opMeta) {
            var xoriginServerUrl = getServerForApi(apiSlug).replace(/\/$/, '');

            var linkPrefix = window.__API_LINK_PREFIX__ || '';
            html += '<div class="try-panel-header">';

            html += '<div class="xorigin-title-section">';
            html += '<a href="' + escapeHtml(linkPrefix + apiSlug + '.html#op-' + operationId) + '" target="_blank" class="xorigin-operation-link">';
            html += '<h4>' + escapeHtml(apiSlug) + '.' + escapeHtml(operationId) + '</h4>';
            html += '</a>';
            if (origin.values || origin.labels) {
                html += '<span class="xorigin-xpath-info">';
                if (origin.values) {
                    html += '<span class="xorigin-path-inline">';
                    html += '<span class="xorigin-path-label">values:</span>';
                    html += '<code class="xorigin-path-value">' + escapeHtml(origin.values) + '</code>';
                    html += '</span>';
                }
                if (origin.labels) {
                    html += '<span class="xorigin-path-inline">';
                    html += '<span class="xorigin-path-label">labels:</span>';
                    html += '<code class="xorigin-path-value">' + escapeHtml(origin.labels) + '</code>';
                    html += '</span>';
                }
                html += '</span>';
            }
            html += '</div>';

            html += '<div class="try-header-actions">';
            html += '<span class="try-spinner" id="spinner-xorigin-' + idx + '" style="display:none">Sending...</span>';
            html += '<button class="btn-send" onclick="executeXOriginSource(' + idx + ', this)">';
            html += '<img src="../assets/icons/send-icon.svg" alt="" width="13" height="11">';
            html += '<span>Send</span>';
            html += '</button>';
            html += '<button class="btn-copy-curl" onclick="copyCurlCommand(\'xorigin-' + idx + '\', this)">';
            html += '<img src="../assets/icons/copy-curl-icon.svg" alt="" width="13" height="13">';
            html += '<span>Copy cURL</span>';
            html += '</button>';
            html += '</div>';
            html += '</div>';

            html += '<div class="operation-url-bar-container">';
            html += buildUrlBarHtml(opMeta.method, xoriginServerUrl, opMeta.path, null);
            html += '</div>';

            var xoriginOpId = 'xorigin-' + idx;
            html += renderOperationPanel(xoriginOpId, opMeta, {
                yamlInputs: envVarsMap,
                enableVariableRefs: false,
                slug: '',
                contextType: 'xorigin',
                showExecuteButton: false
            });
        }

        html += '</div>';
    });

    body.innerHTML = html;
    modal.style.display = 'flex';

    // Initialize ACE editors
    initCodeMirrorEditors();
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

async function executeXOriginSource(sourceIdx, buttonEl) {
    // If sourceIdx not provided, get it from the selector
    if (sourceIdx === undefined) {
        var selector = document.getElementById('xorigin-source-selector');
        if (selector) {
            sourceIdx = parseInt(selector.value, 10);
        } else {
            sourceIdx = 0;
        }
    }

    var xoriginOpId = 'xorigin-' + sourceIdx;
    var sourceDiv = document.querySelector('.xorigin-source[data-source-idx="' + sourceIdx + '"]');
    var responseDiv = document.getElementById('response-' + xoriginOpId);
    var statusBadge = document.getElementById('status-' + xoriginOpId);
    var responseBodyDiv = document.getElementById('respbody-' + xoriginOpId);
    var responseHeadersDiv = document.getElementById('respheaders-' + xoriginOpId);
    var valuesOutputDiv = document.getElementById('xorigin-values-' + sourceIdx);

    if (!responseDiv) {
        console.error('Response div not found', { responseDiv: !!responseDiv, sourceIdx: sourceIdx });
        return;
    }

    // Button feedback
    var originalText = 'Send';
    if (buttonEl) {
        var textSpan = buttonEl.querySelector('span');
        if (textSpan) {
            originalText = textSpan.textContent;
            textSpan.textContent = 'Sending...';
        }
        buttonEl.disabled = true;
    }

    // Get the origin configuration from current modal context
    var currentModal = xOriginModalStack[xOriginModalStack.length - 1];
    if (!currentModal) {
        console.error('No current x-origin modal in stack');
        return;
    }
    var origins = currentModal.origins;
    var origin = origins[sourceIdx];

    // Check authentication
    var token = sessionStorage.getItem('anypoint_token');
    if (!token) {
        if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Please authenticate first.</div>';
        responseDiv.classList.remove('empty');
        return;
    }
    if (isTokenExpired()) {
        if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Token expired. Please re-authenticate.</div>';
        responseDiv.classList.remove('empty');
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
        if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">API "' + escapeHtml(apiSlug) + '" not found.</div>';
        responseDiv.classList.remove('empty');
        return;
    }

    var opMeta = apiEntry.ops[operationId];
    if (!opMeta) {
        if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Operation "' + escapeHtml(operationId) + '" not found.</div>';
        responseDiv.classList.remove('empty');
        return;
    }

    var method = opMeta.method;
    var pathTemplate = opMeta.path;

    // Collect parameters from input fields in the modal
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
        if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Missing required parameters: ' + escapeHtml(missingParams.join(', ')) + '</div>';
        responseDiv.classList.remove('empty');
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
        if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Missing path parameters: ' + escapeHtml(unresolvedParams.join(', ')) + '</div>';
        responseDiv.classList.remove('empty');
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

    // Update UI state
    if (responseDiv) responseDiv.classList.add('empty');

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

        // Restore button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) textSpan.textContent = originalText;
            buttonEl.disabled = false;
        }

        if (responseDiv) responseDiv.classList.remove('empty');

        // Update status badge
        if (statusBadge) {
            var statusClass = 'status-error';
            if (data.status >= 200 && data.status < 300) {
                statusClass = 'status-2xx';
            } else if (data.status >= 300 && data.status < 400) {
                statusClass = 'status-3xx';
            } else if (data.status >= 400 && data.status < 500) {
                statusClass = 'status-4xx';
            } else if (data.status >= 500) {
                statusClass = 'status-5xx';
            }
            statusBadge.className = 'response-status-badge ' + statusClass;
            statusBadge.textContent = data.status;
        }

        if (data.error) {
            if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Error: ' + escapeHtml(data.error) + '</div>';
            return;
        }

        if (data.status < 200 || data.status >= 300) {
            if (responseBodyDiv) responseBodyDiv.innerHTML = '<div class="xorigin-error">Request returned status ' + data.status + '</div>';
            return;
        }

        // Display response using shared function
        displayResponseInAceEditors(responseBodyDiv, responseHeadersDiv, data);

        // Parse response body for value extraction
        var body = null;
        try {
            body = JSON.parse(data.body || '{}');
        } catch (e) {
            console.warn('X-Origin: Response is not valid JSON, cannot extract values');
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

        // Show extracted values in the "Extracted Values" tab
        var extractedTab = document.getElementById('respextracted-xorigin-' + sourceIdx);
        if (extractedTab) {
            if (values.length > 0) {
                // Build array of items with name and id
                var items = values.map(function(val, valIdx) {
                    var valueStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    var labelStr = labels[valIdx] ? String(labels[valIdx]) : valueStr;
                    return {
                        name: labelStr,
                        id: valueStr,
                        index: valIdx
                    };
                });

                // Sort by name
                items.sort(function(a, b) {
                    return a.name.localeCompare(b.name);
                });

                var valuesHtml = '<div class="xorigin-values-section">';
                valuesHtml += '<table class="xorigin-values-table">';
                valuesHtml += '<thead><tr><th>Name</th><th>ID</th><th></th></tr></thead>';
                valuesHtml += '<tbody>';
                items.forEach(function(item) {
                    valuesHtml += '<tr>';
                    valuesHtml += '<td class="xorigin-name-cell">' + escapeHtml(item.name) + '</td>';
                    valuesHtml += '<td class="xorigin-id-cell"><code>' + escapeHtml(item.id) + '</code></td>';
                    valuesHtml += '<td class="xorigin-action-cell"><button class="btn-use-value" data-value="' + escapeHtml(item.id) + '" onclick="useXOriginValue(' + sourceIdx + ', ' + item.index + ', this.getAttribute(\'data-value\'))">Select</button></td>';
                    valuesHtml += '</tr>';
                });
                valuesHtml += '</tbody>';
                valuesHtml += '</table>';
                valuesHtml += '</div>';

                extractedTab.innerHTML = valuesHtml;
            } else {
                extractedTab.innerHTML = '<div class="xorigin-error">No values found at path: ' + escapeHtml(valuesPath) + '</div>';
            }
        }

    } catch (e) {
        // Restore button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) textSpan.textContent = originalText;
            buttonEl.disabled = false;
        }

        if (responseDiv) responseDiv.classList.remove('empty');
        if (statusBadge) {
            statusBadge.textContent = 'Error';
            statusBadge.className = 'response-status-badge status-error';
        }
        if (responseBodyDiv) {
            responseBodyDiv.innerHTML = '<div class="xorigin-error">Cannot reach proxy: ' + escapeHtml(e.message) + '</div>';
        }
    }
}

function useXOriginValue(sourceIdx, valueIdx, valueStr) {
    var displayVal = valueStr;

    // Get current modal context
    var currentModal = xOriginModalStack[xOriginModalStack.length - 1];
    if (!currentModal) {
        console.error('No current x-origin modal in stack');
        return;
    }

    var paramName = currentModal.paramName;

    // Set the value in the input
    var input = document.getElementById('param-' + currentModal.opId + '-' + paramName);
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

    // If this is the last modal in the stack (closing back to the original panel),
    // update all fields in the original panel with environment variable values
    var isClosingToOriginalPanel = xOriginModalStack.length === 1;
    if (isClosingToOriginalPanel) {
        // Get the root opId (the original Try it out panel)
        var rootOpId = currentModal.opId;
        updatePanelFieldsFromEnvVars(rootOpId);
    }

    // Close modal
    closeXOriginModal();

    // Show feedback
    showAuthMessage('Value set for ' + paramName + ': ' + displayVal + ' (added to environment variables)', false);
}

function updatePanelFieldsFromEnvVars(opId) {
    // Load all environment variables
    var vars = loadEnvVars();
    var envVarsMap = {};
    vars.forEach(function(v) {
        envVarsMap[v.name] = v.value;
    });

    // Find all parameter inputs in the panel (try regular API panel first, then playground)
    var panel = document.getElementById('try-' + opId);
    if (!panel) {
        panel = document.getElementById('playground-panel-' + opId);
    }
    if (!panel) return;

    var inputs = panel.querySelectorAll('[data-param]');
    inputs.forEach(function(input) {
        var paramName = input.getAttribute('data-param');
        // Only update if field is empty or doesn't have a variable reference
        var currentValue = input.value || '';
        var hasVarRef = currentValue && detectVariableReferences(currentValue).length > 0;

        if (!hasVarRef && envVarsMap[paramName] !== undefined && envVarsMap[paramName] !== '') {
            input.value = envVarsMap[paramName];
        }
    });
}

// Update all playground panels with current environment variables
function updateAllPlaygroundPanelsFromEnvVars() {
    var playgroundPanels = document.querySelectorAll('[id^="playground-panel-"]');
    playgroundPanels.forEach(function(panel) {
        var sid = panel.id.replace('playground-panel-', '');
        updatePanelFieldsFromEnvVars(sid);
    });
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

    // Update URL with current filter
    updateURLWithFilter(selectedType);
}

function updateURLWithFilter(filterType) {
    const url = new URL(window.location);
    if (filterType && filterType !== 'all') {
        url.searchParams.set('filter', filterType);
        localStorage.setItem('homepage-filter', filterType);
    } else {
        url.searchParams.delete('filter');
        localStorage.removeItem('homepage-filter');
    }
    console.log('Updating URL to:', url.toString());
    window.history.replaceState({}, '', url);
}

function getFilterFromURL() {
    const url = new URL(window.location);
    const urlFilter = url.searchParams.get('filter');

    // Priority: URL parameter > localStorage > default 'all'
    if (urlFilter) {
        return urlFilter;
    }

    const savedFilter = localStorage.getItem('homepage-filter');
    return savedFilter || 'all';
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

    const overview = document.getElementById('overview');

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
    }

    targetElement.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });

    // Update sidebar active state
    const navLinks = document.querySelectorAll('.nav-link');
    const navLink = document.querySelector('.nav-link[href="' + hash + '"]');
    if (navLink) {
        navLinks.forEach(l => l.classList.remove('active'));
        navLink.classList.add('active');
    }

    // Switch to Operations tab if viewing an operation
    if (targetId.startsWith('op-')) {
        switchSidebarTab('operations');
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

    // Initialize playground steps in skills
    initializePlaygroundSteps();

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

    // Initialize filter from URL on page load
    const urlFilter = getFilterFromURL();
    console.log('URL filter:', urlFilter);
    if (urlFilter !== 'all') {
        const targetTab = document.querySelector(`.hero-tab[data-filter="${urlFilter}"]`);
        console.log('Target tab:', targetTab);
        if (targetTab) {
            heroTabs.forEach(t => t.classList.remove('active'));
            targetTab.classList.add('active');
            filterByTags();
        }
    }

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

function switchAuthTab(tab) {
    var tabs = document.querySelectorAll('.auth-tab');
    var panels = document.querySelectorAll('.auth-tab-content');
    tabs.forEach(function(t) { t.classList.toggle('active', t.getAttribute('data-tab') === tab); });
    panels.forEach(function(p) { p.classList.remove('active'); });
    var targetId = tab === 'bearer' ? 'authTabBearer' : 'authTabOauth2';
    var target = document.getElementById(targetId);
    if (target) target.classList.add('active');
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

            // Update playground panels with any environment variables that may have been set
            if (typeof updateAllPlaygroundPanelsFromEnvVars === 'function') {
                updateAllPlaygroundPanelsFromEnvVars();
            }
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
        showAuthMessage('Please enter Client Id and Client Secret.', true);
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

            // Update playground panels with any environment variables that may have been set
            if (typeof updateAllPlaygroundPanelsFromEnvVars === 'function') {
                updateAllPlaygroundPanelsFromEnvVars();
            }
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

    // Update all playground panels with new environment variable values
    if (typeof updateAllPlaygroundPanelsFromEnvVars === 'function') {
        updateAllPlaygroundPanelsFromEnvVars();
    }
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
    // Dropdown lives on document.body (outside overflow:hidden on bar)
    var existing = document.querySelector('.server-dropdown');
    if (existing) {
        existing.remove();
        return;
    }
    closeAllServerDropdowns();

    var dropdown = document.createElement('div');
    dropdown.className = 'server-dropdown';

    // Position below the bar using viewport coordinates
    var rect = bar.getBoundingClientRect();
    dropdown.style.top = rect.bottom + 'px';
    dropdown.style.left = rect.left + 'px';

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

    document.body.appendChild(dropdown);
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

function copyCurlCommand(opId, buttonEl) {
    // Try to find regular API operation section first
    var section = document.getElementById('op-' + opId);
    var tryPanel = document.getElementById('try-' + opId);
    var method, pathTemplate, serverUrl;

    // If not found, check if this is a playground panel (format: skillSlug-stepIndex)
    if (!section || !tryPanel) {
        var playgroundPanel = document.getElementById('playground-panel-' + opId);
        if (!playgroundPanel) {
            console.error('Could not find operation or playground panel for:', opId);
            return;
        }

        // Get operation metadata from __OP_LOOKUP__
        var apiUrn = playgroundPanel.dataset.wfApi;
        var operationId = playgroundPanel.dataset.wfOperation;
        if (!apiUrn || !operationId) {
            console.error('Playground panel missing API or operation data');
            return;
        }

        var apiSlug = apiUrn.replace('urn:api:', '');
        var opLookup = window.__OP_LOOKUP__ || {};
        var apiEntry = opLookup[apiSlug];
        if (!apiEntry) {
            console.error('API not found in lookup:', apiSlug);
            return;
        }

        var opMeta = apiEntry.ops[operationId];
        if (!opMeta) {
            console.error('Operation not found in lookup:', operationId);
            return;
        }

        method = opMeta.method;
        pathTemplate = opMeta.path;
        serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
        tryPanel = playgroundPanel; // Use the playground panel as the input source
    } else {
        // Regular API operation page
        method = section.getAttribute('data-method');
        pathTemplate = section.getAttribute('data-path');
        serverUrl = getSelectedServer(opId).replace(/\/$/, '');
    }

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
        // Show "Copied" feedback on button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) {
                var originalText = textSpan.textContent;
                textSpan.textContent = 'Copied';

                setTimeout(function() {
                    textSpan.textContent = originalText;
                }, 1500);
            }
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

function copyCurlFromTerminal(button) {
    // Find the terminal-content element (the code block)
    var terminalWindow = button.closest('.terminal-window');
    if (!terminalWindow) return;

    var terminalContent = terminalWindow.querySelector('.terminal-content code');
    if (!terminalContent) return;

    // Get the text content (this will strip HTML tags)
    var curlCommand = terminalContent.textContent || terminalContent.innerText;

    // Copy to clipboard
    navigator.clipboard.writeText(curlCommand).then(function() {
        // Show "Copied" feedback
        var originalHTML = button.innerHTML;
        button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        button.style.color = '#04844B';

        // Reset after 1.5 seconds
        setTimeout(function() {
            button.innerHTML = originalHTML;
            button.style.color = '';
        }, 1500);
    }).catch(function(err) {
        console.error('Failed to copy cURL command:', err);
        alert('Failed to copy to clipboard. Please try again.');
    });
}

// ============================================================================
// Skill Actions Dropdown
// ============================================================================

function toggleSkillDropdown(slug) {
    var menu = document.getElementById('skill-dropdown-menu-' + slug);
    if (!menu) return;
    var toggle = menu.closest('.skill-split-btn').querySelector('.skill-split-toggle');

    // Close any other open skill dropdowns
    document.querySelectorAll('.skill-dropdown-menu').forEach(function(m) {
        if (m !== menu && m.style.display !== 'none') {
            m.style.display = 'none';
            var t = m.closest('.skill-split-btn').querySelector('.skill-split-toggle');
            if (t) t.setAttribute('aria-expanded', 'false');
        }
    });

    var isVisible = menu.style.display !== 'none';
    menu.style.display = isVisible ? 'none' : 'block';
    if (toggle) toggle.setAttribute('aria-expanded', isVisible ? 'false' : 'true');
}

function openInstallModal(slug) {
    var modal = document.getElementById('install-modal-' + slug);
    if (modal) modal.style.display = 'flex';
    _closeAllSkillDropdowns();
}

function closeInstallModal(slug) {
    var modal = document.getElementById('install-modal-' + slug);
    if (modal) modal.style.display = 'none';
}

function copyInstallFromModal(slug, buttonEl) {
    var codeEl = document.getElementById('install-cmd-' + slug);
    if (!codeEl) return;
    var command = codeEl.textContent;
    navigator.clipboard.writeText(command).then(function() {
        closeInstallModal(slug);
        // Show feedback on the main split button
        var actions = document.getElementById('skill-actions-' + slug);
        if (!actions) return;
        var mainBtn = actions.querySelector('.skill-split-main');
        if (!mainBtn) return;
        _showSkillCopiedFeedback(mainBtn);
    }).catch(function(err) {
        console.error('Failed to copy install command:', err);
    });
}

function copySkillContent(slug, buttonEl) {
    var url = '../skills/' + slug + '/SKILL.md';
    fetch(url).then(function(res) { return res.text(); }).then(function(content) {
        navigator.clipboard.writeText(content).then(function() {
            _showSkillCopiedFeedback(buttonEl);
        });
    }).catch(function(err) {
        console.error('Failed to copy skill content:', err);
    });
    _closeAllSkillDropdowns();
}

function _showSkillCopiedFeedback(buttonEl) {
    if (!buttonEl) return;
    var splitBtn = buttonEl.closest('.skill-split-btn');
    if (!splitBtn) return;
    var mainBtn = splitBtn.querySelector('.skill-split-main');
    if (!mainBtn) return;
    var label = mainBtn.querySelector('span');
    if (!label) return;
    var saved = label.textContent;
    label.textContent = 'Copied!';
    mainBtn.style.color = '#04844B';
    setTimeout(function() {
        label.textContent = saved;
        mainBtn.style.color = '';
    }, 1500);
}

function _closeAllSkillDropdowns() {
    document.querySelectorAll('.skill-dropdown-menu').forEach(function(m) {
        m.style.display = 'none';
        var splitBtn = m.closest('.skill-split-btn');
        if (splitBtn) {
            var t = splitBtn.querySelector('.skill-split-toggle');
            if (t) t.setAttribute('aria-expanded', 'false');
        }
    });
}

// Close skill dropdown on outside click
document.addEventListener('click', function(e) {
    if (!e.target.closest('.skill-split-btn')) {
        _closeAllSkillDropdowns();
    }
});

// ============================================================================
// Response Status Selector
// ============================================================================

function toggleStatusDropdown(opId) {
    var dropdown = document.getElementById('status-dropdown-' + opId);
    if (!dropdown) return;

    var isVisible = dropdown.style.display !== 'none';

    // Close all other status dropdowns first
    document.querySelectorAll('.status-dropdown-menu').forEach(function(d) {
        d.style.display = 'none';
    });

    if (!isVisible) {
        // Position the dropdown relative to the button
        var button = dropdown.previousElementSibling;
        if (button) {
            var rect = button.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + 4) + 'px';
            dropdown.style.right = (window.innerWidth - rect.right) + 'px';
        }
        dropdown.style.display = 'block';
    }
}

function selectResponseStatus(opId, status) {
    // Update the selected status display
    var selectedDisplay = document.getElementById('selected-status-' + opId);
    if (selectedDisplay) {
        var statusNum = String(status);
        var dotClass = 'status-dot-default';
        if (statusNum.startsWith('2')) {
            dotClass = 'status-dot-2xx';
        } else if (statusNum.startsWith('4')) {
            dotClass = 'status-dot-4xx';
        }

        selectedDisplay.innerHTML = '<span class="status-dot ' + dotClass + '"></span>' + escapeHtml(status);
    }

    // Hide all response content for this operation
    document.querySelectorAll('[id^="response-' + opId + '-"]').forEach(function(content) {
        content.style.display = 'none';
    });

    // Show the selected response content
    var selectedContent = document.getElementById('response-' + opId + '-' + status);
    if (selectedContent) {
        selectedContent.style.display = 'block';

        // Update content type badge
        var contentTypeBadge = document.getElementById('content-type-badge-' + opId);
        if (contentTypeBadge) {
            var contentTypesJson = selectedContent.getAttribute('data-content-types');
            if (contentTypesJson) {
                try {
                    var contentTypes = JSON.parse(contentTypesJson);
                    if (contentTypes && contentTypes.length > 0) {
                        if (contentTypes.indexOf('application/json') !== -1) {
                            contentTypeBadge.textContent = 'json';
                        } else {
                            contentTypeBadge.textContent = contentTypes[0].replace('application/', '').replace('text/', '');
                        }
                        contentTypeBadge.style.display = '';
                    } else {
                        contentTypeBadge.style.display = 'none';
                    }
                } catch (e) {
                    contentTypeBadge.style.display = 'none';
                }
            } else {
                contentTypeBadge.style.display = 'none';
            }
        }
    }

    // Close the dropdown
    var dropdown = document.getElementById('status-dropdown-' + opId);
    if (dropdown) {
        dropdown.style.display = 'none';
    }
}

// Close status dropdowns when clicking outside
document.addEventListener('click', function(event) {
    if (!event.target.closest('.response-status-selector')) {
        document.querySelectorAll('.status-dropdown-menu').forEach(function(d) {
            d.style.display = 'none';
        });
    }
});

// ============================================================================
// Nested Properties Toggle
// ============================================================================

function toggleNestedProps(id) {
    var nested = document.getElementById(id);
    if (!nested) return;

    var button = nested.previousElementSibling;
    while (button && !button.classList.contains('param-header')) {
        button = button.previousElementSibling;
    }
    if (button) {
        button = button.querySelector('.nested-prop-toggle');
    }

    if (nested.style.display === 'none' || nested.style.display === '') {
        nested.style.display = 'block';
        if (button) {
            button.classList.add('expanded');
        }
    } else {
        nested.style.display = 'none';
        if (button) {
            button.classList.remove('expanded');
        }
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
        return btn.textContent.toLowerCase().includes(tabName.toLowerCase());
    });
    if (activeTab) activeTab.classList.add('active');

    // Update content
    var bodyContent = document.getElementById('respbody-' + opId);
    var headersContent = document.getElementById('respheaders-' + opId);
    var extractedContent = document.getElementById('respextracted-' + opId);

    // Remove active class from all
    if (bodyContent) bodyContent.classList.remove('active');
    if (headersContent) headersContent.classList.remove('active');
    if (extractedContent) extractedContent.classList.remove('active');

    // Add active class to the selected tab
    if (tabName === 'body' && bodyContent) {
        bodyContent.classList.add('active');
    } else if (tabName === 'headers' && headersContent) {
        headersContent.classList.add('active');
    } else if (tabName === 'extracted' && extractedContent) {
        extractedContent.classList.add('active');
    }
}

async function sendRequest(opId, buttonEl) {
    console.log('[DEBUG] sendRequest called with opId:', opId);
    var section = document.getElementById('op-' + opId);
    if (!section) {
        console.error('[DEBUG] Section not found for opId:', opId);
        return;
    }

    var method = section.getAttribute('data-method');
    var pathTemplate = section.getAttribute('data-path');
    var tryPanel = document.getElementById('try-' + opId);
    if (!tryPanel) {
        console.error('[DEBUG] Try panel not found for opId:', opId);
        return;
    }
    console.log('[DEBUG] Found section and tryPanel');

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

    // UI feedback on button
    var originalText = 'Send';
    if (buttonEl) {
        var textSpan = buttonEl.querySelector('span');
        if (textSpan) {
            originalText = textSpan.textContent;
            textSpan.textContent = 'Sending...';
        }
        buttonEl.disabled = true;
    }

    var responseDiv = document.getElementById('response-' + opId);
    var statusBadge = document.getElementById('status-' + opId);
    var responseBody = document.getElementById('respbody-' + opId);
    var responseHeaders = document.getElementById('respheaders-' + opId);

    // Always show response area with 'empty' class before request
    // Override template's inline display:none
    console.log('[DEBUG] Response div before request:', responseDiv);
    console.log('[DEBUG] Response div display before:', responseDiv ? responseDiv.style.display : 'N/A');
    if (responseDiv) {
        responseDiv.classList.add('empty');
        responseDiv.style.display = 'block';  // Show the response area
        console.log('[DEBUG] Response div display after setting to block:', responseDiv.style.display);
        console.log('[DEBUG] Response div classes:', responseDiv.className);
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

        // Restore button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) textSpan.textContent = originalText;
            buttonEl.disabled = false;
        }

        console.log('[DEBUG] Response received successfully');
        if (responseDiv) {
            responseDiv.style.display = 'block';  // Keep response visible
            responseDiv.classList.remove('empty');
            console.log('[DEBUG] Response div after removing empty:', responseDiv.style.display, responseDiv.className);

            // Check dimensions and visibility
            var rect = responseDiv.getBoundingClientRect();
            var computedStyle = window.getComputedStyle(responseDiv);
            console.log('[DEBUG] Response div dimensions:', {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                overflow: computedStyle.overflow
            });
        }

        if (data.error) {
            console.error('[DEBUG] Error in response:', data.error);
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
        console.log('[DEBUG] About to display response in ACE editors');
        console.log('[DEBUG] responseBody element:', responseBody);
        console.log('[DEBUG] responseHeaders element:', responseHeaders);

        // Check responseBody visibility before
        if (responseBody) {
            var bodyRect = responseBody.getBoundingClientRect();
            var bodyComputed = window.getComputedStyle(responseBody);
            console.log('[DEBUG] responseBody BEFORE display:', {
                width: bodyRect.width,
                height: bodyRect.height,
                display: bodyComputed.display,
                hasActiveClass: responseBody.classList.contains('active')
            });
        }

        displayResponseInAceEditors(responseBody, responseHeaders, data);
        console.log('[DEBUG] Finished displaying response');

        // Check responseBody visibility after
        if (responseBody) {
            var bodyRect2 = responseBody.getBoundingClientRect();
            var bodyComputed2 = window.getComputedStyle(responseBody);
            console.log('[DEBUG] responseBody AFTER display:', {
                width: bodyRect2.width,
                height: bodyRect2.height,
                display: bodyComputed2.display,
                hasActiveClass: responseBody.classList.contains('active')
            });
        }

        // Scroll response into view
        if (responseDiv) {
            console.log('[DEBUG] Scrolling response into view');
            responseDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

    } catch (e) {
        // Restore button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) textSpan.textContent = originalText;
            buttonEl.disabled = false;
        }

        if (responseDiv) {
            responseDiv.style.display = 'block';  // Keep response visible
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

// Helper function to get appropriate ACE theme based on current theme
function getAceTheme() {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? 'ace/theme/monokai' : 'ace/theme/textmate';
}

// Helper function to update ACE editor background color
function updateAceEditorBackground(editor) {
    if (!editor || !editor.container) return;
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    // Remove hardcoded background, let theme handle it
    editor.container.style.backgroundColor = '';
}

// Function to update all ACE editors when theme changes
function updateAllAceEditors() {
    if (!window.aceEditors) return;
    var newTheme = getAceTheme();
    Object.keys(window.aceEditors).forEach(function(key) {
        var editor = window.aceEditors[key];
        if (editor && editor.setTheme) {
            editor.setTheme(newTheme);
            updateAceEditorBackground(editor);
        }
    });
}

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
            theme: getAceTheme(),
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
        editor.setTheme(getAceTheme());
        updateAceEditorBackground(editor);
        return editor;
    }

    // Clear container
    container.innerHTML = '';

    var editor = ace.edit(container, {
        mode: mode,
        theme: getAceTheme(),
        value: content || '',
        readOnly: true,
        showPrintMargin: false,
        highlightActiveLine: false,
        showGutter: true,
        fontSize: '13px'
    });

    // Use large minLines/maxLines to fill space
    editor.setOptions({
        minLines: 10,
        maxLines: 100
    });

    // Set read-only background
    updateAceEditorBackground(editor);

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

    // Update content-type badge if present
    if (data.headers && responseBodyContainer) {
        var opId = responseBodyContainer.id.replace('respbody-', '');
        var contentTypeBadge = document.getElementById('content-type-badge-' + opId);
        if (contentTypeBadge) {
            var contentType = data.headers['content-type'] || data.headers['Content-Type'] || '';
            if (contentType) {
                var mimeType = contentType.split(';')[0].trim();
                var shortType = mimeType.replace('application/', '').replace('text/', '');
                contentTypeBadge.textContent = shortType;
                contentTypeBadge.style.display = 'inline-block';
            }
        }
    }
}

// ============================================================================
// Shared Operation Panel Rendering
// Used in: Try-It-Out Expanded, X-Origin Modal, Playground Mode
// ============================================================================

/**
 * Renders a complete operation panel with form and response sections in a two-column layout
 * @param {string} opId - Operation identifier for generating unique IDs
 * @param {object} opMeta - Operation metadata (method, path, parameters, requestBody)
 * @param {object} options - Rendering options
 * @returns {string} HTML string for the complete operation panel
 */
function renderOperationPanel(opId, opMeta, options) {
    options = options || {};
    var showExecuteButton = options.showExecuteButton !== false;
    var executeButtonText = options.executeButtonText || 'Send';
    var executeButtonClick = options.executeButtonClick || '';
    var contextType = options.contextType || 'tryitout';
    var showTitle = options.showTitle || false;
    var titleText = options.titleText || '';

    var html = '';

    // Optional title header (for x-origin and playground)
    if (showTitle && titleText) {
        html += '<div class="operation-panel-title">';
        html += '<h4>' + escapeHtml(titleText) + '</h4>';
        html += '</div>';
    }

    // Two-column grid container
    html += '<div class="operation-panel-grid">';

    // Left column: Form
    html += '<div class="operation-panel-form">';
    html += renderOperationForm(opId, opMeta, options);

    // Execute buttons
    if (showExecuteButton) {
        html += '<div class="operation-panel-actions">';
        html += '<button class="btn-send" ' + (executeButtonClick ? 'onclick="' + executeButtonClick + ', this)"' : '') + '>';
        html += '<img src="../assets/icons/send-icon.svg" alt="" width="13" height="11">';
        html += '<span>' + executeButtonText + '</span>';
        html += '</button>';
        html += '<button class="btn-copy-curl" onclick="copyCurlCommand(\'' + opId + '\', this)">';
        html += '<img src="../assets/icons/copy-curl-icon.svg" alt="" width="13" height="13">';
        html += '<span>Copy cURL</span>';
        html += '</button>';
        html += '<span class="try-spinner" id="spinner-' + opId + '" style="display:none">Sending...</span>';
        html += '</div>';
    }

    html += '</div>'; // End form column

    // Right column: Response
    html += '<div class="operation-panel-response">';
    html += '<div class="try-response empty" id="response-' + opId + '" aria-live="polite">';
    html += '<div class="try-response-header">';
    html += '<h5>Response</h5>';
    html += '<div class="response-badges">';
    html += '<span class="response-status-badge" id="status-' + opId + '"></span>';
    html += '<span class="content-type-badge" id="content-type-badge-' + opId + '" style="display:none"></span>';
    html += '</div>';
    html += '</div>';
    html += '<div class="try-response-tabs">';

    // Add Extracted Values tab for x-origin context
    if (contextType === 'xorigin') {
        html += '<button class="try-tab-btn active" onclick="switchResponseTab(\'' + opId + '\', \'extracted\')">Extracted Values</button>';
        html += '<button class="try-tab-btn" onclick="switchResponseTab(\'' + opId + '\', \'body\')">Body</button>';
        html += '<button class="try-tab-btn" onclick="switchResponseTab(\'' + opId + '\', \'headers\')">Headers</button>';
    } else {
        html += '<button class="try-tab-btn active" onclick="switchResponseTab(\'' + opId + '\', \'body\')">Body</button>';
        html += '<button class="try-tab-btn" onclick="switchResponseTab(\'' + opId + '\', \'headers\')">Headers</button>';
    }

    html += '</div>';
    html += '<div class="try-response-content">';

    // Add Extracted Values content for x-origin context
    if (contextType === 'xorigin') {
        html += '<div class="try-response-extracted active" id="respextracted-' + opId + '"></div>';
        html += '<div class="try-response-body" id="respbody-' + opId + '"></div>';
    } else {
        html += '<div class="try-response-body active" id="respbody-' + opId + '"></div>';
    }

    html += '<div class="try-response-headers" id="respheaders-' + opId + '"></div>';
    html += '</div>';
    html += '</div>'; // End try-response
    html += '</div>'; // End response column

    html += '</div>'; // End grid

    return html;
}

/**
 * Renders an operation form with parameters and request body
 * @param {string} opId - Operation identifier for generating unique IDs
 * @param {object} opMeta - Operation metadata (method, path, parameters, requestBody)
 * @param {object} options - Rendering options
 * @returns {string} HTML string for the operation form
 */
// Helper function to detect variable references in a value
// Supports both {{variable}} and ${step.variable} formats
function detectVariableReferences(value) {
    var matches = [];

    // Match ${variableName} format
    var regex = /\$\{([^}]+)\}/g;
    var match;
    while ((match = regex.exec(value)) !== null) {
        var varName = match[1].trim();
        matches.push({ type: 'variable', varName: varName, fullMatch: match[0] });
    }

    return matches;
}

// Helper function to render value as plain text (no links)
function renderValueWithVariableLinks(value, slug) {
    // Ensure value is a string
    if (typeof value === 'object') {
        value = JSON.stringify(value);
    } else if (value == null) {
        value = '';
    } else {
        value = String(value);
    }

    // Just return escaped HTML, no links
    return escapeHtml(value);
}

// Helper function to render variable reference hints
function renderVariableReferenceHints(value, contextType, slug) {
    var varRefs = detectVariableReferences(value);
    if (varRefs.length === 0) return '';

    var html = '<div class="variable-references-hint">';
    html += '<span class="variable-ref-icon">🔗</span>';
    html += '<span class="variable-ref-text">References: ';
    varRefs.forEach(function(ref, idx) {
        if (idx > 0) html += ', ';

        // Just show as plain code text, no links
        var displayText = ref.type === 'step' ? (ref.stepName + '.' + ref.varName) : ref.varName;
        html += '<code>' + escapeHtml(displayText) + '</code>';
    });
    html += '</span>';
    html += '</div>';
    return html;
}

function renderOperationForm(opId, opMeta, options) {
    options = options || {};
    var yamlInputs = options.yamlInputs || {};
    var enableVariableRefs = options.enableVariableRefs || false;
    var slug = options.slug || '';
    var contextType = options.contextType || '';

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
            var hasRequired = section.params.some(function(p) { return p.required || false; });

            html += '<details class="try-params"' + (hasRequired ? ' open' : '') + '>';
            html += '<summary>' + section.label + '</summary>';
            html += '<div class="try-params-content">';

            section.params.forEach(function(param) {
                var paramName = param.name || '';
                var schema = param.schema || {};
                var ptype = schema.type || 'string';
                var required = param.required || false;
                var description = param.description || '';
                var defaultVal = schema.default || '';

                // Check if YAML provided a value
                var yamlValue = yamlInputs[paramName] || defaultVal;

                // If yamlValue is an object with a 'ref' property, extract the reference string
                if (typeof yamlValue === 'object' && yamlValue !== null) {
                    if (yamlValue.ref) {
                        yamlValue = yamlValue.ref;
                    } else if (yamlValue.value !== undefined) {
                        // Object has an explicit value property
                        yamlValue = yamlValue.value;
                    } else {
                        // Object without ref or value - likely just metadata (description, etc.)
                        // Use empty string so the input is blank and user can fill it in
                        yamlValue = '';
                    }
                } else if (yamlValue == null) {
                    yamlValue = '';
                } else {
                    yamlValue = String(yamlValue);
                }

                // If no YAML value, check environment variables
                if (!yamlValue && contextType === 'playground') {
                    var envVars = loadEnvVars();
                    var envVar = envVars.find(function(v) { return v.name === paramName; });
                    if (envVar && envVar.value) {
                        yamlValue = envVar.value;
                    }
                }

                html += '<div class="try-param-row">';

                // Check for x-origin
                var xOrigin = param['x-origin'];
                if (xOrigin) {
                    var origins = Array.isArray(xOrigin) ? xOrigin : [xOrigin];
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
                    // Input field with magnifier button wrapper
                    html += '<div class="param-input-with-xorigin">';
                    html += '<input type="text" data-param="' + escapeHtml(paramName) + '" data-in="' + section.location + '" ';
                    // Use Base64 encoding to avoid escaping issues
                    html += 'data-x-origins="' + btoa(JSON.stringify(origins)) + '" ';
                    html += 'id="param-' + opId + '-' + paramName + '" ';
                    html += 'placeholder="' + ptype + '" value="' + escapeHtml(yamlValue) + '"';
                    if (required) html += ' required';

                    var hasVarRef = false;
                    var substitutedValue = yamlValue;
                    // Add class if has variable references
                    if (contextType === 'playground' && slug && yamlValue && detectVariableReferences(yamlValue).length > 0) {
                        substitutedValue = substituteVariables(yamlValue, slug);
                        if (substitutedValue !== yamlValue) {
                            html += ' class="has-variable-ref"';
                            hasVarRef = true;
                        }
                    }

                    html += '>';
                    // Magnifier button
                    html += '<button type="button" class="btn-xorigin-search" ';
                    html += 'onclick="openXOriginModal(\'' + opId + '\', \'' + paramName + '\', \'' + section.location + '\'); return false;" ';
                    html += 'title="Fetch values from ' + origins.length + ' source(s)" aria-label="Search values">';
                    html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'+
                        '<path d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'+
                        '<path d="M14 14L10.65 10.65" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'+
                    '</svg>';
                    html += '</button>';
                    // Show resolved value in grey italic AFTER the button
                    if (hasVarRef && substitutedValue !== yamlValue) {
                        html += '<span class="variable-resolved-value">' + escapeHtml(substitutedValue) + '</span>';
                    }
                    html += '</div>';
                } else if (schema.enum) {
                    // Enum - dropdown
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
                    html += '<select data-param="' + escapeHtml(paramName) + '" data-in="' + section.location + '"';
                    if (required) html += ' required';
                    html += '>';
                    schema.enum.forEach(function(v) {
                        html += '<option value="' + escapeHtml(v) + '"';
                        if (String(v) === String(yamlValue)) html += ' selected';
                        html += '>' + escapeHtml(v) + '</option>';
                    });
                    html += '</select>';
                } else {
                    // Regular input
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

                    var hasVarRef2 = false;
                    var substitutedValue2 = yamlValue;
                    // Check if has variable references
                    if (contextType === 'playground' && slug && yamlValue && detectVariableReferences(yamlValue).length > 0) {
                        substitutedValue2 = substituteVariables(yamlValue, slug);
                        if (substitutedValue2 !== yamlValue) {
                            hasVarRef2 = true;
                        }
                    }

                    html += '<input type="text" data-param="' + escapeHtml(paramName) + '" data-in="' + section.location + '" ';
                    html += 'placeholder="' + ptype + '" value="' + escapeHtml(yamlValue) + '"';
                    if (required) html += ' required';
                    // Add class if has variable references
                    if (hasVarRef2) {
                        html += ' class="has-variable-ref"';
                    }
                    html += '>';

                    // Show resolved value in grey italic AFTER the input
                    if (hasVarRef2) {
                        html += '<span class="variable-resolved-value">' + escapeHtml(substitutedValue2) + '</span>';
                    }
                }

                html += '</div>';
            });

            html += '</div>';
            html += '</details>';
        }
    });

    // Custom Query Parameters
    html += '<details class="try-params try-custom-params">';
    html += '<summary>Custom Query Parameters</summary>';
    html += '<div class="try-params-content">';
    html += '<div id="custom-query-' + opId + '" class="custom-params-container"></div>';
    html += '<button type="button" class="btn-add-custom-param" onclick="addCustomParam(\'' + opId + '\', \'query\')">+ Add Query Parameter</button>';
    html += '</div>';
    html += '</details>';

    // Custom Headers
    html += '<details class="try-params try-custom-params">';
    html += '<summary>Custom Headers</summary>';
    html += '<div class="try-params-content">';
    html += '<div id="custom-header-' + opId + '" class="custom-params-container"></div>';
    html += '<button type="button" class="btn-add-custom-param" onclick="addCustomParam(\'' + opId + '\', \'header\')">+ Add Header</button>';
    html += '</div>';
    html += '</details>';

    // Request body (if present)
    if (opMeta.requestBody) {
        var rb = opMeta.requestBody;
        var contentTypes = rb.content_types || [];
        var ctDefault = contentTypes[0] || 'application/json';
        var exampleBody = opMeta._example_body || '';

        html += '<details class="try-body" open>';
        html += '<summary>Request Body <code>' + escapeHtml(ctDefault) + '</code></summary>';
        html += '<div class="try-body-content">';
        html += '<div id="body-' + opId + '" class="try-request-editor-cm" ';
        html += 'data-content-type="' + escapeHtml(ctDefault) + '" ';
        html += 'data-example-body="' + escapeHtml(exampleBody) + '"></div>';
        html += '</div>';
        html += '</details>';
    }

    return html;
}

// ============================================================================
// Playground Mode (Skills)
// ============================================================================

function toggleSkillMode(slug) {
    var toggle = document.getElementById('toggle-' + slug);
    var variablesSidebar = document.getElementById('variables-sidebar-' + slug);
    var isInteractive = toggle.getAttribute('aria-checked') === 'true';

    if (isInteractive) {
        // Switch to documentation mode (show curl)
        toggle.setAttribute('aria-checked', 'false');

        // Hide variables sidebar
        if (variablesSidebar) variablesSidebar.style.display = 'none';

        // Toggle all steps to show documentation view
        var docViews = document.querySelectorAll('.step-documentation-view');
        var interactiveViews = document.querySelectorAll('.step-interactive-view');

        docViews.forEach(function(view) { view.style.display = 'block'; });
        interactiveViews.forEach(function(view) { view.style.display = 'none'; });

        // Update URL to remove playground parameter
        var url = new URL(window.location);
        url.searchParams.delete('playground');
        window.history.replaceState({}, '', url);
    } else {
        // Switch to interactive mode (show operation runners)
        toggle.setAttribute('aria-checked', 'true');

        // Show variables sidebar
        if (variablesSidebar) variablesSidebar.style.display = 'block';

        // Toggle all steps to show interactive view
        var docViews = document.querySelectorAll('.step-documentation-view');
        var interactiveViews = document.querySelectorAll('.step-interactive-view');

        docViews.forEach(function(view) { view.style.display = 'none'; });
        interactiveViews.forEach(function(view) { view.style.display = 'block'; });

        // Update URL to add playground parameter
        var url = new URL(window.location);
        url.searchParams.set('playground', 'true');
        window.history.replaceState({}, '', url);

        // Initialize playground steps if not already done
        initializePlaygroundSteps();
    }
}

// Check URL parameter on page load to activate playground mode
document.addEventListener('DOMContentLoaded', function() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('playground') === 'true') {
        // Find the skill on this page and activate playground mode
        var skillSection = document.querySelector('.skill-detail');
        if (skillSection) {
            var skillId = skillSection.id;
            var slug = skillId.replace('skill-', '');
            // Trigger toggle programmatically
            setTimeout(function() {
                var toggle = document.getElementById('toggle-' + slug);
                if (toggle && toggle.getAttribute('aria-checked') !== 'true') {
                    toggleSkillMode(slug);
                }
            }, 100);
        }
    }
});

// Debugger state tracking
var debuggerState = {};

// Global variable store per skill slug
var skillVariables = {};

function startDebugger(slug) {
    console.log('Starting debugger for:', slug);

    // Initialize debugger state
    debuggerState[slug] = {
        currentStep: 0,
        isRunning: true,
        totalSteps: document.querySelectorAll('[id^="step-' + slug + '-"]').length,
        allStepsCompleted: false
    };

    // Switch UI to running state
    var runState = document.getElementById('debugger-run-' + slug);
    var runningState = document.getElementById('debugger-running-' + slug);
    if (runState) runState.style.display = 'none';
    if (runningState) runningState.style.display = 'flex';

    // Execute first step
    executeStepByIndex(slug, 0);
}

function cancelDebugger(slug) {
    console.log('Canceling debugger for:', slug);

    // Reset state and clear variables
    debuggerState[slug] = { isRunning: false };
    skillVariables[slug] = {};
    if (window.skillArrayVariables && window.skillArrayVariables[slug]) {
        window.skillArrayVariables[slug] = {};
    }

    // Switch UI back to initial state
    var runState = document.getElementById('debugger-run-' + slug);
    var runningState = document.getElementById('debugger-running-' + slug);
    if (runState) runState.style.display = 'block';
    if (runningState) runningState.style.display = 'none';

    // Clear variables table
    var tableBody = document.querySelector('#variables-table-' + slug + ' tbody');
    if (tableBody) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#9ca3af; padding:2rem 0.5rem;">No variables captured yet</td></tr>';
    }

    // Clear executing step display
    updateExecutingStepDisplay(slug, null);
}

function nextStep(slug) {
    var state = debuggerState[slug];
    if (!state || !state.isRunning) return;

    var nextIndex = state.currentStep + 1;
    if (nextIndex < state.totalSteps) {
        // Check if we can proceed (previous step must have succeeded)
        if (!canProceedToNextStep(slug, nextIndex)) {
            console.warn('Cannot proceed to next step - previous step failed');
            alert('Cannot proceed: previous step failed. Please fix the error before continuing.');
            return;
        }
        state.currentStep = nextIndex;
        executeStepByIndex(slug, nextIndex);

        // Check if we just executed the last step
        if (nextIndex === state.totalSteps - 1) {
            state.allStepsCompleted = true;
            console.log('Last step executed. Click Next again to finish.');
        }
    } else if (nextIndex >= state.totalSteps) {
        // Clicked Next after last step was executed
        if (state.allStepsCompleted) {
            console.log('All steps completed. Finishing debugger.');
            cancelDebugger(slug);
        }
    }
}

function previousStep(slug) {
    var state = debuggerState[slug];
    if (!state || !state.isRunning) return;

    var prevIndex = state.currentStep - 1;
    if (prevIndex >= 0) {
        state.currentStep = prevIndex;

        // Clean variables from future steps (time travel backwards)
        cleanFutureStepVariables(slug, prevIndex);

        scrollToStepByIndex(slug, prevIndex);

        // Update executing display for previous step
        var steps = document.querySelectorAll('[id^="step-' + slug + '-"]');
        if (prevIndex < steps.length) {
            var step = steps[prevIndex];
            var stepTitle = step.querySelector('.step-title');
            var stepName = 'Step ' + (prevIndex + 1);
            if (stepTitle) {
                stepName = stepTitle.textContent.trim();
                // Remove all "Step N:" prefixes (in case there are duplicates)
                stepName = stepName.replace(/^(?:Step \d+:\s*)+/, '');
            }
            updateExecutingStepDisplay(slug, stepName);
        }
    }
}

// Clean variables that were captured by steps after the current step
function cleanFutureStepVariables(slug, currentIndex) {
    console.log('Cleaning variables from steps after index:', currentIndex);

    var steps = document.querySelectorAll('[id^="step-' + slug + '-"]');
    var variablesToKeep = {};

    // Collect variables from steps 0 to currentIndex
    for (var i = 0; i <= currentIndex; i++) {
        var step = steps[i];
        var panel = step.querySelector('[id^="playground-panel-"]');
        if (!panel) continue;

        var outputsAttr = panel.getAttribute('data-wf-outputs');
        if (outputsAttr) {
            try {
                var outputs = JSON.parse(outputsAttr);
                if (Array.isArray(outputs)) {
                    outputs.forEach(function(output) {
                        if (output.name) variablesToKeep[output.name] = true;
                    });
                } else {
                    for (var varName in outputs) {
                        variablesToKeep[varName] = true;
                    }
                }
            } catch (e) {
                console.error('Error parsing outputs for step', i, e);
            }
        }
    }

    console.log('Variables to keep:', Object.keys(variablesToKeep));

    // Remove variables not in the keep list
    if (skillVariables[slug]) {
        for (var varName in skillVariables[slug]) {
            if (!variablesToKeep[varName]) {
                console.log('Removing variable:', varName);
                delete skillVariables[slug][varName];
            }
        }
    }

    // Also clean array variables
    if (window.skillArrayVariables && window.skillArrayVariables[slug]) {
        for (var varName in window.skillArrayVariables[slug]) {
            if (!variablesToKeep[varName]) {
                delete window.skillArrayVariables[slug][varName];
            }
        }
    }

    // Also clean array labels
    if (window.skillArrayLabels && window.skillArrayLabels[slug]) {
        for (var varName in window.skillArrayLabels[slug]) {
            if (!variablesToKeep[varName]) {
                delete window.skillArrayLabels[slug][varName];
            }
        }
    }

    // Update the variables table
    var tableBody = document.querySelector('#variables-table-' + slug + ' tbody');
    if (tableBody) {
        // Remove rows for deleted variables
        var rows = tableBody.querySelectorAll('tr[data-var-name]');
        rows.forEach(function(row) {
            var varName = row.getAttribute('data-var-name');
            if (!variablesToKeep[varName]) {
                row.remove();
            }
        });

        // Show "no variables" if table is empty
        if (tableBody.querySelectorAll('tr[data-var-name]').length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#9ca3af; padding:2rem 0.5rem;">No variables captured yet</td></tr>';
        }
    }

    // Update variable tooltips
    updateVariableTooltips(slug);
}

// Update the executing step display in variables panel
function updateExecutingStepDisplay(slug, stepName) {
    var variablesPanelHeader = document.querySelector('#variables-sidebar-' + slug + ' h4');
    if (variablesPanelHeader) {
        if (stepName) {
            variablesPanelHeader.innerHTML = 'Variables<div style="font-size: 0.75rem; font-weight: 400; color: #6b7280; margin-top: 0.25rem;">Executing: ' + escapeHtml(stepName) + '</div>';
        } else {
            variablesPanelHeader.textContent = 'Variables';
        }
    }
}

function executeStepByIndex(slug, index) {
    var steps = document.querySelectorAll('[id^="step-' + slug + '-"]');
    if (index < 0 || index >= steps.length) return;

    var step = steps[index];
    var panel = step.querySelector('[id^="playground-panel-"]');
    if (!panel) return;

    var sid = panel.id.replace('playground-panel-', '');

    // Get step title (remove "Step N:" prefix - may appear multiple times)
    var stepTitle = step.querySelector('.step-title');
    var stepName = 'Step ' + (index + 1);
    if (stepTitle) {
        stepName = stepTitle.textContent.trim();
        // Remove all "Step N:" prefixes (in case there are duplicates)
        stepName = stepName.replace(/^(?:Step \d+:\s*)+/, '');
    }

    // Update variables panel header with current step
    updateExecutingStepDisplay(slug, stepName);

    // Scroll to step
    step.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight step
    step.style.outline = '2px solid #0176D3';
    step.style.outlineOffset = '4px';
    setTimeout(function() {
        step.style.outline = '';
        step.style.outlineOffset = '';
    }, 1000);

    // Execute the step
    executePlaygroundStep(sid);
}

function scrollToStepByIndex(slug, index) {
    var steps = document.querySelectorAll('[id^="step-' + slug + '-"]');
    if (index < 0 || index >= steps.length) return;

    var step = steps[index];
    step.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Highlight step
    step.style.outline = '2px solid #0176D3';
    step.style.outlineOffset = '4px';
    setTimeout(function() {
        step.style.outline = '';
        step.style.outlineOffset = '';
    }, 1000);
}

// Scroll to the step that defines a variable
function scrollToVariableSource(slug, varName) {
    console.log('Scrolling to source of variable:', varName);

    var foundStep = null;

    // Look through all steps to find which one outputs this variable
    var playgroundSteps = document.querySelectorAll('[id^="step-' + slug + '-"]');

    playgroundSteps.forEach(function(stepWrapper) {
        var panel = stepWrapper.querySelector('[id^="playground-panel-"]');
        if (!panel) return;

        // Check if this step has outputs defined (these are the variables it captures)
        var outputsAttr = panel.getAttribute('data-wf-outputs');
        if (outputsAttr) {
            try {
                var outputs = JSON.parse(outputsAttr);
                // Check if this variable is in the outputs (handle both array and object format)
                if (Array.isArray(outputs)) {
                    for (var i = 0; i < outputs.length; i++) {
                        if (outputs[i].name === varName) {
                            foundStep = stepWrapper;
                            return;
                        }
                    }
                } else if (outputs && outputs[varName]) {
                    foundStep = stepWrapper;
                    return;
                }
            } catch (e) {
                console.error('Error parsing outputs:', e);
            }
        }
    });

    if (foundStep) {
        // Scroll to the step
        foundStep.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight the step briefly
        foundStep.style.outline = '3px solid #0176D3';
        foundStep.style.outlineOffset = '6px';
        foundStep.style.borderRadius = '8px';
        setTimeout(function() {
            foundStep.style.outline = '';
            foundStep.style.outlineOffset = '';
            foundStep.style.borderRadius = '';
        }, 2500);
    } else {
        // Variable source not found, just highlight variables panel
        var variablesPanel = document.getElementById('variables-sidebar-' + slug);
        if (variablesPanel) {
            variablesPanel.style.animation = 'highlight-pulse 1s ease';
            setTimeout(function() {
                variablesPanel.style.animation = '';
            }, 1000);
        }
    }
}

function initializePlaygroundSteps() {
    var playgroundPanels = document.querySelectorAll('[id^="playground-panel-"]');
    playgroundPanels.forEach(function(panel) {
        if (!panel.dataset.initialized) {
            var sid = panel.id.replace('playground-panel-', '');
            initializePlaygroundStep(sid);
        }
    });
}

function initializePlaygroundStep(sid) {
    var panel = document.getElementById('playground-panel-' + sid);
    if (!panel || panel.dataset.initialized) return;

    panel.dataset.initialized = 'true';

    var apiUrn = panel.dataset.wfApi;
    var operationId = panel.dataset.wfOperation;
    var inputsJson = panel.dataset.wfInputs;

    if (!apiUrn || !operationId) {
        panel.innerHTML = '<p>No API operation defined for this step</p>';
        return;
    }

    var apiSlug = apiUrn.replace('urn:api:', '');
    var opLookup = window.__OP_LOOKUP__ || {};
    var apiEntry = opLookup[apiSlug];

    if (!apiEntry) {
        panel.innerHTML = '<p>API not found: ' + apiSlug + '</p>';
        return;
    }

    var opMeta = apiEntry.ops[operationId];
    if (!opMeta) {
        panel.innerHTML = '<p>Operation not found: ' + operationId + '</p>';
        return;
    }

    // Parse YAML inputs
    var yamlInputs = {};
    try {
        yamlInputs = JSON.parse(inputsJson || '{}');
    } catch (e) {
        console.error('Failed to parse playground inputs:', e);
    }

    var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
    var linkPrefix = window.__API_LINK_PREFIX__ || '';

    // Get the slug from the panel's parent to enable variable reference links
    var skillSlug = '';
    var stepWrapper = panel.closest('[id^="step-"]');
    if (stepWrapper) {
        var stepId = stepWrapper.id;
        var match = stepId.match(/step-([^-]+)-/);
        if (match) skillSlug = match[1];
    }

    var html = '';

    // Header with title and Send button (matching try-panel-header structure)
    html += '<div class="try-panel-header">';

    // Left side: operationId as link
    html += '<a href="' + escapeHtml(linkPrefix + apiSlug + '.html#op-' + operationId) + '" target="_blank" class="playground-operation-link">';
    html += '<h4>' + escapeHtml(apiSlug) + '.' + escapeHtml(operationId) + '</h4>';
    html += '</a>';

    // Right side: actions (spinner + send button + dropdown)
    html += '<div class="try-header-actions">';
    html += '<span class="try-spinner" id="spinner-' + sid + '" style="display:none">Sending...</span>';
    html += '<button class="btn-send" onclick="executePlaygroundStep(\'' + sid + '\', this)">';
    html += '<img src="../assets/icons/send-icon.svg" alt="" width="13" height="11">';
    html += '<span>Send</span>';
    html += '</button>';
    html += '<button class="btn-copy-curl" onclick="copyCurlCommand(\'' + sid + '\', this)">';
    html += '<img src="../assets/icons/copy-curl-icon.svg" alt="" width="13" height="13">';
    html += '<span>Copy cURL</span>';
    html += '</button>';
    html += '</div>';
    html += '</div>';

    // Operation URL bar (after header)
    html += '<div class="operation-url-bar-container">';
    html += buildUrlBarHtml(opMeta.method, serverUrl, opMeta.path, null);
    html += '</div>';

    // Use shared panel renderer (no execute button - it's in header now)
    html += renderOperationPanel(sid, opMeta, {
        yamlInputs: yamlInputs,
        enableVariableRefs: true,
        slug: skillSlug,
        contextType: 'playground',
        showExecuteButton: false  // Button is in header now
    });

    panel.innerHTML = html;

    // Add blur event listeners to inputs to re-evaluate variables
    var inputs = panel.querySelectorAll('input[type="text"]');
    inputs.forEach(function(input) {
        input.addEventListener('blur', function() {
            // Re-evaluate variables when input loses focus
            if (skillSlug) {
                updateVariableTooltips(skillSlug);
            }
        });
    });

    // Initialize ACE editors
    setTimeout(function() {
        initCodeMirrorEditors();
    }, 0);
}

// Function to capture variables from API response
function captureVariablesFromResponse(panel, result) {
    if (!panel) return;

    var outputsJson = panel.dataset.wfOutputs;
    if (!outputsJson || outputsJson === '{}') return;

    var outputs = {};
    try {
        outputs = JSON.parse(outputsJson);
        console.log('Parsed outputs:', outputs);
    } catch (e) {
        console.error('Failed to parse outputs:', e);
        return;
    }

    // Get skill slug from panel ID
    var stepWrapper = panel.closest('[id^="step-"]');
    if (!stepWrapper) return;

    var stepId = stepWrapper.id;
    // Match step-<slug>-<step-index>
    var match = stepId.match(/^step-(.+)-(\d+)$/);
    if (!match) return;

    var slug = match[1];
    var stepIndex = parseInt(match[2]);
    var stepNumber = stepIndex + 1;

    // Get step title for source (remove all "Step N:" prefixes)
    var stepWrapper = panel.closest('[id^="step-"]');
    var stepTitle = stepWrapper ? stepWrapper.querySelector('.step-title') : null;
    var stepName = 'Step ' + stepNumber;
    if (stepTitle) {
        stepName = stepTitle.textContent.trim();
        // Remove all "Step N:" prefixes (in case there are duplicates)
        stepName = stepName.replace(/^(?:Step \d+:\s*)+/, '');
    }

    // Parse response body
    var responseBody = result.body;
    if (typeof responseBody === 'string') {
        try {
            responseBody = JSON.parse(responseBody);
        } catch (e) {
            console.error('Failed to parse response body:', e);
            return;
        }
    }

    console.log('Response body:', responseBody);

    // Extract variables using JSONPath-like simple extraction
    var capturedVars = {};

    // Handle array format: [{name: 'var1', path: '$.path', labels: '$.path'}, ...]
    if (Array.isArray(outputs)) {
        for (var i = 0; i < outputs.length; i++) {
            var outputDef = outputs[i];
            var varName = outputDef.name;
            var path = outputDef.path;
            var labelsPath = outputDef.labels; // Optional labels path

            console.log('Processing variable:', varName, 'Path:', path, 'Labels:', labelsPath);

            if (!varName || !path) {
                console.warn('Missing name or path in output definition:', outputDef);
                continue;
            }

            var value = extractValueByPath(responseBody, path);
            console.log('Extracted value for', varName, ':', value);

            if (value !== undefined) {
                capturedVars[varName] = value;

                // If labels path is provided, extract labels too
                if (labelsPath && Array.isArray(value)) {
                    var labels = extractValueByPath(responseBody, labelsPath);
                    console.log('Extracted labels for', varName, ':', labels);
                    if (labels && Array.isArray(labels)) {
                        // Store labels alongside values
                        if (!capturedVars.__labels__) {
                            capturedVars.__labels__ = {};
                        }
                        capturedVars.__labels__[varName] = labels;
                    }
                }
            }
        }
    } else {
        // Handle object format: {var1: '$.path', var2: {path: '$.path', labels: '$.path'}}
        for (var varName in outputs) {
            var pathConfig = outputs[varName];
            console.log('Processing variable:', varName, 'Path config:', pathConfig);

            // Handle both string paths and object configs
            var path;
            var labelsPath;
            if (typeof pathConfig === 'string') {
                path = pathConfig;
            } else if (typeof pathConfig === 'object' && pathConfig.path) {
                path = pathConfig.path;
                labelsPath = pathConfig.labels; // Optional labels path
            } else {
                console.warn('Invalid path config for', varName, ':', pathConfig);
                continue;
            }

            var value = extractValueByPath(responseBody, path);
            console.log('Extracted value for', varName, ':', value);
            if (value !== undefined) {
                capturedVars[varName] = value;

                // If labels path is provided, extract labels too
                if (labelsPath && Array.isArray(value)) {
                    var labels = extractValueByPath(responseBody, labelsPath);
                    console.log('Extracted labels for', varName, ':', labels);
                    if (labels && Array.isArray(labels)) {
                        // Store labels alongside values
                        if (!capturedVars.__labels__) {
                            capturedVars.__labels__ = {};
                        }
                        capturedVars.__labels__[varName] = labels;
                    }
                }
            }
        }
    }

    // Store variables globally for this skill
    if (!skillVariables[slug]) {
        skillVariables[slug] = {};
    }

    // Keep track of which variables are arrays (for table display)
    if (!window.skillArrayVariables) {
        window.skillArrayVariables = {};
    }
    if (!window.skillArrayVariables[slug]) {
        window.skillArrayVariables[slug] = {};
    }

    // Keep track of labels for array variables
    if (!window.skillArrayLabels) {
        window.skillArrayLabels = {};
    }
    if (!window.skillArrayLabels[slug]) {
        window.skillArrayLabels[slug] = {};
    }

    // Extract labels from captured vars if present
    var labelsMap = capturedVars.__labels__ || {};

    // For array variables, store the first element as the default selected value
    for (var varName in capturedVars) {
        if (varName === '__labels__') continue; // Skip the labels metadata

        var value = capturedVars[varName];
        if (Array.isArray(value) && value.length > 0) {
            // Store full array for dropdown display
            window.skillArrayVariables[slug][varName] = value;

            // Store labels if available
            if (labelsMap[varName]) {
                window.skillArrayLabels[slug][varName] = labelsMap[varName];
                console.log('Array variable', varName, '- storing labels:', labelsMap[varName]);
            }

            // Only set to first element if variable doesn't exist yet (preserve user selection)
            if (skillVariables[slug][varName] === undefined) {
                skillVariables[slug][varName] = value[0];
                console.log('Array variable', varName, '- storing first element as default:', value[0]);
            } else {
                console.log('Array variable', varName, '- preserving existing selection:', skillVariables[slug][varName]);
            }
        } else {
            skillVariables[slug][varName] = value;
        }
    }

    console.log('After assign, skillVariables[' + slug + ']:', skillVariables[slug]);

    // Update variables table with ALL accumulated variables
    // For array variables, pass the full array; for others, pass the value
    var tableVariables = {};
    for (var varName in skillVariables[slug]) {
        if (window.skillArrayVariables[slug][varName]) {
            // This is an array variable - show full array in dropdown
            tableVariables[varName] = window.skillArrayVariables[slug][varName];
        } else {
            // Regular variable
            tableVariables[varName] = skillVariables[slug][varName];
        }
    }
    updateVariablesTable(slug, tableVariables, stepName);

    // Update tooltips on all input fields with variable references
    updateVariableTooltips(slug);
}

// Update tooltips and resolved value displays on input fields that contain variable references
function updateVariableTooltips(slug) {
    console.log('=== updateVariableTooltips START ===');
    console.log('slug:', slug);
    console.log('skillVariables[' + slug + ']:', skillVariables[slug]);

    // Find all steps for this skill
    var steps = document.querySelectorAll('[id^="step-' + slug + '-"]');
    console.log('Found', steps.length, 'steps');

    steps.forEach(function(step, stepIndex) {
        console.log('Processing step', stepIndex);

        // Find the playground panel within this step
        var panel = step.querySelector('[id^="playground-panel-"]');
        if (!panel) {
            console.log('  No panel found in this step');
            return;
        }
        console.log('  Panel found:', panel.id);

        // Find ALL text inputs in this panel
        var allInputs = panel.querySelectorAll('input[type="text"]');
        console.log('  Found', allInputs.length, 'text inputs in panel');

        allInputs.forEach(function(input) {
            var value = input.value;
            var varRefs = detectVariableReferences(value);

            if (varRefs.length > 0) {
                console.log('Input has variable references:', value);
                var substitutedValue = substituteVariables(value, slug);
                console.log('  Substituted to:', substitutedValue);

                if (substitutedValue !== value) {
                    // Add the has-variable-ref class if not already present
                    if (!input.classList.contains('has-variable-ref')) {
                        input.classList.add('has-variable-ref');
                    }

                    // Update or create the resolved value span
                    var nextSibling = input.nextElementSibling;
                    if (nextSibling && nextSibling.classList.contains('variable-resolved-value')) {
                        console.log('  Updating existing span');
                        nextSibling.textContent = substitutedValue;
                    } else if (nextSibling && nextSibling.classList.contains('btn-xorigin-search')) {
                        // For x-origin fields, the button comes first, check after it
                        var spanAfterButton = nextSibling.nextElementSibling;
                        if (spanAfterButton && spanAfterButton.classList.contains('variable-resolved-value')) {
                            console.log('  Updating existing span after button');
                            spanAfterButton.textContent = substitutedValue;
                        } else {
                            // Create new span after the button
                            console.log('  Creating new span after button');
                            var span = document.createElement('span');
                            span.className = 'variable-resolved-value';
                            span.textContent = substitutedValue;
                            nextSibling.parentNode.insertBefore(span, nextSibling.nextSibling);
                        }
                    } else {
                        // Create new span
                        console.log('  Creating new span after input');
                        var span = document.createElement('span');
                        span.className = 'variable-resolved-value';
                        span.textContent = substitutedValue;
                        input.parentNode.insertBefore(span, input.nextSibling);
                    }
                } else {
                    // Variable not yet resolved
                    if (!input.classList.contains('has-variable-ref')) {
                        input.classList.add('has-variable-ref');
                    }
                }
            }
        });
    });
    console.log('=== updateVariableTooltips END ===\n');
}

// Substitute variable references in a value
function substituteVariables(value, slug) {
    if (!value || typeof value !== 'string') return value;

    var vars = skillVariables[slug] || {};
    var result = value;

    // Replace ${variableName} with actual values
    var regex = /\$\{([^}]+)\}/g;
    result = result.replace(regex, function(match, varName) {
        varName = varName.trim();
        if (varName in vars) {
            var varValue = vars[varName];
            // Convert to string if not already
            return typeof varValue === 'object' ? JSON.stringify(varValue) : String(varValue);
        }
        // Variable not found, return original
        console.warn('Variable not found:', varName);
        return match;
    });

    return result;
}

// Simple JSONPath-like extraction
function extractValueByPath(obj, path) {
    if (!path || !obj) return undefined;

    // Ensure path is a string
    if (typeof path !== 'string') {
        console.warn('Path is not a string:', path, 'Type:', typeof path);
        return undefined;
    }

    // Remove leading $. if present
    path = path.replace(/^\$\./, '');

    var parts = path.split('.');
    var current = obj;

    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];

        // Handle array wildcard like data[*].id
        var wildcardMatch = part.match(/^(.+)\[\*\]$/);
        if (wildcardMatch) {
            var arrayName = wildcardMatch[1];
            current = current[arrayName];
            if (!current || !Array.isArray(current)) return undefined;

            // If this is the last part, return the array itself
            if (i === parts.length - 1) {
                return current;
            }

            // Otherwise, collect the next property from each array element
            var remaining = parts.slice(i + 1);
            var results = [];
            for (var j = 0; j < current.length; j++) {
                var item = current[j];
                for (var k = 0; k < remaining.length; k++) {
                    if (item === undefined) break;
                    item = item[remaining[k]];
                }
                if (item !== undefined) {
                    results.push(item);
                }
            }
            return results.length > 0 ? results : undefined;
        }

        // Handle array indexing like items[0]
        var arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
        if (arrayMatch) {
            var arrayName = arrayMatch[1];
            var index = parseInt(arrayMatch[2]);
            current = current[arrayName];
            if (!current || !Array.isArray(current)) return undefined;
            current = current[index];
        } else {
            current = current[part];
        }

        if (current === undefined) return undefined;
    }

    return current;
}

// Update variables table with captured values
function updateVariablesTable(slug, variables, source) {
    console.log('=== updateVariablesTable START ===');
    console.log('slug:', slug);
    console.log('variables:', JSON.stringify(variables, null, 2));
    console.log('source:', source);

    var tableBody = document.querySelector('#variables-table-' + slug + ' tbody');
    if (!tableBody) {
        console.error('❌ Table body not found for slug:', slug);
        console.log('Looking for selector:', '#variables-table-' + slug + ' tbody');
        return;
    }
    console.log('✓ Table body found');

    // Clear "No variables" message if present
    var noVarsRow = tableBody.querySelector('.no-variables-row');
    if (noVarsRow) {
        console.log('Clearing "No variables" message');
        noVarsRow.remove();
    }

    // Count existing rows
    var existingRowsCount = tableBody.querySelectorAll('tr[data-var-name]').length;
    console.log('Existing rows in table:', existingRowsCount);

    // Add or update each variable
    var variableCount = 0;
    for (var varName in variables) {
        variableCount++;
        var value = variables[varName];
        console.log('Processing variable #' + variableCount + ':', varName, 'value:', value);

        // Check if variable already exists
        var existingRow = tableBody.querySelector('tr[data-var-name="' + varName + '"]');

        if (existingRow) {
            // Update existing row - update ONLY the value cell, keep original source
            console.log('  → Updating existing variable:', varName);
            renderVariableValue(existingRow.cells[1], value, varName, slug);
            console.log('  → Source remains:', existingRow.cells[2].textContent);
            // Do NOT update source - keep the original step that produced this variable
        } else {
            console.log('  → Adding NEW variable:', varName, 'with source:', source);
            // Add new row
            var row = document.createElement('tr');
            row.className = 'variable-row';
            row.setAttribute('data-var-name', varName);

            var nameCell = document.createElement('td');
            nameCell.textContent = varName;
            nameCell.style.fontFamily = 'var(--font-mono)';
            nameCell.style.fontWeight = '600';

            var valueCell = document.createElement('td');
            valueCell.style.fontFamily = 'var(--font-mono)';
            valueCell.style.fontSize = '0.8125rem';
            renderVariableValue(valueCell, value, varName, slug);

            var sourceCell = document.createElement('td');
            sourceCell.textContent = source;
            sourceCell.style.fontSize = '0.75rem';
            sourceCell.style.color = '#6b7280';

            var actionsCell = document.createElement('td');
            actionsCell.innerHTML = '<button class="btn-delete-variable" onclick="deleteVariable(\'' + slug + '\', \'' + varName + '\')" title="Delete variable">✕</button>';

            row.appendChild(nameCell);
            row.appendChild(valueCell);
            row.appendChild(sourceCell);
            row.appendChild(actionsCell);

            tableBody.appendChild(row);
            console.log('  → Row appended to table');
        }
    }

    // Count final rows
    var finalRowsCount = tableBody.querySelectorAll('tr[data-var-name]').length;
    console.log('Final rows in table:', finalRowsCount);
    console.log('=== updateVariablesTable END ===');
}

// Render variable value based on its type
function renderVariableValue(cell, value, varName, slug) {
    cell.innerHTML = '';

    if (Array.isArray(value)) {
        // Array: render as dropdown with indices
        var select = document.createElement('select');
        select.className = 'variable-array-select';

        // Check if labels are available for this variable
        var labels = null;
        if (window.skillArrayLabels && window.skillArrayLabels[slug] && window.skillArrayLabels[slug][varName]) {
            labels = window.skillArrayLabels[slug][varName];
        }

        for (var i = 0; i < value.length; i++) {
            var option = document.createElement('option');
            var itemValue = value[i];
            var itemStr = typeof itemValue === 'object' ? JSON.stringify(itemValue) : String(itemValue);
            option.value = itemStr;

            // Format: [index] Label (value) if labels available, otherwise [index] value
            var displayText = '[' + i + '] ';
            if (labels && labels[i]) {
                var labelStr = String(labels[i]);
                // Truncate label to fit in 185px width (roughly 20 chars for label + ID)
                var truncatedLabel = labelStr.length > 15 ? labelStr.substring(0, 15) + '...' : labelStr;
                var truncatedValue = itemStr.length > 8 ? itemStr.substring(0, 8) + '...' : itemStr;
                displayText += truncatedLabel + ' (' + truncatedValue + ')';
            } else {
                // Without labels, show more of the value
                displayText += (itemStr.length > 25 ? itemStr.substring(0, 25) + '...' : itemStr);
            }
            option.textContent = displayText;
            option.setAttribute('title', '[' + i + '] ' + (labels && labels[i] ? labels[i] + ' (' + itemStr + ')' : itemStr));
            select.appendChild(option);
        }

        // Store the full array and selection state
        select.setAttribute('data-var-name', varName);
        select.setAttribute('data-var-array', JSON.stringify(value));
        select.setAttribute('data-slug', slug);

        // Add change handler to update variable store and refresh displays
        select.onchange = function() {
            var selectedIndex = this.selectedIndex;
            var arrayData = JSON.parse(this.getAttribute('data-var-array'));
            var varName = this.getAttribute('data-var-name');
            var slug = this.getAttribute('data-slug');

            // Store selected value (not array) in skillVariables
            if (skillVariables[slug]) {
                skillVariables[slug][varName] = arrayData[selectedIndex];
                console.log('Array selection changed:', varName, '→', arrayData[selectedIndex]);

                // Update all input tooltips to reflect new value
                updateVariableTooltips(slug);
            }
        };

        // Restore previously selected value if it exists in skillVariables
        if (skillVariables[slug] && skillVariables[slug][varName] !== undefined) {
            var currentValue = skillVariables[slug][varName];
            // Find the index that matches the current value
            for (var j = 0; j < value.length; j++) {
                var itemValue = value[j];
                var itemStr = typeof itemValue === 'object' ? JSON.stringify(itemValue) : String(itemValue);
                var currentStr = typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue);
                if (itemStr === currentStr) {
                    select.selectedIndex = j;
                    console.log('Restored selection for', varName, 'to index', j);
                    break;
                }
            }
        }

        cell.appendChild(select);
    } else if (typeof value === 'object' && value !== null) {
        // Object: render as expandable tree view
        var treeContainer = document.createElement('div');
        treeContainer.className = 'variable-tree-view';
        treeContainer.style.fontSize = '0.8125rem';

        var toggleBtn = document.createElement('button');
        toggleBtn.textContent = '▶';
        toggleBtn.className = 'tree-toggle-btn';
        toggleBtn.style.border = 'none';
        toggleBtn.style.background = 'none';
        toggleBtn.style.cursor = 'pointer';
        toggleBtn.style.padding = '0 0.25rem';
        toggleBtn.style.fontFamily = 'monospace';

        var summary = document.createElement('span');
        summary.textContent = '{...}';
        summary.style.color = '#6b7280';

        var treeContent = document.createElement('div');
        treeContent.className = 'tree-content';
        treeContent.style.display = 'none';
        treeContent.style.marginLeft = '1rem';
        treeContent.style.marginTop = '0.25rem';
        treeContent.style.borderLeft = '2px solid #e5e7eb';
        treeContent.style.paddingLeft = '0.5rem';

        // Build tree structure
        renderObjectTree(treeContent, value, 0);

        toggleBtn.onclick = function() {
            if (treeContent.style.display === 'none') {
                treeContent.style.display = 'block';
                toggleBtn.textContent = '▼';
            } else {
                treeContent.style.display = 'none';
                toggleBtn.textContent = '▶';
            }
        };

        treeContainer.appendChild(toggleBtn);
        treeContainer.appendChild(summary);
        treeContainer.appendChild(treeContent);
        cell.appendChild(treeContainer);
    } else {
        // Primitive value: render as text with tooltip
        var valueStr = String(value);
        cell.textContent = valueStr;
        // Add tooltip if value is long (more than 30 characters)
        if (valueStr.length > 30) {
            cell.setAttribute('title', valueStr);
        }
    }
}

// Recursively render object tree
function renderObjectTree(container, obj, depth) {
    if (depth > 5) {
        container.textContent = '... (max depth reached)';
        return;
    }

    for (var key in obj) {
        var value = obj[key];
        var line = document.createElement('div');
        line.style.marginBottom = '0.125rem';

        var keySpan = document.createElement('span');
        keySpan.textContent = key + ': ';
        keySpan.style.color = '#059669';
        keySpan.style.fontWeight = '600';
        line.appendChild(keySpan);

        if (Array.isArray(value)) {
            var valueSpan = document.createElement('span');
            valueSpan.textContent = '[Array(' + value.length + ')]';
            valueSpan.style.color = '#6b7280';
            line.appendChild(valueSpan);
        } else if (typeof value === 'object' && value !== null) {
            var nestedToggle = document.createElement('button');
            nestedToggle.textContent = '▶';
            nestedToggle.style.border = 'none';
            nestedToggle.style.background = 'none';
            nestedToggle.style.cursor = 'pointer';
            nestedToggle.style.padding = '0 0.25rem';
            nestedToggle.style.fontFamily = 'monospace';
            nestedToggle.style.fontSize = '0.75rem';

            var nestedSummary = document.createElement('span');
            nestedSummary.textContent = '{...}';
            nestedSummary.style.color = '#6b7280';

            var nestedContent = document.createElement('div');
            nestedContent.style.display = 'none';
            nestedContent.style.marginLeft = '1rem';
            nestedContent.style.borderLeft = '1px solid #e5e7eb';
            nestedContent.style.paddingLeft = '0.5rem';
            nestedContent.style.marginTop = '0.25rem';

            renderObjectTree(nestedContent, value, depth + 1);

            nestedToggle.onclick = function(content, btn, summary) {
                return function() {
                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        btn.textContent = '▼';
                    } else {
                        content.style.display = 'none';
                        btn.textContent = '▶';
                    }
                };
            }(nestedContent, nestedToggle, nestedSummary);

            line.appendChild(nestedToggle);
            line.appendChild(nestedSummary);
            line.appendChild(nestedContent);
        } else {
            var valueSpan = document.createElement('span');
            valueSpan.textContent = String(value);
            valueSpan.style.color = typeof value === 'string' ? '#dc2626' : '#2563eb';
            line.appendChild(valueSpan);
        }

        container.appendChild(line);
    }
}

async function executePlaygroundStep(sid, buttonEl) {
    var panel = document.getElementById('playground-panel-' + sid);
    if (!panel) return;

    var apiUrn = panel.dataset.wfApi;
    var operationId = panel.dataset.wfOperation;
    var apiSlug = apiUrn.replace('urn:api:', '');

    // Extract skill slug from sid (format: skillSlug-stepIndex)
    var skillSlug = sid.substring(0, sid.lastIndexOf('-'));

    var opLookup = window.__OP_LOOKUP__ || {};
    var apiEntry = opLookup[apiSlug];
    if (!apiEntry) {
        console.error('API not found:', apiSlug);
        markStepFailed(skillSlug, sid);
        return;
    }

    var opMeta = apiEntry.ops[operationId];
    if (!opMeta) {
        console.error('Operation not found:', operationId);
        markStepFailed(skillSlug, sid);
        return;
    }

    // Get UI elements
    var responseDiv = document.getElementById('response-' + sid);
    var statusBadge = document.getElementById('status-' + sid);
    var responseBodyDiv = document.getElementById('respbody-' + sid);
    var responseHeadersDiv = document.getElementById('respheaders-' + sid);

    // Button feedback
    var originalText = 'Send';
    if (buttonEl) {
        var textSpan = buttonEl.querySelector('span');
        if (textSpan) {
            originalText = textSpan.textContent;
            textSpan.textContent = 'Sending...';
        }
        buttonEl.disabled = true;
    }

    if (responseDiv) responseDiv.classList.add('empty');

    try {
        // Collect parameters
        var pathParams = {};
        var queryParams = {};
        var headerParams = {};
        var bodyContent = '';

        panel.querySelectorAll('[data-param]').forEach(function(input) {
            var paramName = input.getAttribute('data-param');
            var location = input.getAttribute('data-in');
            var value = input.value;

            if (!value) return;

            // Substitute variables in the value
            value = substituteVariables(value, skillSlug);

            if (paramName === '__body__') {
                bodyContent = value;
            } else if (location === 'path') {
                pathParams[paramName] = value;
            } else if (location === 'query') {
                queryParams[paramName] = value;
            } else if (location === 'header') {
                headerParams[paramName] = value;
            }
        });

        // Check for request body from ACE editor
        var bodyEditor = getCodeMirrorEditor('body-' + sid);
        if (bodyEditor) {
            var editorContent = bodyEditor.getValue();
            if (editorContent.trim()) {
                bodyContent = substituteVariables(editorContent.trim(), skillSlug);
            }
        }

        // Build URL
        var serverUrl = getServerForApi(apiSlug).replace(/\/$/, '');
        var path = opMeta.path;

        // Replace path parameters
        for (var paramName in pathParams) {
            path = path.replace('{' + paramName + '}', encodeURIComponent(pathParams[paramName]));
        }

        var fullUrl = serverUrl + path;

        // Add query parameters
        var queryString = Object.keys(queryParams)
            .map(function(k) { return encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]); })
            .join('&');
        if (queryString) {
            fullUrl += '?' + queryString;
        }

        // Prepare headers
        var headers = Object.assign(
            {'Content-Type': 'application/json'},
            getAuthHeaders(),
            headerParams
        );

        // Make the API call through proxy
        var PROXY_URL = window.__PROXY_CONFIG__ ? window.__PROXY_CONFIG__.url : '/proxy';
        var resp = await fetch(PROXY_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                method: opMeta.method,
                url: fullUrl,
                headers: headers,
                body: bodyContent || null
            })
        });

        var result = await resp.json();

        // Restore button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) textSpan.textContent = originalText;
            buttonEl.disabled = false;
        }

        if (responseDiv) responseDiv.classList.remove('empty');

        // Update status badge
        if (statusBadge) {
            var statusClass = 'status-error';
            if (result.status >= 200 && result.status < 300) {
                statusClass = 'status-2xx';
            } else if (result.status >= 300 && result.status < 400) {
                statusClass = 'status-3xx';
            } else if (result.status >= 400 && result.status < 500) {
                statusClass = 'status-4xx';
            } else if (result.status >= 500) {
                statusClass = 'status-5xx';
            }
            statusBadge.className = 'response-status-badge ' + statusClass;
            statusBadge.textContent = result.status;
        }

        if (result.error) {
            if (responseBodyDiv) {
                createReadOnlyAceEditor(responseBodyDiv, result.error, 'text');
            }
            markStepFailed(skillSlug, sid);
            return;
        }

        // Check if response is successful
        var isSuccess = result.status >= 200 && result.status < 300;

        // Display response using shared function
        displayResponseInAceEditors(responseBodyDiv, responseHeadersDiv, result);

        // Store response for evaluation panel
        if (result.body) {
            try {
                // Try to parse the response body as JSON
                window.lastStepResponse = JSON.parse(result.body);
                console.log('Stored response for evaluation:', window.lastStepResponse);
            } catch (e) {
                // If not JSON, store the raw text
                window.lastStepResponse = result.body;
                console.log('Stored raw response for evaluation:', window.lastStepResponse);
            }
        }

        if (isSuccess) {
            // Capture variables from response if outputs are defined
            captureVariablesFromResponse(panel, result);
            markStepSuccess(skillSlug, sid);
        } else {
            markStepFailed(skillSlug, sid);
        }

    } catch (error) {
        console.error('Playground execution failed:', error);

        // Restore button
        if (buttonEl) {
            var textSpan = buttonEl.querySelector('span');
            if (textSpan) textSpan.textContent = originalText;
            buttonEl.disabled = false;
        }

        if (responseDiv) responseDiv.classList.remove('empty');
        if (statusBadge) {
            statusBadge.textContent = 'Error';
            statusBadge.className = 'response-status-badge status-error';
        }
        if (responseBodyDiv) {
            createReadOnlyAceEditor(responseBodyDiv, 'Error: ' + error.message, 'text');
        }
        markStepFailed(skillSlug, sid);
    }
}

// Mark step as successful
function markStepSuccess(skillSlug, sid) {
    if (debuggerState[skillSlug]) {
        if (!debuggerState[skillSlug].successfulSteps) {
            debuggerState[skillSlug].successfulSteps = {};
        }
        debuggerState[skillSlug].successfulSteps[sid] = true;
    }
}

// Mark step as failed
function markStepFailed(skillSlug, sid) {
    if (debuggerState[skillSlug]) {
        if (!debuggerState[skillSlug].successfulSteps) {
            debuggerState[skillSlug].successfulSteps = {};
        }
        debuggerState[skillSlug].successfulSteps[sid] = false;

        // Stop debugger if running
        if (debuggerState[skillSlug].isRunning) {
            console.log('Step failed, stopping debugger');
            cancelDebugger(skillSlug);
        }
    }
}

// Check if previous step was successful
function canProceedToNextStep(skillSlug, currentStepIndex) {
    if (currentStepIndex === 0) return true; // First step can always run

    var state = debuggerState[skillSlug];
    if (!state || !state.successfulSteps) return false;

    // Check if previous step was successful
    var prevSid = skillSlug + '-' + (currentStepIndex - 1);
    return state.successfulSteps[prevSid] === true;
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
                        var originsJsonStr = JSON.stringify(origins);
                        var sid = skillSlug + '-' + stepIndex;

                        html += '<div class="param-input-with-xorigin">';
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
                        // Use Base64 encoding to avoid escaping issues
                        html += 'data-x-origins="' + btoa(originsJsonStr) + '" ';
                        html += 'id="param-' + sid + '-' + escapeHtml(paramName) + '" ';
                        html += 'placeholder="' + escapeHtml(paramType) + '" ';
                        html += 'value="' + escapeHtml(value) + '"';
                        if (required) html += ' required';
                        html += '>';
                        // Magnifier button
                        html += '<button type="button" class="btn-xorigin-search" ';
                        html += 'onclick="openXOriginModal(\'' + sid + '\', \'' + escapeHtml(paramName) + '\', \'' + section.location + '\'); return false;" ';
                        html += 'title="Fetch values from ' + origins.length + ' source(s)" aria-label="Search values">';
                        html += '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">'+
                        '<path d="M7 12C9.76142 12 12 9.76142 12 7C12 4.23858 9.76142 2 7 2C4.23858 2 2 4.23858 2 7C2 9.76142 4.23858 12 7 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'+
                        '<path d="M14 14L10.65 10.65" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'+
                        '</svg>';
                        html += '</button>';
                        html += '</div>';
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
                    if (hasFrom && bf.def.from.variable) {
                        hint = 'from variable: ' + bf.def.from.variable;
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
                theme: getAceTheme(),
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

        // 2. From variable (search previous steps in reverse order)
        if (source.from && typeof source.from === 'object' && source.from.variable) {
            var varName = source.from.variable;
            var field = source.from.field || '';

            // Search previous steps in reverse order (most recent first)
            var val = null;
            for (var s = stepIndex - 1; s >= 0; s--) {
                if (!ctx.stepResults[s]) continue;
                var srcResult = ctx.stepResults[s];
                // Check outputs first (higher priority)
                if (srcResult.outputs && srcResult.outputs[varName] !== undefined) {
                    val = srcResult.outputs[varName];
                    break;
                }
                // Then check inputs
                if (srcResult.inputs && srcResult.inputs[varName] !== undefined) {
                    val = srcResult.inputs[varName];
                    break;
                }
            }
            // Apply field navigation if present
            if (val != null && field) {
                val = extractByPath(val, field);
            }
            if (val != null) {
                resolved = typeof val === 'object' ? JSON.stringify(val) : String(val);
                resolvedFrom = 'variable';
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

    // Highlight curl commands in documentation
    highlightCurlCommands();
});

// Function to add syntax highlighting to curl commands
function highlightCurlCommands() {
    var codeBlocks = document.querySelectorAll('.skill-view-markdown pre code');
    codeBlocks.forEach(function(codeBlock) {
        var text = codeBlock.textContent;

        // Check if it contains curl command
        if (text.includes('curl')) {
            var highlighted = text
                // Highlight curl command
                .replace(/(^|\s)(curl)(\s)/g, '$1<span style="color:#c586c0">$2</span>$3')
                // Highlight flags (-X, -H, etc.)
                .replace(/(\s)(-[A-Za-z]+)(\s)/g, '$1<span style="color:#9cdcfe">$2</span>$3')
                // Highlight URLs (https://...)
                .replace(/(https?:\/\/[^\s"']+)/g, '<span style="color:#ce9178">$1</span>')
                // Highlight strings in quotes
                .replace(/("[^"]*")/g, '<span style="color:#ce9178">$1</span>')
                .replace(/('[^']*')/g, '<span style="color:#ce9178">$1</span>');

            codeBlock.innerHTML = highlighted;
        }
    });
}
// ============================================================================
// Execution Panel - Tab Switching and Evaluation
// ============================================================================

function switchExecutionTab(slug, tab) {
    // Switch tab active state
    var tabs = document.querySelectorAll('.execution-tab');
    tabs.forEach(function(t) {
        if (t.getAttribute('data-tab') === tab) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    
    // Switch content visibility
    var variablesSection = document.getElementById('execution-variables-' + slug);
    var evaluationSection = document.getElementById('execution-evaluation-' + slug);
    
    if (tab === 'variables') {
        if (variablesSection) variablesSection.style.display = 'block';
        if (evaluationSection) evaluationSection.style.display = 'none';
    } else if (tab === 'evaluation') {
        if (variablesSection) variablesSection.style.display = 'none';
        if (evaluationSection) evaluationSection.style.display = 'block';
    }
}

function evaluateExpression(slug) {
    var input = document.getElementById('evaluation-input-' + slug);
    var resultContainer = document.getElementById('evaluation-result-' + slug);

    if (!input || !resultContainer) {
        console.error('Evaluation elements not found');
        return;
    }

    var expression = input.value.trim();
    if (!expression) {
        // Remove any existing ACE editor and show placeholder
        if (resultContainer.env && resultContainer.env.editor) {
            resultContainer.env.editor.destroy();
            resultContainer.env = null;
        }
        resultContainer.innerHTML = '<div class="evaluation-placeholder">Please enter a JSONPath expression</div>';
        resultContainer.classList.remove('evaluation-success', 'evaluation-error');
        return;
    }

    try {
        // Get the last response from the most recent step execution
        var lastResponse = window.lastStepResponse || null;

        console.log('Evaluating expression:', expression);
        console.log('Available response:', lastResponse);

        if (!lastResponse) {
            // Remove any existing ACE editor and show placeholder
            if (resultContainer.env && resultContainer.env.editor) {
                resultContainer.env.editor.destroy();
                resultContainer.env = null;
            }
            resultContainer.innerHTML = '<div class="evaluation-placeholder">No response data available. Please execute a step first.</div>';
            resultContainer.classList.remove('evaluation-success', 'evaluation-error');
            return;
        }

        // Evaluate JSONPath expression
        var result = evaluateJsonPath(lastResponse, expression);
        console.log('Evaluation result:', result);

        if (result === undefined || result === null) {
            // Remove any existing ACE editor and show placeholder
            if (resultContainer.env && resultContainer.env.editor) {
                resultContainer.env.editor.destroy();
                resultContainer.env = null;
            }
            resultContainer.innerHTML = '<div class="evaluation-placeholder">No matches found for: ' + expression + '</div>';
            resultContainer.classList.remove('evaluation-success', 'evaluation-error');
        } else {
            // Remove placeholder if it exists
            var placeholder = resultContainer.querySelector('.evaluation-placeholder');
            if (placeholder) {
                placeholder.remove();
            }

            // Pretty print the result
            var formatted = JSON.stringify(result, null, 2);

            // Create or reuse ACE editor for the result
            createReadOnlyAceEditor(resultContainer, formatted, 'json');

            // Add success styling to the container
            resultContainer.classList.remove('evaluation-error');
            resultContainer.classList.add('evaluation-success');
        }
    } catch (e) {
        // Remove placeholder if it exists
        var placeholder = resultContainer.querySelector('.evaluation-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        var errorMsg = 'Error: ' + e.message + '\n\nExpression: ' + expression;
        createReadOnlyAceEditor(resultContainer, errorMsg, 'text');

        resultContainer.classList.remove('evaluation-success');
        resultContainer.classList.add('evaluation-error');
    }
}

// Simple JSONPath evaluator (supports basic queries)
function evaluateJsonPath(data, path) {
    if (!path || !path.startsWith('$')) {
        throw new Error('JSONPath must start with $');
    }
    
    // Remove the leading $
    path = path.substring(1);
    
    // If path is just $, return entire object
    if (!path || path === '') {
        return data;
    }
    
    // Remove leading dot
    if (path.startsWith('.')) {
        path = path.substring(1);
    }
    
    var current = data;
    var parts = path.split('.');
    
    for (var i = 0; i < parts.length; i++) {
        var part = parts[i];
        
        if (!part) continue;
        
        // Handle array wildcard: field[*]
        if (part.includes('[*]')) {
            var field = part.replace('[*]', '');
            if (field && current[field]) {
                current = current[field];
            }
            
            if (!Array.isArray(current)) {
                throw new Error('Cannot use [*] on non-array');
            }
            
            // Collect remaining path
            var remainingPath = parts.slice(i + 1).join('.');
            if (remainingPath) {
                return current.map(function(item) {
                    return evaluateJsonPath(item, '$.' + remainingPath);
                });
            }
            return current;
        }
        
        // Handle array index: field[0]
        var arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
        if (arrayMatch) {
            var field = arrayMatch[1];
            var index = parseInt(arrayMatch[2], 10);
            
            if (field && current[field]) {
                current = current[field];
            }
            
            if (!Array.isArray(current)) {
                throw new Error('Cannot use [index] on non-array');
            }
            
            current = current[index];
        } else {
            // Simple field access
            if (current === null || current === undefined) {
                return undefined;
            }
            current = current[part];
        }
        
        if (current === undefined) {
            return undefined;
        }
    }
    
    return current;
}

// Store last response for evaluation
window.lastStepResponse = null;

// ============================================================================
// Collapsible Description Functionality
// ============================================================================

function toggleParamDescription(button) {
    var paramItem = button.closest('.param-item');
    var wrapper = paramItem.querySelector('.param-description-wrapper');

    if (!wrapper) return;

    if (wrapper.classList.contains('collapsed')) {
        wrapper.classList.remove('collapsed');
        paramItem.classList.add('expanded');
    } else {
        wrapper.classList.add('collapsed');
        paramItem.classList.remove('expanded');
    }
}

// ============================================================================
// Sort Modal Functionality
// ============================================================================

(function() {
    const sortBtn = document.querySelector('.sort-btn');
    const sortModal = document.getElementById('sortModal');
    const applySortBtn = document.getElementById('applySortBtn');
    const sortBySelect = document.getElementById('sortBy');
    const sortDirectionSelect = document.getElementById('sortDirection');
    const catalogGrid = document.getElementById('catalogGrid');

    if (!sortBtn || !sortModal) return;

    // Open modal
    sortBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        sortModal.style.display = 'block';
    });

    // Close modal when clicking outside
    document.addEventListener('click', function(e) {
        if (sortModal.style.display === 'block' && !sortModal.contains(e.target) && e.target !== sortBtn) {
            sortModal.style.display = 'none';
        }
    });

    // Apply sort
    applySortBtn.addEventListener('click', function() {
        const sortBy = sortBySelect.value;
        const direction = sortDirectionSelect.value;

        sortCatalog(sortBy, direction);
        sortModal.style.display = 'none';
    });

    function sortCatalog(sortBy, direction) {
        const cards = Array.from(catalogGrid.children);

        cards.sort(function(a, b) {
            let aValue, bValue;

            if (sortBy === 'name') {
                aValue = a.getAttribute('data-name') || '';
                bValue = b.getAttribute('data-name') || '';
                return direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            } else if (sortBy === 'type') {
                aValue = a.getAttribute('data-type') || '';
                bValue = b.getAttribute('data-type') || '';
                // Sort by type, then by name as secondary sort
                const typeCompare = direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);

                if (typeCompare !== 0) {
                    return typeCompare;
                }

                // Secondary sort by name
                const aName = a.getAttribute('data-name') || '';
                const bName = b.getAttribute('data-name') || '';
                return aName.localeCompare(bName);
            } else if (sortBy === 'endpoints') {
                // Extract count from the badge text (endpoints for APIs, steps for Skills)
                const aCard = a.querySelector('.badge-count');
                const bCard = b.querySelector('.badge-count');

                aValue = 0;
                bValue = 0;

                if (aCard && aCard.textContent) {
                    const match = aCard.textContent.match(/\d+/);
                    aValue = match ? parseInt(match[0]) : 0;
                }

                if (bCard && bCard.textContent) {
                    const match = bCard.textContent.match(/\d+/);
                    bValue = match ? parseInt(match[0]) : 0;
                }

                return direction === 'asc'
                    ? aValue - bValue
                    : bValue - aValue;
            }

            return 0;
        });

        // Re-append sorted cards
        cards.forEach(function(card) {
            catalogGrid.appendChild(card);
        });
    }
})();

// ============================================================================
// Manual Variable Management
// ============================================================================

function addManualVariable(slug) {
    var table = document.getElementById('variables-table-' + slug);
    if (!table) return;

    var tbody = table.querySelector('tbody');

    // Remove "no variables" row if present
    var noVarsRow = tbody.querySelector('.no-variables-row');
    if (noVarsRow) {
        noVarsRow.remove();
    }

    // Create new row for manual input
    var row = document.createElement('tr');
    row.className = 'variable-row manual-variable-row';

    row.innerHTML = '<td><input type="text" class="manual-var-name" placeholder="variableName" /></td>' +
                    '<td><input type="text" class="manual-var-value" placeholder="value" /></td>' +
                    '<td><span class="var-source">User Input</span></td>' +
                    '<td><button class="btn-delete-variable" onclick="deleteVariable(this, \'' + slug + '\')" title="Delete variable">' +
                    '<img src="assets/icons/x-mark.svg" width="14" height="14" alt="Delete" style="vertical-align: top;">' +
                    '</button></td>';

    tbody.appendChild(row);

    // Focus on name input
    var nameInput = row.querySelector('.manual-var-name');
    nameInput.focus();

    // Add event listeners to save variable on blur or enter
    var saveVariable = function() {
        var name = row.querySelector('.manual-var-name').value.trim();
        var value = row.querySelector('.manual-var-value').value.trim();

        if (name && value) {
            // Initialize skillVariables if needed
            if (!skillVariables[slug]) {
                skillVariables[slug] = {};
            }

            // Store the variable
            skillVariables[slug][name] = value;

            // Convert inputs to display mode
            row.querySelector('td:first-child').innerHTML = '<code class="var-name">' + escapeHtml(name) + '</code>';
            var valueCell = row.querySelector('td:nth-child(2)');
            valueCell.innerHTML = '<code class="var-value">' + escapeHtml(value) + '</code>';
            // Add tooltip if value is long
            if (value.length > 30) {
                valueCell.setAttribute('title', value);
            }
            row.classList.remove('manual-variable-row');

            // Update variable tooltips
            updateVariableTooltips(slug);

            console.log('Manual variable added:', name, '=', value);
        } else if (!name && !value) {
            // Remove empty row
            row.remove();

            // Check if we need to add back "no variables" row
            if (tbody.querySelectorAll('.variable-row').length === 0) {
                tbody.innerHTML = '<tr class="no-variables-row"><td colspan="4" style="text-align:center; color:#9ca3af; padding:2rem 0.5rem;">No variables yet</td></tr>';
            }
        }
    };

    nameInput.addEventListener('blur', saveVariable);
    row.querySelector('.manual-var-value').addEventListener('blur', saveVariable);

    nameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            row.querySelector('.manual-var-value').focus();
        }
    });

    row.querySelector('.manual-var-value').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveVariable();
        }
    });
}

function deleteVariable(button, slug) {
    var row = button.closest('tr');
    var nameCell = row.querySelector('.var-name');

    if (nameCell) {
        var varName = nameCell.textContent;

        // Remove from skillVariables
        if (skillVariables[slug] && skillVariables[slug][varName]) {
            delete skillVariables[slug][varName];
            console.log('Variable deleted:', varName);
        }

        // Update variable tooltips
        updateVariableTooltips(slug);
    }

    // Remove the row
    row.remove();

    // Check if we need to add back "no variables" row
    var table = document.getElementById('variables-table-' + slug);
    var tbody = table.querySelector('tbody');
    if (tbody.querySelectorAll('.variable-row').length === 0) {
        tbody.innerHTML = '<tr class="no-variables-row"><td colspan="4" style="text-align:center; color:#9ca3af; padding:2rem 0.5rem;">No variables yet</td></tr>';
    }
}

function clearAllVariables(slug) {
    if (!confirm('Are you sure you want to clear all variables?')) {
        return;
    }

    // Clear from skillVariables
    skillVariables[slug] = {};

    // Clear from array variables if exists
    if (window.skillArrayVariables && window.skillArrayVariables[slug]) {
        window.skillArrayVariables[slug] = {};
    }

    // Clear the table
    var table = document.getElementById('variables-table-' + slug);
    if (table) {
        var tbody = table.querySelector('tbody');
        tbody.innerHTML = '<tr class="no-variables-row"><td colspan="4" style="text-align:center; color:#9ca3af; padding:2rem 0.5rem;">No variables yet</td></tr>';
    }

    // Update variable tooltips
    updateVariableTooltips(slug);

    console.log('All variables cleared for:', slug);
}

// ============================================================================
// Dark Mode Toggle
// ============================================================================

(function initDarkMode() {
    // Note: Initial theme is already applied in <head> to prevent flash

    // Create and inject dark mode toggle button
    var toggleButton = document.createElement('button');
    toggleButton.id = 'dark-mode-toggle';
    toggleButton.className = 'dark-mode-toggle';
    toggleButton.setAttribute('aria-label', 'Toggle dark mode');
    toggleButton.innerHTML = '<svg class="theme-icon theme-icon-dark" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" fill="currentColor"/></svg><svg class="theme-icon theme-icon-light" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" fill="currentColor"/></svg>';

    // Add toggle button to page after DOM is ready
    function addToggleButton() {
        // Try to add to header if it exists, otherwise add to body
        var header = document.querySelector('.ms-com-content-header') || document.querySelector('header');
        if (header) {
            header.appendChild(toggleButton);
        } else {
            document.body.appendChild(toggleButton);
        }

        // Add click handler
        toggleButton.addEventListener('click', toggleDarkMode);

        // Update button state
        updateToggleButton();
    }

    function toggleDarkMode() {
        var currentTheme = document.documentElement.getAttribute('data-theme');
        var newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        if (newTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        localStorage.setItem('theme', newTheme);
        updateToggleButton();
        updateAllAceEditors();
    }

    function updateToggleButton() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        toggleButton.setAttribute('aria-pressed', isDark);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addToggleButton);
    } else {
        addToggleButton();
    }

    // Listen for system theme changes
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            // Only auto-switch if user hasn't manually set a preference
            if (!localStorage.getItem('theme')) {
                if (e.matches) {
                    document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                    document.documentElement.removeAttribute('data-theme');
                }
                updateToggleButton();
                updateAllAceEditors();
            }
        });
    }
})();

