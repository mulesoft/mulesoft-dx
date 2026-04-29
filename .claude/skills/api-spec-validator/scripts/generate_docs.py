#!/usr/bin/env python3
"""
API Documentation Generator

Generates markdown documentation from OpenAPI Specification files.
Creates multiple markdown files with curl examples for each endpoint.
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from urllib.parse import urljoin

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(1)


def load_spec(file_path: Path) -> Dict[str, Any]:
    """Load OAS file (YAML or JSON)"""
    with open(file_path, 'r') as f:
        content = f.read()
        try:
            return yaml.safe_load(content)
        except yaml.YAMLError:
            try:
                return json.loads(content)
            except json.JSONDecodeError as e:
                print(f"Error: Failed to parse {file_path}: {e}")
                sys.exit(1)


def get_base_url(spec: Dict[str, Any]) -> str:
    """Extract base URL from spec"""
    # OAS 3.x servers
    if "servers" in spec and spec["servers"]:
        return spec["servers"][0].get("url", "https://api.example.com")

    # OAS 2.0 (Swagger)
    if "host" in spec:
        scheme = spec.get("schemes", ["https"])[0]
        base_path = spec.get("basePath", "")
        return f"{scheme}://{spec['host']}{base_path}"

    return "https://api.example.com"


def format_json_example(data: Any, indent: int = 2) -> str:
    """Format JSON data for display"""
    return json.dumps(data, indent=indent)


def generate_curl_command(
    method: str,
    path: str,
    base_url: str,
    operation: Dict[str, Any],
    spec: Dict[str, Any]
) -> List[str]:
    """Generate curl command examples for an operation"""
    examples = []

    # Build the URL with path parameters replaced by examples
    url = base_url + path

    # Replace path parameters with example values
    parameters = operation.get("parameters", [])
    path_params = {}
    query_params = []
    headers = []

    for param in parameters:
        param_name = param.get("name")
        param_in = param.get("in")

        # Get example value
        example_value = None
        if "example" in param:
            example_value = param["example"]
        elif "schema" in param and "example" in param["schema"]:
            example_value = param["schema"]["example"]
        elif "schema" in param and param["schema"].get("type") == "string":
            example_value = f"example_{param_name}"
        elif "schema" in param and param["schema"].get("type") == "integer":
            example_value = "123"
        else:
            example_value = "example_value"

        if param_in == "path":
            path_params[param_name] = str(example_value)
        elif param_in == "query":
            query_params.append(f"{param_name}={example_value}")
        elif param_in == "header":
            headers.append(f"-H \"{param_name}: {example_value}\"")

    # Replace path parameters
    for param_name, param_value in path_params.items():
        url = url.replace(f"{{{param_name}}}", param_value)

    # Add query parameters
    if query_params:
        url += "?" + "&".join(query_params)

    # Check for request body
    request_body = operation.get("requestBody", {})
    body_examples = []

    if request_body:
        content = request_body.get("content", {})
        for media_type, media_info in content.items():
            if "application/json" in media_type:
                # Get example from examples or example field
                if "examples" in media_info:
                    for ex_name, ex_obj in media_info["examples"].items():
                        if "value" in ex_obj:
                            body_examples.append({
                                "name": ex_obj.get("summary", ex_name),
                                "data": ex_obj["value"]
                            })
                elif "example" in media_info:
                    body_examples.append({
                        "name": "Example request",
                        "data": media_info["example"]
                    })

    # Generate curl commands
    if body_examples:
        for body_ex in body_examples:
            curl_parts = [
                f"curl -X {method.upper()} \"{url}\"",
                "  -H \"Content-Type: application/json\""
            ]
            curl_parts.extend(f"  {h}" for h in headers)
            curl_parts.append(f"  -d '{format_json_example(body_ex['data'])}'")
            examples.append({
                "name": body_ex["name"],
                "command": " \\\n".join(curl_parts)
            })
    else:
        # Simple curl without body
        curl_parts = [f"curl -X {method.upper()} \"{url}\""]
        curl_parts.extend(f"  {h}" for h in headers)
        examples.append({
            "name": "Basic request",
            "command": " \\\n".join(curl_parts)
        })

    return examples


def generate_response_examples(operation: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract response examples from operation"""
    examples = []
    responses = operation.get("responses", {})

    for status_code, response in responses.items():
        content = response.get("content", {})
        for media_type, media_info in content.items():
            if "application/json" in media_type:
                if "examples" in media_info:
                    for ex_name, ex_obj in media_info["examples"].items():
                        if "value" in ex_obj:
                            examples.append({
                                "status": status_code,
                                "name": ex_obj.get("summary", ex_name),
                                "data": ex_obj["value"]
                            })
                elif "example" in media_info:
                    examples.append({
                        "status": status_code,
                        "name": f"Response {status_code}",
                        "data": media_info["example"]
                    })

    return examples


def generate_overview_page(spec: Dict[str, Any], output_dir: Path) -> str:
    """Generate the overview/index page"""
    info = spec.get("info", {})

    content = [
        f"# {info.get('title', 'API Documentation')}",
        "",
        f"**Version:** {info.get('version', '1.0.0')}",
        ""
    ]

    if "description" in info:
        content.extend([
            "## Description",
            "",
            info["description"],
            ""
        ])

    # Add servers
    if "servers" in spec:
        content.extend([
            "## Base URLs",
            ""
        ])
        for server in spec["servers"]:
            url = server.get("url", "")
            description = server.get("description", "")
            if description:
                content.append(f"- `{url}` - {description}")
            else:
                content.append(f"- `{url}`")
        content.append("")

    # Group endpoints by tags
    paths = spec.get("paths", {})
    tags_map: Dict[str, List[tuple]] = {}

    for path, methods in paths.items():
        for method in ["get", "post", "put", "patch", "delete", "options", "head"]:
            if method in methods:
                operation = methods[method]
                operation_tags = operation.get("tags", ["General"])
                operation_id = operation.get("operationId", f"{method}_{path}")
                summary = operation.get("summary", operation.get("description", path))

                for tag in operation_tags:
                    if tag not in tags_map:
                        tags_map[tag] = []
                    tags_map[tag].append((method.upper(), path, summary, operation_id))

    # Add endpoints table of contents
    content.extend([
        "## Endpoints",
        ""
    ])

    for tag in sorted(tags_map.keys()):
        content.extend([
            f"### {tag}",
            ""
        ])
        for method, path, summary, operation_id in tags_map[tag]:
            # Link to the endpoint file
            filename = f"{operation_id}.md"
            content.append(f"- [{method} {path}]({filename}) - {summary}")
        content.append("")

    return "\n".join(content)


def generate_endpoint_page(
    path: str,
    method: str,
    operation: Dict[str, Any],
    base_url: str,
    spec: Dict[str, Any]
) -> str:
    """Generate documentation page for a single endpoint"""
    operation_id = operation.get("operationId", f"{method}_{path}")
    summary = operation.get("summary", "")
    description = operation.get("description", "")

    content = [
        f"# {method.upper()} {path}",
        ""
    ]

    if summary:
        content.extend([
            f"**{summary}**",
            ""
        ])

    if description:
        content.extend([
            "## Description",
            "",
            description,
            ""
        ])

    # Parameters
    parameters = operation.get("parameters", [])
    if parameters:
        content.extend([
            "## Parameters",
            ""
        ])

        # Group by type
        path_params = [p for p in parameters if p.get("in") == "path"]
        query_params = [p for p in parameters if p.get("in") == "query"]
        header_params = [p for p in parameters if p.get("in") == "header"]

        if path_params:
            content.extend([
                "### Path Parameters",
                "",
                "| Name | Type | Required | Description |",
                "|------|------|----------|-------------|"
            ])
            for param in path_params:
                name = param.get("name", "")
                param_type = param.get("schema", {}).get("type", "string")
                required = "Yes" if param.get("required") else "No"
                desc = param.get("description", "")
                content.append(f"| `{name}` | {param_type} | {required} | {desc} |")
            content.append("")

        if query_params:
            content.extend([
                "### Query Parameters",
                "",
                "| Name | Type | Required | Description |",
                "|------|------|----------|-------------|"
            ])
            for param in query_params:
                name = param.get("name", "")
                param_type = param.get("schema", {}).get("type", "string")
                required = "Yes" if param.get("required") else "No"
                desc = param.get("description", "")
                content.append(f"| `{name}` | {param_type} | {required} | {desc} |")
            content.append("")

        if header_params:
            content.extend([
                "### Header Parameters",
                "",
                "| Name | Type | Required | Description |",
                "|------|------|----------|-------------|"
            ])
            for param in header_params:
                name = param.get("name", "")
                param_type = param.get("schema", {}).get("type", "string")
                required = "Yes" if param.get("required") else "No"
                desc = param.get("description", "")
                content.append(f"| `{name}` | {param_type} | {required} | {desc} |")
            content.append("")

    # Request Body
    request_body = operation.get("requestBody", {})
    if request_body:
        content.extend([
            "## Request Body",
            ""
        ])

        if "description" in request_body:
            content.extend([
                request_body["description"],
                ""
            ])

        content_types = request_body.get("content", {})
        for media_type in content_types.keys():
            content.append(f"**Content-Type:** `{media_type}`")
            content.append("")

    # Curl Examples
    curl_examples = generate_curl_command(method, path, base_url, operation, spec)
    if curl_examples:
        content.extend([
            "## Example Requests",
            ""
        ])
        for example in curl_examples:
            content.extend([
                f"### {example['name']}",
                "",
                "```bash",
                example['command'],
                "```",
                ""
            ])

    # Response Examples
    response_examples = generate_response_examples(operation)
    if response_examples:
        content.extend([
            "## Example Responses",
            ""
        ])
        for example in response_examples:
            content.extend([
                f"### {example['name']} (Status: {example['status']})",
                "",
                "```json",
                format_json_example(example['data']),
                "```",
                ""
            ])

    # Responses
    responses = operation.get("responses", {})
    if responses:
        content.extend([
            "## Response Codes",
            "",
            "| Status Code | Description |",
            "|-------------|-------------|"
        ])
        for status_code, response in responses.items():
            desc = response.get("description", "")
            content.append(f"| `{status_code}` | {desc} |")
        content.append("")

    return "\n".join(content)


def generate_docs(spec_path: Path, output_dir: Path):
    """Generate complete documentation from OAS file"""
    spec = load_spec(spec_path)
    base_url = get_base_url(spec)

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate overview page
    print(f"Generating overview page: README.md")
    overview = generate_overview_page(spec, output_dir)
    (output_dir / "README.md").write_text(overview)

    # Generate endpoint pages
    paths = spec.get("paths", {})
    endpoint_count = 0

    for path, methods in paths.items():
        for method in ["get", "post", "put", "patch", "delete", "options", "head"]:
            if method in methods:
                operation = methods[method]
                operation_id = operation.get("operationId", f"{method}_{path.replace('/', '_')}")

                filename = f"{operation_id}.md"
                print(f"Generating endpoint page: {filename}")

                endpoint_doc = generate_endpoint_page(path, method, operation, base_url, spec)
                (output_dir / filename).write_text(endpoint_doc)
                endpoint_count += 1

    print(f"\n✓ Generated documentation for {endpoint_count} endpoints")
    print(f"✓ Output directory: {output_dir}")
    print(f"\nView the documentation:")
    print(f"  - Overview: {output_dir / 'README.md'}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generate_docs.py <path-to-spec.yaml> [output-dir]")
        print("\nGenerates markdown documentation with curl examples from an OAS file.")
        print("\nArguments:")
        print("  spec.yaml    Path to the OpenAPI Specification file")
        print("  output-dir   Output directory (default: ./docs)")
        sys.exit(1)

    spec_path = Path(sys.argv[1])
    output_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("./docs")

    if not spec_path.exists():
        print(f"Error: File not found: {spec_path}")
        sys.exit(1)

    print(f"\nGenerating API documentation from {spec_path}...\n")
    generate_docs(spec_path, output_dir)


if __name__ == "__main__":
    main()
