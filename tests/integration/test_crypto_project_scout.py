"""End-to-end integration test for Crypto Project Scout.

Run with:

    gltest tests/integration/test_crypto_project_scout.py -v -s --network studionet
"""

import json

import pytest
from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


PROJECT_URL = "https://endure.network/"

ALLOWED_CATEGORIES = {
    "Blockchain-L1",
    "Blockchain-L2",
    "DeFi",
    "Wallet",
    "Infrastructure",
    "AI-Crypto",
    "Robotics-Crypto",
    "Gaming",
    "Other-Crypto",
    "Non-Crypto",
    "Unclear",
}

ALLOWED_TOKEN_STATUS = {
    "Live",
    "Announced",
    "Tokenless",
    "Unknown",
}

ALLOWED_STAGES = {
    "Mainnet",
    "Testnet",
    "Devnet",
    "Pre-launch",
    "Unknown",
}


@pytest.mark.integration
def test_crypto_project_scout_full_flow():
    factory = get_contract_factory("CryptoProjectScout")

    contract = factory.deploy(
        wait_interval=10000,
        wait_retries=30,
    )

    # Fresh deployment state
    assert contract.get_analysis_count(args=[]).call() == 0
    assert contract.get_last_url(args=[]).call() == ""
    assert contract.get_last_result(args=[]).call() == "{}"
    assert contract.get_latest_for_url(args=[PROJECT_URL]).call() == ""

    # Real web + LLM + GenLayer consensus execution
    tx = contract.analyze_project(
        args=[PROJECT_URL]
    ).transact(
        wait_interval=10000,
        wait_retries=30,
    )

    assert tx_execution_succeeded(tx)

    # Verify persistent state
    assert contract.get_analysis_count(args=[]).call() == 1
    assert contract.get_last_url(args=[]).call() == PROJECT_URL

    history_raw = contract.get_analysis_at(args=[0]).call()
    latest_raw = contract.get_latest_for_url(args=[PROJECT_URL]).call()
    last_raw = contract.get_last_result(args=[]).call()

    assert history_raw == latest_raw
    assert history_raw == last_raw

    result = json.loads(history_raw)

    # V3 URL-history requirement
    assert result["url"] == PROJECT_URL

    # Structured result validation
    assert isinstance(result["project_name"], str)
    assert result["project_name"]

    assert isinstance(result["uses_crypto"], bool)

    assert result["category"] in ALLOWED_CATEGORIES

    assert isinstance(result["chain"], str)
    assert result["chain"]

    assert result["token_status"] in ALLOWED_TOKEN_STATUS
    assert result["development_stage"] in ALLOWED_STAGES

    assert isinstance(result["use_case"], str)
    assert result["use_case"]

    assert isinstance(result["crypto_integration"], str)

    assert isinstance(result["confidence"], int)
    assert 0 <= result["confidence"] <= 100
