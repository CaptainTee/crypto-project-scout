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
