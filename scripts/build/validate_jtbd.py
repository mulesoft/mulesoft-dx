#!/usr/bin/env python3
"""
JTBD (Jobs-to-be-Done) Validator

Validates JTBD markdown files including:
- Frontmatter structure
- Step headers (## Step 1:, etc.)
- YAML step blocks with required fields
- API URN points to valid folder
- OperationId exists in the referenced API spec
- Step dependencies
"""

import re
import sys
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple


class JobValidator:
    def __init__(self, job_file: Path, api_specs_root: Path):
        self.job_file = job_file
        self.api_specs_root = api_specs_root
        self.errors = []
        self.warnings = []
        self.api_cache = {}  # Cache loaded API specs

    def load_api_spec(self, api_urn: str) -> Optional[Dict[str, Any]]:
        """Load OpenAPI spec from URN like urn:api:api-manager"""
        if api_urn in self.api_cache:
            return self.api_cache[api_urn]

        # Extract folder name from URN
        if not api_urn.startswith('urn:api:'):
            self.errors.append(f"Invalid API URN format: {api_urn} (must start with 'urn:api:')")
            return None

        folder_name = api_urn.replace('urn:api:', '')
        api_folder = self.api_specs_root / 'apis' / folder_name

        # Check if folder exists
        if not api_folder.exists():
            self.errors.append(
                f"API folder not found for URN '{api_urn}': "
                f"{api_folder} does not exist"
            )
            return None

        if not api_folder.is_dir():
            self.errors.append(
                f"API path is not a directory for URN '{api_urn}': {api_folder}"
            )
            return None

        # Look for OpenAPI spec file (try common names)
        spec_files = ['api.yaml', 'api.yml', 'openapi.yaml', 'openapi.yml']
        spec_path = None

        for spec_file in spec_files:
            candidate = api_folder / spec_file
            if candidate.exists():
                spec_path = candidate
                break

        if not spec_path:
            self.errors.append(
                f"No OpenAPI spec found in {api_folder}. "
                f"Tried: {', '.join(spec_files)}"
            )
            return None

        # Load and parse the spec
        try:
            with open(spec_path) as f:
                spec = yaml.safe_load(f)
                self.api_cache[api_urn] = spec
                return spec
        except yaml.YAMLError as e:
            self.errors.append(
                f"Failed to parse OpenAPI spec at {spec_path}: {e}"
            )
            return None
        except Exception as e:
            self.errors.append(
                f"Failed to read OpenAPI spec at {spec_path}: {e}"
            )
            return None

    def find_operation_id(self, spec: Dict[str, Any], operation_id: str) -> bool:
        """Check if operationId exists in the OpenAPI spec"""
        if not spec or 'paths' not in spec:
            return False

        # Search through all paths and operations
        for path, path_item in spec['paths'].items():
            if not isinstance(path_item, dict):
                continue

            # Check all HTTP methods
            for method in ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']:
                if method in path_item:
                    operation = path_item[method]
                    if isinstance(operation, dict) and operation.get('operationId') == operation_id:
                        return True

        return False

    def extract_job_steps(self, content: str) -> List[Dict[str, Any]]:
        """Extract YAML blocks that define job steps from markdown."""
        pattern = r'```yaml\n(.*?)\n```'
        matches = re.findall(pattern, content, re.DOTALL)

        steps = []
        for i, match in enumerate(matches, 1):
            try:
                data = yaml.safe_load(match)
                if isinstance(data, dict) and 'api' in data and 'operationId' in data:
                    steps.append(data)
            except yaml.YAMLError as e:
                self.warnings.append(f"Failed to parse YAML block {i}: {e}")
                continue

        return steps

    def extract_step_headers(self, content: str) -> List[int]:
        """Extract step numbers from markdown headers like '## Step 1: ...'"""
        pattern = r'^##\s+Step\s+(\d+):'
        matches = re.findall(pattern, content, re.MULTILINE)
        return [int(num) for num in matches]

    def validate_frontmatter(self, content: str) -> bool:
        """Validate YAML frontmatter."""
        match = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
        if not match:
            self.errors.append("Missing YAML frontmatter (--- ... ---)")
            return False

        try:
            frontmatter = yaml.safe_load(match.group(1))
        except yaml.YAMLError as e:
            self.errors.append(f"Invalid YAML in frontmatter: {e}")
            return False

        # Check required fields
        if 'name' not in frontmatter:
            self.errors.append("Frontmatter missing 'name' field")
        elif len(frontmatter['name']) > 64:
            self.errors.append(
                f"Frontmatter 'name' too long (max 64 chars): "
                f"{len(frontmatter['name'])} chars"
            )

        if 'description' not in frontmatter:
            self.errors.append("Frontmatter missing 'description' field")
        elif len(frontmatter['description']) > 1024:
            self.warnings.append(
                f"Frontmatter 'description' is long ({len(frontmatter['description'])} chars). "
                f"Consider keeping under 1024 chars for better agent discovery."
            )

        return len(self.errors) == 0

    def validate_step_structure(self, step: Dict[str, Any], step_num: int) -> bool:
        """Validate that a step has required fields."""
        is_valid = True

        # Required fields
        required = ['api', 'operationId']
        for field in required:
            if field not in step:
                self.errors.append(
                    f"Step {step_num}: Missing required field '{field}'"
                )
                is_valid = False

        # Validate api URN format
        if 'api' in step:
            api = step['api']
            if not api.startswith('urn:api:'):
                self.errors.append(
                    f"Step {step_num}: API should use URN format (urn:api:*), "
                    f"got '{api}'"
                )
                is_valid = False

        # Note if inputs is missing (warning, not error)
        if 'inputs' not in step:
            self.warnings.append(
                f"Step {step_num}: No 'inputs' defined (this is unusual)"
            )

        return is_valid

    def validate_api_and_operation(self, step: Dict[str, Any], step_num: int) -> bool:
        """Validate that API exists and operation is defined in it."""
        if 'api' not in step or 'operationId' not in step:
            return False  # Already reported in structure validation

        api_urn = step['api']
        operation_id = step['operationId']

        # Load API spec
        spec = self.load_api_spec(api_urn)
        if not spec:
            return False  # Error already reported in load_api_spec

        # Check if operation exists
        if not self.find_operation_id(spec, operation_id):
            self.errors.append(
                f"Step {step_num}: Operation '{operation_id}' not found in API '{api_urn}'"
            )
            return False

        return True

    def validate_step_dependencies(self, steps: List[Dict[str, Any]]) -> bool:
        """Validate that step references are correct."""
        is_valid = True
        step_outputs = {}

        # Build map of available outputs by step index
        for i, step in enumerate(steps, 1):
            if 'outputs' in step:
                step_outputs[i] = [
                    out['name'] for out in step['outputs']
                    if isinstance(out, dict) and 'name' in out
                ]

        # Check each step's inputs
        for i, step in enumerate(steps, 1):
            step_num = i
            inputs = step.get('inputs', {})

            for param_name, input_def in inputs.items():
                if not isinstance(input_def, dict):
                    continue

                # Check step references
                if 'from' in input_def and isinstance(input_def['from'], dict):
                    from_def = input_def['from']

                    if 'step' in from_def:
                        ref_step_identifier = from_def['step']

                        # Try to parse as step number if it's numeric
                        try:
                            ref_step_num = int(ref_step_identifier) if isinstance(ref_step_identifier, (int, str)) and str(ref_step_identifier).isdigit() else None
                        except (ValueError, TypeError):
                            ref_step_num = None

                        # If not numeric, it's a reference we can't validate without step names
                        if ref_step_num is not None:
                            # Check step exists (by number)
                            if ref_step_num < 1 or ref_step_num > len(steps):
                                self.errors.append(
                                    f"Step {step_num}, input '{param_name}': "
                                    f"References unknown step number {ref_step_num}"
                                )
                                is_valid = False
                            # Check step comes before current step
                            elif ref_step_num >= step_num:
                                self.errors.append(
                                    f"Step {step_num}, input '{param_name}': "
                                    f"References step {ref_step_num} which comes after "
                                    f"or is the same step"
                                )
                                is_valid = False
                            # Check output exists if referencing output
                            elif 'output' in from_def:
                                output_name = from_def['output']
                                if ref_step_num in step_outputs:
                                    if output_name not in step_outputs[ref_step_num]:
                                        self.errors.append(
                                            f"Step {step_num}, input '{param_name}': "
                                            f"References unknown output '{output_name}' "
                                            f"from step {ref_step_num}"
                                        )
                                        is_valid = False

        return is_valid

    def validate_starting_point(self, content: str, total_steps: int):
        """Validate optional Starting Point section references."""
        sp_match = re.search(
            r'^## Starting Point\s*\n(.*?)(?=^## |\Z)',
            content, re.MULTILINE | re.DOTALL
        )
        if not sp_match:
            return

        print("\n📍 Validating Starting Point section...")
        sp_content = sp_match.group(1)

        # Extract referenced step numbers from entry point headers
        step_refs = re.findall(
            r'\*\*Start at Step (\d+)\*\*', sp_content
        )
        for ref in step_refs:
            step_num = int(ref)
            if step_num < 1 or step_num > total_steps:
                self.warnings.append(
                    f"Starting Point references Step {step_num}, "
                    f"but only {total_steps} step(s) exist"
                )
                print(f"  ⚠️  Step {step_num} out of range (1-{total_steps})")
            else:
                print(f"  ✅ Step {step_num} reference valid")

        # Validate Steps: lists if present
        steps_lists = re.findall(
            r'- Steps:\s*(.+)', sp_content, re.IGNORECASE
        )
        for steps_line in steps_lists:
            step_nums = [
                int(s.strip()) for s in steps_line.split(',')
                if s.strip().isdigit()
            ]
            for sn in step_nums:
                if sn < 1 or sn > total_steps:
                    self.warnings.append(
                        f"Starting Point steps list references Step {sn}, "
                        f"but only {total_steps} step(s) exist"
                    )
                    print(f"  ⚠️  Steps list: Step {sn} out of range (1-{total_steps})")
            if step_nums:
                print(f"  ✅ Steps list valid: {step_nums}")

    def validate_skip_annotations(self, content: str, steps: List[Dict[str, Any]]):
        """Warn about skip annotations on steps that have downstream dependencies."""
        # Find steps with skip annotations
        skip_pattern = re.compile(
            r'^## Step (\d+):.*?\n.*?>\s*\*\*Skip if:\*\*',
            re.MULTILINE | re.DOTALL
        )
        skippable_steps = set()
        for m in skip_pattern.finditer(content):
            skippable_steps.add(int(m.group(1)))

        if not skippable_steps:
            return

        print("\n⏭️  Validating skip annotations...")

        # Build output names per step
        step_outputs = {}
        for i, step in enumerate(steps, 1):
            if 'outputs' in step:
                step_outputs[i] = [
                    out['name'] for out in step['outputs']
                    if isinstance(out, dict) and 'name' in out
                ]

        # Check if downstream steps depend on skippable step outputs
        for skip_step in sorted(skippable_steps):
            if skip_step not in step_outputs:
                print(f"  ✅ Step {skip_step}: skippable (no outputs)")
                continue

            dependents = []
            for i, step in enumerate(steps, 1):
                if i <= skip_step:
                    continue
                inputs = step.get('inputs', {})
                for param_name, input_def in inputs.items():
                    if not isinstance(input_def, dict):
                        continue
                    from_def = input_def.get('from', {})
                    if isinstance(from_def, dict) and 'step' in from_def:
                        try:
                            ref = int(from_def['step']) if str(from_def['step']).isdigit() else None
                        except (ValueError, TypeError):
                            ref = None
                        if ref == skip_step:
                            dependents.append(i)
                            break

            if dependents:
                dep_str = ', '.join(f'Step {d}' for d in dependents)
                self.warnings.append(
                    f"Step {skip_step} has a skip annotation but {dep_str} "
                    f"depend(s) on its outputs. Users must provide these values manually when skipping."
                )
                print(f"  ⚠️  Step {skip_step}: skippable, but {dep_str} depend on its outputs")
            else:
                print(f"  ✅ Step {skip_step}: skippable (no downstream dependencies)")

    def validate(self) -> bool:
        """Run all validations and return True if valid."""
        print(f"\n{'='*80}")
        print(f"Validating: {self.job_file.name}")
        print(f"API Specs Root: {self.api_specs_root}")
        print(f"{'='*80}")

        content = self.job_file.read_text()

        # 1. Validate frontmatter
        print("\n📋 Checking frontmatter...")
        if self.validate_frontmatter(content):
            print("  ✅ Frontmatter valid")
        else:
            for error in [e for e in self.errors if 'frontmatter' in e.lower()]:
                print(f"  ❌ {error}")

        # 2. Extract step headers
        print("\n📑 Checking step headers...")
        step_headers = self.extract_step_headers(content)
        print(f"  Found {len(step_headers)} step header(s)")

        if not step_headers:
            self.errors.append("No step headers found (expecting '## Step 1:', '## Step 2:', etc.)")
            print(f"  ❌ No step headers found")
        else:
            print(f"  ✅ At least 1 step header is defined")

            # Check sequential numbering
            expected_steps = list(range(1, len(step_headers) + 1))
            if step_headers != expected_steps:
                self.errors.append(
                    f"Step headers not sequential. Expected {expected_steps}, found {step_headers}"
                )
                print(f"  ❌ Steps not sequential: {step_headers}")
            else:
                print(f"  ✅ Steps are numbered sequentially (1-{len(step_headers)})")

        # 3. Extract YAML steps
        print("\n📦 Extracting job steps (YAML blocks)...")
        steps = self.extract_job_steps(content)
        print(f"  Found {len(steps)} job step(s)")

        # CRITICAL: At least 1 step must be defined
        if len(steps) == 0:
            self.errors.append(
                "No YAML step blocks found! "
                "Jobs must have at least 1 step defined in a YAML code block with 'api' and 'operationId' fields."
            )
            print(f"  ❌ {self.errors[-1]}")
            self.print_summary()
            return False

        print("  ✅ At least 1 YAML step is defined")

        # Check that number of headers matches number of YAML blocks
        if step_headers and steps:
            if len(step_headers) != len(steps):
                self.errors.append(
                    f"Mismatch: {len(step_headers)} step headers but {len(steps)} YAML blocks"
                )
                print(f"  ❌ Step count mismatch: {len(step_headers)} headers vs {len(steps)} YAML blocks")
            else:
                print(f"  ✅ Step header count matches YAML block count ({len(steps)})")

        # 4. Validate each step structure
        print("\n🔍 Validating step structure...")
        for i, step in enumerate(steps, 1):
            if self.validate_step_structure(step, i):
                print(f"  ✅ Step {i}: {step.get('operationId', 'Unknown')} - structure valid")
            else:
                print(f"  ❌ Step {i}: {step.get('operationId', 'Unknown')} - structure errors")

        # 5. Validate API references and operations
        print("\n🔗 Validating API references and operations...")
        for i, step in enumerate(steps, 1):
            api_urn = step.get('api', 'Unknown')
            operation_id = step.get('operationId', 'Unknown')

            if self.validate_api_and_operation(step, i):
                print(f"  ✅ Step {i}: {operation_id} exists in {api_urn}")
            else:
                print(f"  ❌ Step {i}: Failed to validate {operation_id} in {api_urn}")

        # 6. Validate step dependencies
        print("\n🔀 Validating step dependencies...")
        if self.validate_step_dependencies(steps):
            print("  ✅ All step dependencies valid")
        else:
            print("  ❌ Step dependency errors found")

        # 7. Validate Starting Point section (optional)
        self.validate_starting_point(content, len(steps))

        # 8. Warn about skip annotations on steps with downstream dependencies
        self.validate_skip_annotations(content, steps)

        # Print summary
        self.print_summary()

        return len(self.errors) == 0

    def print_summary(self):
        """Print validation summary."""
        print("\n" + "="*80)

        if self.warnings:
            print(f"\n⚠️  {len(self.warnings)} warning(s):")
            for warning in self.warnings:
                print(f"  ⚠️  {warning}")

        if self.errors:
            print(f"\n❌ FAILED: {len(self.errors)} error(s) found:")
            for error in self.errors:
                print(f"  ❌ {error}")
            return False
        else:
            print("✅ PASSED: Job is valid")
            if self.warnings:
                print(f"   (with {len(self.warnings)} warning(s))")
            return True


def find_api_specs_root(job_file: Path) -> Path:
    """Find the root directory containing API specs."""
    # Assume API specs are in sibling directories to the job
    # Walk up to find the repository root (contains apis/ folder with API specs)
    current = job_file.parent

    # Go up until we find a directory containing apis/api-manager/
    for _ in range(5):  # Limit search depth
        if (current / 'apis' / 'api-manager').exists():
            return current
        current = current.parent

    # Fallback: assume parent of parent (skills/ -> apis/ -> root)
    return job_file.parent.parent.parent


def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python scripts/build/validate_jtbd.py <jtbd-file.md> [api-specs-root]")
        print("\nValidates Jobs-to-be-Done (JTBD) markdown files:")
        print("  ✓ At least 1 step header is defined (## Step 1:, ## Step 2:, etc.)")
        print("  ✓ Step headers are numbered sequentially")
        print("  ✓ Step header count matches YAML block count")
        print("  ✓ At least 1 job step is defined (YAML block)")
        print("  ✓ Each step has a valid YAML code block with required fields")
        print("  ✓ API URN points to an existing folder")
        print("  ✓ OperationId exists in the referenced API spec")
        print("\nExamples:")
        print("  python scripts/build/validate_jtbd.py skills/deploy-api-with-rate-limiting/SKILL.md .")
        print("  python scripts/build/validate_jtbd.py job.md /path/to/api-specs")
        sys.exit(1)

    job_file = Path(sys.argv[1])

    if not job_file.exists():
        print(f"❌ Error: File not found: {job_file}")
        sys.exit(1)

    # Determine API specs root
    if len(sys.argv) >= 3:
        api_specs_root = Path(sys.argv[2])
    else:
        api_specs_root = find_api_specs_root(job_file)

    if not api_specs_root.exists():
        print(f"❌ Error: API specs root not found: {api_specs_root}")
        print("Specify manually: python validate_job_enhanced.py <file> <api-root>")
        sys.exit(1)

    # Run validation
    validator = JobValidator(job_file, api_specs_root)
    is_valid = validator.validate()

    sys.exit(0 if is_valid else 1)


if __name__ == '__main__':
    main()
