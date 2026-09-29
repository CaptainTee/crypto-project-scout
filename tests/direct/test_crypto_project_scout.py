import json


def test_initial_state(direct_deploy):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    assert contract.get_last_url() == ""
    assert contract.get_last_result() == "{}"
    assert contract.get_analysis_count() == 0


def test_invalid_url_is_rejected(
    direct_vm,
    direct_deploy,
):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    with direct_vm.expect_revert(
        "URL must start with http:// or https://"
    ):
        contract.analyze_project("endure.network")


def _setup_endure_mocks(direct_vm):
    project_result = {
        "project_name": "Endure Network",
        "uses_crypto": True,
        "category": "Infrastructure",
        "chain": "Bittensor",
        "token_status": "Live",
        "development_stage": "Mainnet",
        "use_case": (
            "Decentralized risk intelligence "
            "for financial markets."
        ),
        "crypto_integration": (
            "Uses Bittensor infrastructure "
            "for decentralized intelligence."
        ),
        "confidence": 95,
    }

    direct_vm.mock_web(
        r".*endure\.network.*",
        {
            "status": 200,
            "body": (
                "Endure Network is a decentralized risk "
                "intelligence network using Bittensor."
            ),
        },
    )

    direct_vm.mock_llm(
        r".*Classify the project.*",
        json.dumps(project_result),
    )

    return project_result


def test_analyze_project_stores_result(
    direct_vm,
    direct_deploy,
):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    expected = _setup_endure_mocks(direct_vm)

    url = "https://endure.network/"

    contract.analyze_project(url)

    assert contract.get_last_url() == url

    stored = json.loads(
        contract.get_last_result()
    )

    assert stored == expected
    assert contract.get_analysis_count() == 1


def test_analysis_history(
    direct_vm,
    direct_deploy,
):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    expected = _setup_endure_mocks(direct_vm)

    url = "https://endure.network/"

    contract.analyze_project(url)
    contract.analyze_project(url)

    assert contract.get_analysis_count() == 2

    first = json.loads(
        contract.get_analysis_at(0)
    )

    second = json.loads(
        contract.get_analysis_at(1)
    )

    assert first == expected
    assert second == expected


def test_latest_result_by_url(
    direct_vm,
    direct_deploy,
):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    expected = _setup_endure_mocks(direct_vm)

    url = "https://endure.network/"

    contract.analyze_project(url)

    result = json.loads(
        contract.get_latest_for_url(url)
    )

    assert result == expected


def test_missing_url_returns_empty(
    direct_deploy,
):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    assert (
        contract.get_latest_for_url(
            "https://example.com/"
        )
        == ""
    )
