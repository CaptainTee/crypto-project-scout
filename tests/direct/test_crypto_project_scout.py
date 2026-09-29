import json
def test_initial_state(direct_deploy):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    assert contract.get_last_url() == ""
    assert contract.get_last_result() == "{}"


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


def test_analyze_project_stores_result(
    direct_vm,
    direct_deploy,
):
    contract = direct_deploy(
        "contracts/crypto_project_scout.py"
    )

    project_result = {
        "project_name": "Endure Network",
        "uses_crypto": True,
        "category": "Infrastructure",
        "chain": "Bittensor",
        "token_status": "Live",
        "summary": (
            "A decentralized risk intelligence network "
            "using Bittensor."
        ),
        "confidence": 95,
    }

    # Pretend this content came from Endure's website.
    direct_vm.mock_web(
        r".*endure\.network.*",
        {
            "status": 200,
            "body": (
                "Endure Network is a decentralized risk "
                "intelligence network built around Bittensor. "
                "Its Forge product provides decentralized "
                "risk parameters for financial markets."
            ),
        },
    )

    # Pretend the GenLayer LLM produced this structured analysis.
    direct_vm.mock_llm(
        r".*Classify the project.*",
        json.dumps(project_result),
    )

    contract.analyze_project(
        "https://endure.network/"
    )

    assert (
        contract.get_last_url()
        == "https://endure.network/"
    )

    stored = json.loads(
        contract.get_last_result()
    )

    assert stored == project_result
    assert stored["uses_crypto"] is True
    assert stored["category"] == "Infrastructure"
    assert stored["chain"] == "Bittensor"
    assert stored["confidence"] == 95
