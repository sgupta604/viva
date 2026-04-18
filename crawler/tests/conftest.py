"""Shared test fixtures."""
from __future__ import annotations

from pathlib import Path

import pytest

FIXTURE_ROOT = Path(__file__).parent / "fixtures"
SAMPLE_MODULE = FIXTURE_ROOT / "sample-module"
UNITS = FIXTURE_ROOT / "units"


@pytest.fixture(scope="session")
def fixture_root() -> Path:
    return FIXTURE_ROOT


@pytest.fixture(scope="session")
def sample_module() -> Path:
    return SAMPLE_MODULE


@pytest.fixture(scope="session")
def units_root() -> Path:
    return UNITS
