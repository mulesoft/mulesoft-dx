# Portal Generator - Architecture Guidelines

This document outlines the architectural principles and best practices for the Anypoint Platform API Portal Generator.

## Table of Contents

1. [Core Principles](#core-principles)
2. [Template Architecture](#template-architecture)
3. [Python-First Processing](#python-first-processing)
4. [Testing Requirements](#testing-requirements)
5. [Project Structure](#project-structure)
6. [Best Practices](#best-practices)

---

## Core Principles

### 1. Avoid Duplicated HTML Elements - Reuse Everything

**Rule:** Never copy-paste HTML. Extract common patterns into Jinja2 macros or includes.

```jinja2
{# ❌ WRONG - Duplicated badge HTML across files #}
<!-- In skill_card.html -->
<span class="badge badge-api">{{ api_count }} APIs</span>

<!-- In api_card.html -->
<span class="badge badge-api">{{ operation_count }} Operations</span>

{# ✅ CORRECT - Centralized macro #}
<!-- In macros.html -->
{% macro render_badge(label, count, type='default') %}
<span class="badge badge-{{ type }}">{{ count }} {{ label }}</span>
{% endmacro %}

<!-- Usage in any template -->
{% from "macros.html" import render_badge %}
{{ render_badge('APIs', api_count, 'api') }}
{{ render_badge('Operations', operation_count, 'operation') }}
```

**Benefits:**
- Single source of truth for HTML structure
- Easy to update design system-wide
- Consistent styling and behavior
- Reduced file size and maintenance burden

**When to extract:**
- HTML appears in 2+ places → create a macro
- Complex nested structure → create a macro with parameters
- Page sections → create includes
- Repeated markup patterns → create macros

### 2. Python-First Processing - Avoid JavaScript Logic

**Rule:** Perform data transformation, filtering, sorting, and business logic in Python. JavaScript should only handle user interactions and dynamic UI updates.

```python
# ✅ CORRECT - Python handles data processing
def generate_api_page(api_spec, output_dir):
    """Generate API detail page with preprocessed data."""
    
    # Process operations by method
    operations_by_method = {}
    for op in api_spec['operations']:
        method = op['method'].upper()
        operations_by_method.setdefault(method, []).append(op)
    
    # Sort operations alphabetically within each method
    for method in operations_by_method:
        operations_by_method[method].sort(key=lambda x: x['path'])
    
    # Calculate statistics
    stats = {
        'total_operations': len(api_spec['operations']),
        'methods': list(operations_by_method.keys()),
        'has_security': bool(api_spec.get('security')),
    }
    
    # Render template with fully processed data
    template = env.get_template('detail_page.html')
    html = template.render(
        api=api_spec,
        operations_by_method=operations_by_method,
        stats=stats,
    )
    
    return html
```

```javascript
// ❌ WRONG - JavaScript doing data processing
// This logic should be in Python!
const operationsByMethod = {};
apiData.operations.forEach(op => {
  const method = op.method.toUpperCase();
  if (!operationsByMethod[method]) {
    operationsByMethod[method] = [];
  }
  operationsByMethod[method].push(op);
});

// Sorting in JS instead of Python
Object.keys(operationsByMethod).forEach(method => {
  operationsByMethod[method].sort((a, b) => 
    a.path.localeCompare(b.path)
  );
});
```

```javascript
// ✅ CORRECT - JavaScript only handles interactions
// Data comes preprocessed from Python
document.querySelector('.filter-btn').addEventListener('click', () => {
  const method = event.target.dataset.method;
  document.querySelectorAll('.operation').forEach(op => {
    op.style.display = op.dataset.method === method ? 'block' : 'none';
  });
});

// ✅ CORRECT - Dynamic UI updates
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  section.classList.toggle('expanded');
}
```

**What belongs in Python:**
- Data transformation and normalization
- Filtering and sorting
- Aggregations and statistics
- Schema validation
- Business logic
- Complex string formatting
- Date/time processing
- API response parsing

**What belongs in JavaScript:**
- DOM manipulation
- Event handling
- Animations and transitions
- Form interactions
- Client-side filtering/searching (after initial Python processing)
- Modal/dropdown toggling
- Copy-to-clipboard functionality
- Syntax highlighting

### 3. Generate Tests for Any New Feature

**Rule:** Every new feature must have tests. No exceptions.

```python
# ✅ CORRECT - Test coverage for new feature

def test_operation_grouping_by_method():
    """Test that operations are correctly grouped by HTTP method."""
    operations = [
        {'method': 'GET', 'path': '/users'},
        {'method': 'POST', 'path': '/users'},
        {'method': 'GET', 'path': '/orgs'},
    ]
    
    result = group_operations_by_method(operations)
    
    assert 'GET' in result
    assert 'POST' in result
    assert len(result['GET']) == 2
    assert len(result['POST']) == 1


def test_operation_grouping_empty_list():
    """Test that empty operation list returns empty dict."""
    result = group_operations_by_method([])
    assert result == {}


def test_operation_grouping_case_insensitive():
    """Test that method names are normalized to uppercase."""
    operations = [
        {'method': 'get', 'path': '/users'},
        {'method': 'Get', 'path': '/orgs'},
    ]
    
    result = group_operations_by_method(operations)
    
    assert 'GET' in result
    assert 'get' not in result
    assert len(result['GET']) == 2
```

**Test Types:**

1. **Unit Tests** (`tests/test_units.py`)
   - Pure functions (utils, parsers, builders)
   - Input → Output validation
   - Edge cases and error handling

2. **OAS Parser Tests** (`tests/test_oas_parser.py`)
   - `$ref` resolution (internal, external, fragments)
   - `allOf` merging
   - Schema property extraction
   - Example loading

3. **Smoke Tests** (`tests/test_smoke.py`)
   - End-to-end generation
   - Output file validation
   - HTML structure checks

**Running Tests:**

```bash
# Run all portal generator tests
make test-portal

# Or run directly with pytest
cd scripts && python3 -m pytest tests/ -v

# Run specific test file
cd scripts && python3 -m pytest tests/test_units.py -v

# Run specific test
cd scripts && python3 -m pytest tests/test_units.py::test_operation_grouping_by_method -v
```

**Test Requirements:**

- ✅ Test the happy path
- ✅ Test edge cases (empty inputs, None values)
- ✅ Test error conditions
- ✅ Use descriptive test names (`test_what_when_expected`)
- ✅ Add docstrings explaining what the test validates
- ✅ Keep tests focused and isolated
- ✅ Use fixtures for common test data

---

## Template Architecture

### Directory Structure

```
scripts/portal_generator/
├── templates/
│   ├── base.html                    # Base template with common structure
│   ├── homepage.html                # Homepage template
│   ├── detail_page.html             # API detail page template
│   ├── skill_page.html              # Skill detail page template
│   ├── homepage/
│   │   ├── api_card.html           # Reusable API card component
│   │   ├── skill_card.html         # Reusable skill card component
│   │   └── filter_bar.html         # Filter controls
│   ├── operations/
│   │   ├── macros.html             # Operation-related macros
│   │   ├── operation_detail.html   # Single operation view
│   │   ├── schema_table.html       # Schema table component
│   │   └── try_it_out.html         # Try it out panel
│   ├── skills/
│   │   ├── macros.html             # Skill-related macros
│   │   ├── skill_detail.html       # Skill detail view
│   │   └── step_unified.html       # Unified step component
│   └── partials/
│       ├── sidebar.html            # Navigation sidebar
│       ├── auth_panel.html         # Authentication panel
│       └── overview.html           # Overview section
```

### Template Hierarchy

```
base.html (page shell, header, footer)
  ├── homepage.html (catalog view)
  │   ├── filter_bar.html
  │   ├── api_card.html (repeated per API)
  │   └── skill_card.html (repeated per skill)
  │
  ├── detail_page.html (API detail)
  │   ├── sidebar.html
  │   ├── overview.html
  │   └── operations/operation_detail.html (repeated per operation)
  │       ├── schema_table.html
  │       └── try_it_out.html
  │
  └── skill_page.html (skill detail)
      ├── skill_detail.html
      └── step_unified.html (repeated per step)
```

### Macro vs Include Guidelines

**Use Macros when:**
- Component needs parameters
- Logic varies based on input
- Need to reuse with different data

```jinja2
{% macro render_status_badge(status_code) %}
<span class="status-badge status-{{ status_code // 100 }}xx">
  {{ status_code }}
</span>
{% endmacro %}
```

**Use Includes when:**
- Static component with no parameters
- Large template sections
- Shared layout components

```jinja2
{% include "partials/sidebar.html" %}
```

---

## Python-First Processing

### Data Processing Pipeline

```
1. Load OpenAPI Spec (YAML/JSON)
   ↓
2. Parse and Validate (parsers/oas_parser.py)
   ↓
3. Transform Data (generator.py)
   - Normalize structures
   - Calculate statistics
   - Build navigation trees
   - Resolve references
   - Extract examples
   ↓
4. Render Templates (template_env.py)
   - Pass fully processed data
   - Use Jinja2 filters for formatting only
   ↓
5. Write HTML Files (generator.py)
```

### What to Process in Python

```python
# ✅ Data transformation
def process_api_spec(spec):
    """Transform raw OpenAPI spec into template-ready data."""
    return {
        'info': normalize_info(spec['info']),
        'operations': extract_operations(spec),
        'schemas': resolve_schemas(spec),
        'examples': extract_examples(spec),
        'security': parse_security(spec),
        'stats': calculate_stats(spec),
    }

# ✅ Complex logic
def build_operation_tree(operations):
    """Build hierarchical operation tree grouped by tags and paths."""
    tree = {}
    for op in operations:
        tag = op.get('tag', 'default')
        path_parts = op['path'].split('/')
        
        # Build nested structure
        current = tree.setdefault(tag, {})
        for part in path_parts:
            current = current.setdefault(part, {})
        current['_operation'] = op
    
    return tree

# ✅ Filtering and sorting
def filter_public_operations(operations):
    """Return only operations marked as public."""
    return [op for op in operations if not op.get('internal', False)]

def sort_operations_by_path(operations):
    """Sort operations alphabetically by path."""
    return sorted(operations, key=lambda x: (x['path'], x['method']))
```

### What JavaScript Should Handle

```javascript
// ✅ UI interactions
function toggleOperationDetails(operationId) {
  const details = document.getElementById(`details-${operationId}`);
  details.classList.toggle('expanded');
}

// ✅ Client-side filtering (after Python provides initial data)
function filterOperations(methodFilter) {
  document.querySelectorAll('.operation').forEach(op => {
    const matches = !methodFilter || op.dataset.method === methodFilter;
    op.style.display = matches ? 'block' : 'none';
  });
}

// ✅ Form handling
function submitTryItOut(operationId) {
  const form = document.getElementById(`form-${operationId}`);
  const formData = new FormData(form);
  // Send request and update UI
}
```

---

## Testing Requirements

### Test Structure

```
scripts/
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Pytest fixtures
│   ├── test_units.py            # Unit tests for utilities
│   ├── test_oas_parser.py       # OAS parsing tests
│   ├── test_smoke.py            # End-to-end smoke tests
│   └── fixtures/                # Test data
│       ├── minimal_api.yaml
│       ├── complete_api.yaml
│       └── skill_example.md
└── pyproject.toml               # Pytest configuration
```

### Writing Good Tests

```python
import pytest
from pathlib import Path

# ✅ Use fixtures for common data
@pytest.fixture
def sample_operation():
    """Fixture providing a sample operation for testing."""
    return {
        'operationId': 'getUser',
        'method': 'GET',
        'path': '/users/{id}',
        'summary': 'Get user by ID',
        'parameters': [
            {'name': 'id', 'in': 'path', 'required': True}
        ],
    }

# ✅ Descriptive test names
def test_operation_id_extraction_from_valid_spec(sample_operation):
    """Test that operation ID is correctly extracted from spec."""
    result = extract_operation_id(sample_operation)
    assert result == 'getUser'

# ✅ Test edge cases
def test_operation_id_extraction_when_missing():
    """Test that missing operation ID generates a default."""
    operation = {'method': 'GET', 'path': '/users'}
    result = extract_operation_id(operation)
    assert result == 'get_users'

# ✅ Test error conditions
def test_operation_id_extraction_raises_on_invalid_input():
    """Test that invalid input raises appropriate error."""
    with pytest.raises(ValueError, match="Operation must be a dict"):
        extract_operation_id(None)

# ✅ Parameterized tests for multiple cases
@pytest.mark.parametrize("method,path,expected", [
    ('GET', '/users', 'get_users'),
    ('POST', '/users', 'post_users'),
    ('DELETE', '/users/{id}', 'delete_users_id'),
])
def test_operation_id_generation(method, path, expected):
    """Test operation ID generation for various method/path combinations."""
    operation = {'method': method, 'path': path}
    result = extract_operation_id(operation)
    assert result == expected
```

### Test Coverage Goals

- **Unit tests:** 80%+ coverage for utils and parsers
- **Integration tests:** All major generation flows
- **Smoke tests:** All output files validate correctly

---

## Project Structure

### Key Files

```
scripts/portal_generator/
├── __init__.py
├── generator.py              # Main generator orchestration
├── template_env.py           # Jinja2 environment setup
├── discovery.py              # API/skill discovery
├── mulesoft_chrome.py        # Chrome/header generation
├── assets/
│   ├── styles.css           # Design system styles
│   ├── portal.js            # Client-side interactions
│   └── icons/               # SVG icons
├── parsers/
│   ├── oas_parser.py        # OpenAPI parsing
│   └── skill_parser.py      # JTBD skill parsing
├── builders/
│   └── tree_builder.py      # Navigation tree building
├── templates/               # Jinja2 templates
└── utils.py                 # Utility functions
```

### Separation of Concerns

```python
# generator.py - Orchestration
def generate_portal(apis, skills, output_dir):
    """High-level generation orchestration."""
    # Discover and load data
    # Call specialized functions
    # Write output files

# parsers/ - Data parsing and validation
def parse_openapi_spec(spec_path):
    """Parse and validate OpenAPI specification."""
    # Load YAML/JSON
    # Resolve $refs
    # Validate structure

# builders/ - Data transformation
def build_navigation_tree(operations):
    """Build navigation tree from operations."""
    # Group and organize data
    # Return structured tree

# utils.py - Pure utility functions
def slugify(text):
    """Convert text to URL-safe slug."""
    # String manipulation
    # No side effects
```

---

## Best Practices

### 1. Template Best Practices

```jinja2
{# ✅ Use descriptive variable names #}
{% for operation in operations %}
  {# Not: {% for op in ops %} #}

{# ✅ Add comments for complex logic #}
{# Check if operation has security requirements before rendering auth panel #}
{% if operation.security %}

{# ✅ Use filters for formatting, not logic #}
{{ operation.summary | capitalize }}
{{ date | format_date }}

{# ❌ Don't put complex logic in templates #}
{# This should be in Python: #}
{% set sorted_ops = operations | sort(attribute='path') %}
```

### 2. Python Best Practices

```python
# ✅ Type hints
def parse_operation(spec: dict) -> Operation:
    """Parse operation from OpenAPI spec."""
    pass

# ✅ Docstrings
def generate_api_page(api_spec, output_dir):
    """Generate API detail page.
    
    Args:
        api_spec: Parsed OpenAPI specification
        output_dir: Output directory path
        
    Returns:
        Path to generated HTML file
    """
    pass

# ✅ Error handling
def load_spec(path):
    """Load OpenAPI spec from file."""
    try:
        with open(path) as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        raise ValueError(f"Spec file not found: {path}")
    except yaml.YAMLError as e:
        raise ValueError(f"Invalid YAML in {path}: {e}")

# ✅ Small, focused functions
def extract_operation_id(operation):
    """Extract or generate operation ID."""
    return operation.get('operationId') or generate_operation_id(operation)

def generate_operation_id(operation):
    """Generate operation ID from method and path."""
    method = operation['method'].lower()
    path = operation['path'].replace('/', '_').replace('{', '').replace('}', '')
    return f"{method}{path}"
```

### 3. Testing Best Practices

```python
# ✅ One assertion per test (when possible)
def test_operation_has_get_method():
    operation = parse_operation({'method': 'GET', 'path': '/'})
    assert operation.method == 'GET'

# ✅ Use pytest fixtures
@pytest.fixture
def api_spec():
    return load_fixture('minimal_api.yaml')

def test_api_parsing(api_spec):
    result = parse_api(api_spec)
    assert result.info.title

# ✅ Test file names match source files
# generator.py → test_generator.py
# oas_parser.py → test_oas_parser.py

# ✅ Organize tests by feature
class TestOperationParsing:
    def test_parses_method(self):
        pass
    
    def test_parses_path(self):
        pass
```

---

## Common Patterns

### Pattern: Macro with Default Parameters

```jinja2
{% macro render_badge(text, variant='default', size='md') %}
<span class="badge badge-{{ variant }} badge-{{ size }}">
  {{ text }}
</span>
{% endmacro %}

{# Usage #}
{{ render_badge('NEW') }}
{{ render_badge('Beta', variant='info') }}
{{ render_badge('Required', variant='danger', size='sm') }}
```

### Pattern: Python Data Preparation

```python
def prepare_operation_data(operation, spec):
    """Prepare operation data for template rendering."""
    return {
        'id': operation.get('operationId'),
        'method': operation['method'].upper(),
        'path': operation['path'],
        'summary': operation.get('summary', ''),
        'description': markdown_to_html(operation.get('description', '')),
        'parameters': process_parameters(operation.get('parameters', [])),
        'request_body': process_request_body(operation.get('requestBody')),
        'responses': process_responses(operation.get('responses', {})),
        'examples': extract_examples(operation, spec),
        'security': resolve_security(operation, spec),
    }
```

### Pattern: Conditional Template Includes

```jinja2
{% if operation.parameters %}
  {% include "operations/parameters_section.html" %}
{% endif %}

{% if operation.requestBody %}
  {% include "operations/request_body_section.html" %}
{% endif %}

{% if operation.responses %}
  {% include "operations/responses_section.html" %}
{% endif %}
```

---

## Quick Checklist

Before submitting a PR with new features:

- [ ] Extracted reusable components into macros/includes
- [ ] Data processing done in Python, not JavaScript
- [ ] Tests written for new functionality
- [ ] Tests pass: `make test-portal`
- [ ] No hardcoded colors (using CSS variables)
- [ ] Templates follow design system guidelines
- [ ] Docstrings added to new functions
- [ ] No duplicate HTML across templates

---

## Getting Help

- **Design System:** See `docs/design-system.md`
- **Validation Rules:** See `docs/VALIDATION.md`
- **JTBD Format:** See `docs/jobs-readme.md`
- **Tests:** Run `make test-portal` or check `scripts/tests/`
