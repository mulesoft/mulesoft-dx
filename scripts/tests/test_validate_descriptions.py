"""Tests for the API description validator."""
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add scripts/build to path so we can import the validator
sys.path.insert(0, str(Path(__file__).parent.parent / 'build'))
from validate_descriptions import (
    DescriptionValidator,
    DescriptionViolation,
    APPROVED_STARTING_VERBS,
    BANNED_PREFIXES,
    MIN_DESCRIPTION_LENGTH,
)


class TestDescriptionValidator:
    """Tests for DescriptionValidator."""

    def _make_validator(self, tmp_path, description):
        """Create a validator with a temporary api.yaml containing the given description."""
        api_dir = tmp_path / 'test-api'
        api_dir.mkdir(exist_ok=True)
        api_yaml = api_dir / 'api.yaml'
        # Use a block scalar to avoid YAML quoting issues
        api_yaml.write_text(
            f'openapi: 3.0.0\n'
            f'info:\n'
            f'  title: Test API\n'
            f'  version: 1.0.0\n'
            f'  description: {description}\n'
        )
        return DescriptionValidator(api_dir)

    def test_good_imperative_description(self, tmp_path):
        validator = self._make_validator(tmp_path, 'Manage APIs, policies, and contracts.')
        violations = validator.validate()
        assert len(violations) == 0

    def test_good_multi_sentence(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'Manage alerts and deployments. Monitor application health.'
        )
        violations = validator.validate()
        assert len(violations) == 0

    def test_good_query_verb(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'Query application metrics and performance data for Mule applications.'
        )
        violations = validator.validate()
        assert len(violations) == 0

    def test_good_export_verb(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'Export raw analytics events captured by MuleSoft API gateways.'
        )
        violations = validator.validate()
        assert len(violations) == 0

    def test_banned_provides_programmatic(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'Provides programmatic access to manage alerts and deployments.'
        )
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-boilerplate' in rules
        assert 'description-not-imperative' in rules

    def test_banned_this_is_a_raml(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'This is a RAML 1.0 API Specification of the Test API.'
        )
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-boilerplate' in rules
        assert 'description-not-imperative' in rules

    def test_banned_the_api_allows(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'The Analytics Events Export API allows you to query events.'
        )
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-boilerplate' in rules
        assert 'description-not-imperative' in rules

    def test_banned_api_v_number(self, tmp_path):
        validator = self._make_validator(tmp_path, 'API V2')
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-boilerplate' in rules
        assert 'description-too-short' in rules

    def test_banned_this_api(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'This API lists and retrieves archived monitoring metrics.'
        )
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-boilerplate' in rules
        assert 'description-not-imperative' in rules

    def test_too_short_description(self, tmp_path):
        validator = self._make_validator(tmp_path, 'Manage stuff.')
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-too-short' in rules

    def test_unknown_starting_verb(self, tmp_path):
        validator = self._make_validator(
            tmp_path,
            'Handles all incoming requests and processes them accordingly.'
        )
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-not-imperative' in rules

    def test_missing_description(self, tmp_path):
        api_dir = tmp_path / 'test-api'
        api_dir.mkdir()
        api_yaml = api_dir / 'api.yaml'
        api_yaml.write_text(
            'openapi: 3.0.0\n'
            'info:\n'
            '  title: Test API\n'
            '  version: 1.0.0\n'
        )
        validator = DescriptionValidator(api_dir)
        violations = validator.validate()
        rules = [v.rule for v in violations]
        assert 'description-missing' in rules

    def test_all_approved_verbs_pass(self, tmp_path):
        """Every verb in the approved list should pass when used correctly."""
        for verb in APPROVED_STARTING_VERBS:
            validator = self._make_validator(
                tmp_path,
                f'{verb} resources and configurations across environments.'
            )
            violations = validator.validate()
            not_imperative = [v for v in violations if v.rule == 'description-not-imperative']
            assert len(not_imperative) == 0, f'Verb "{verb}" was rejected'

    def test_missing_api_yaml(self, tmp_path):
        api_dir = tmp_path / 'nonexistent-api'
        api_dir.mkdir()
        validator = DescriptionValidator(api_dir)
        violations = validator.validate()
        assert len(violations) == 0  # No file = no violations (skipped)
