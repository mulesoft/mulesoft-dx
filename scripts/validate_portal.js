// This script validates the portal logic by simulating step execution
// Run this in the browser console on the skill page

console.log('=== PORTAL VALIDATION SCRIPT ===\n');

// Test 1: Check if step titles are correct
console.log('TEST 1: Step Title Check');
var stepTitles = document.querySelectorAll('.playground-step-title');
var hasDuplicateStepNumbers = false;
stepTitles.forEach(function(title, index) {
    var text = title.textContent.trim();
    console.log('  Step ' + (index + 1) + ': ' + text);
    // Check if "Step N:" appears twice
    var matches = text.match(/Step \d+:/g);
    if (matches && matches.length > 1) {
        console.error('    ❌ FAIL: Duplicate "Step N:" found');
        hasDuplicateStepNumbers = true;
    }
});
console.log(hasDuplicateStepNumbers ? '❌ TEST 1 FAILED\n' : '✓ TEST 1 PASSED\n');

// Test 2: Check variables table structure
console.log('TEST 2: Variables Table Structure');
var variablesTables = document.querySelectorAll('[id^="variables-table-"]');
if (variablesTables.length === 0) {
    console.error('❌ FAIL: No variables tables found');
} else {
    console.log('  Found ' + variablesTables.length + ' variables table(s)');
    variablesTables.forEach(function(table) {
        console.log('  Table ID: ' + table.id);
        var tbody = table.querySelector('tbody');
        if (!tbody) {
            console.error('    ❌ FAIL: No tbody found');
        } else {
            var rows = tbody.querySelectorAll('tr');
            console.log('    Rows: ' + rows.length);
        }
    });
    console.log('✓ TEST 2 PASSED\n');
}

// Test 3: Simulate variable capture
console.log('TEST 3: Variable Capture Simulation');
// Get the first skill slug
var skillSection = document.querySelector('.skill-detail');
if (!skillSection) {
    console.error('❌ FAIL: No skill section found');
} else {
    var slug = skillSection.id.replace('skill-', '');
    console.log('  Skill slug: ' + slug);

    // Initialize skillVariables if not exists
    if (typeof skillVariables === 'undefined') {
        console.log('  Initializing skillVariables object');
        window.skillVariables = {};
    }

    // Simulate capturing organizationId
    console.log('  Simulating capture of organizationId...');
    window.skillVariables[slug] = { organizationId: 'test-org-123' };
    console.log('  skillVariables[' + slug + ']:', window.skillVariables[slug]);

    // Try to update the table
    if (typeof updateVariablesTable === 'function') {
        console.log('  Calling updateVariablesTable...');
        updateVariablesTable(slug, window.skillVariables[slug], 'Get Current Organization');

        // Check if row was added
        var tableBody = document.querySelector('#variables-table-' + slug + ' tbody');
        if (tableBody) {
            var rows = tableBody.querySelectorAll('tr[data-var-name]');
            console.log('  Rows after update: ' + rows.length);
            if (rows.length > 0) {
                console.log('  ✓ Variable row added');
                rows.forEach(function(row) {
                    console.log('    - ' + row.cells[0].textContent + ': ' + row.cells[1].textContent + ' (from ' + row.cells[2].textContent + ')');
                });
            } else {
                console.error('  ❌ FAIL: No variable rows added');
            }
        }
    } else {
        console.error('  ❌ FAIL: updateVariablesTable function not found');
    }

    // Add second variable
    console.log('\n  Simulating capture of environmentId...');
    window.skillVariables[slug].environmentId = ['env-1', 'env-2', 'env-3'];
    console.log('  skillVariables[' + slug + ']:', window.skillVariables[slug]);

    if (typeof updateVariablesTable === 'function') {
        console.log('  Calling updateVariablesTable...');
        updateVariablesTable(slug, window.skillVariables[slug], 'List Environments');

        var tableBody = document.querySelector('#variables-table-' + slug + ' tbody');
        if (tableBody) {
            var rows = tableBody.querySelectorAll('tr[data-var-name]');
            console.log('  Rows after second update: ' + rows.length);
            if (rows.length === 2) {
                console.log('  ✓ Second variable added successfully');
                rows.forEach(function(row) {
                    console.log('    - ' + row.cells[0].textContent + ': ' + row.cells[1].textContent + ' (from ' + row.cells[2].textContent + ')');
                });

                // Check if first variable's source remained unchanged
                var firstRow = tableBody.querySelector('tr[data-var-name="organizationId"]');
                if (firstRow && firstRow.cells[2].textContent === 'Get Current Organization') {
                    console.log('  ✓ First variable source preserved');
                    console.log('✓ TEST 3 PASSED\n');
                } else {
                    console.error('  ❌ FAIL: First variable source changed');
                }
            } else {
                console.error('  ❌ FAIL: Expected 2 rows, found ' + rows.length);
            }
        }
    }
}

// Test 4: Check for variable reference inputs
console.log('TEST 4: Variable Reference Inputs');
var hasVarRefInputs = document.querySelectorAll('input.has-variable-ref');
if (hasVarRefInputs.length > 0) {
    console.log('  Found ' + hasVarRefInputs.length + ' inputs with variable references');
    console.log('  Checking for resolved value spans...');
    var spansFound = 0;
    hasVarRefInputs.forEach(function(input) {
        var nextEl = input.nextElementSibling;
        if (nextEl && nextEl.classList && nextEl.classList.contains('variable-resolved-value')) {
            spansFound++;
        }
        // For x-origin fields, check after the button
        if (nextEl && nextEl.classList && nextEl.classList.contains('btn-xorigin-search')) {
            nextEl = nextEl.nextElementSibling;
            if (nextEl && nextEl.classList && nextEl.classList.contains('variable-resolved-value')) {
                spansFound++;
            }
        }
    });
    console.log('  Resolved value spans found: ' + spansFound);
    if (spansFound > 0) {
        console.log('✓ TEST 4 PASSED\n');
    } else {
        console.log('  Note: Spans will appear after variables are captured and updateVariableTooltips is called\n');
    }
} else {
    console.log('  No inputs with variable references found (need to switch to playground mode)\n');
}

console.log('=== VALIDATION COMPLETE ===');
console.log('\nTo run full test:');
console.log('1. Open a skill page (e.g., apply-policy-to-api-instance.html)');
console.log('2. Switch to Playground Mode');
console.log('3. Run this script');
console.log('4. Click "Run" button to execute steps');
