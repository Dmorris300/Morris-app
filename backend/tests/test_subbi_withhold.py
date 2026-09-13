"""SUBBI-WITHHOLD-01 — Ensure the Subbi Payment Certificate financials
come from the numeric `amountWithheld` input, never from the free-text
`paylessReason`. Tests the deterministic Python safety-net directly (no
network, no LLM) so the guarantee is regression-locked even if the
model's behaviour drifts.

Run: cd /app/backend && REACT_APP_BACKEND_URL=... python -m pytest tests/test_subbi_withhold.py -q
"""

import pytest
from server import (
    _parse_money,
    _fmt_gbp,
    _build_subbi_financial_block,
    _enforce_subbi_financials,
)


class TestParseMoney:
    @pytest.mark.parametrize("v,expected", [
        (None, None),
        ("", None),
        ("   ", None),
        (0, 0.0),
        ("0", 0.0),
        ("0.00", 0.0),
        (4250, 4250.0),
        (4250.5, 4250.5),
        ("4250", 4250.0),
        ("4,250", 4250.0),
        ("4,250.00", 4250.0),
        ("£4,250.00", 4250.0),
        ("  £4,250  ", 4250.0),
        ("123.45", 123.45),
        ("0.01", 0.01),
        # Invalid → None
        ("not-a-number", None),
        ("abc", None),
        ("£abc", None),
        ("-100", None),  # negative not allowed
        (True, None),    # bool must not slip through
        (False, None),
    ])
    def test_parse_money_edge_cases(self, v, expected):
        assert _parse_money(v) == expected


class TestFormatGbp:
    def test_two_decimals_and_thousands(self):
        assert _fmt_gbp(4250) == "£4,250.00"
        assert _fmt_gbp(4250.5) == "£4,250.50"
        assert _fmt_gbp(1234567.89) == "£1,234,567.89"
        assert _fmt_gbp(0) == "£0.00"
        assert _fmt_gbp(0.01) == "£0.01"


class TestBuildFinancialBlock:
    def test_no_certified_value_returns_empty(self):
        assert _build_subbi_financial_block(None, 250) == []

    def test_zero_withheld_prints_only_gross(self):
        lines = _build_subbi_financial_block(4250, 0)
        assert lines == ["Gross value certified: £4,250.00"]

    def test_missing_withheld_prints_only_gross(self):
        lines = _build_subbi_financial_block(4250, None)
        assert lines == ["Gross value certified: £4,250.00"]

    def test_normal_case_prints_three_lines(self):
        lines = _build_subbi_financial_block(4250, 250)
        assert lines == [
            "Gross value certified: £4,250.00",
            "Amount withheld: £250.00",
            "Net sum due: £4,000.00",
        ]

    def test_decimal_withheld(self):
        lines = _build_subbi_financial_block(4250, 123.45)
        assert lines == [
            "Gross value certified: £4,250.00",
            "Amount withheld: £123.45",
            "Net sum due: £4,126.55",
        ]

    def test_penny_withheld(self):
        lines = _build_subbi_financial_block(4250, 0.01)
        assert lines == [
            "Gross value certified: £4,250.00",
            "Amount withheld: £0.01",
            "Net sum due: £4,249.99",
        ]

    def test_over_withholding_prints_warning_and_zero_net(self):
        lines = _build_subbi_financial_block(4250, 5000)
        assert lines == [
            "Amount withheld (£5,000.00) exceeds certified value (£4,250.00) — please check inputs before issuing this certificate.",
            "Net sum due: £0.00",
        ]

    def test_exact_full_withhold_leaves_zero_net(self):
        lines = _build_subbi_financial_block(4250, 4250)
        assert lines == [
            "Gross value certified: £4,250.00",
            "Amount withheld: £4,250.00",
            "Net sum due: £0.00",
        ]


class TestEnforceOnLlmOutput:
    def test_llm_infers_wrong_withheld_from_reason_text_backend_overrides(self):
        """The reported bug: LLM read '£250' out of the free-text reason
        and computed Net = £4,000. Backend must lock the numeric input in."""
        llm = (
            "SUBBI PAYMENT CERTIFICATE\n"
            "\n"
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £250.00\n"
            "Net sum due: £4,000.00\n"
            "\n"
            "PAY LESS NOTICE — s.111 HGCRA 1996\n"
            "Reason: £250 withheld pending completion of outstanding snagging works.\n"
        )
        # User actually left amountWithheld blank — nothing should be withheld.
        out = _enforce_subbi_financials(llm, {"certifiedValue": "4250"})
        assert "Gross value certified: £4,250.00" in out
        assert "Amount withheld" not in out.split("Reason:")[0], (
            "backend must NOT print an Amount withheld line when the numeric input is blank"
        )
        assert "Net sum due" not in out.split("Reason:")[0], (
            "backend must NOT print a Net sum line when there is nothing to withhold"
        )
        # The reason paragraph, which happens to contain the string '£250 withheld',
        # is preserved verbatim below the calculation block.
        assert "£250 withheld pending completion" in out

    def test_llm_writes_correct_lines_backend_no_op(self):
        llm = (
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £250.00\n"
            "Net sum due: £4,000.00\n"
        )
        out = _enforce_subbi_financials(llm, {"certifiedValue": "4250", "amountWithheld": "250"})
        assert out == llm

    def test_llm_gets_arithmetic_wrong_backend_corrects(self):
        llm = (
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £250.00\n"
            "Net sum due: £3,999.99\n"  # wrong
        )
        out = _enforce_subbi_financials(llm, {"certifiedValue": "4250", "amountWithheld": "250"})
        assert "Net sum due: £4,000.00" in out
        assert "£3,999.99" not in out

    def test_over_withholding_replaces_calculation_block(self):
        llm = (
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £5,000.00\n"
            "Net sum due: -£750.00\n"  # illegal negative net
        )
        out = _enforce_subbi_financials(llm, {"certifiedValue": "4250", "amountWithheld": "5000"})
        assert "exceeds certified value" in out
        assert "please check inputs before issuing this certificate" in out
        assert "Net sum due: £0.00" in out
        assert "-£750.00" not in out
        assert "£5,000.00 — please" not in out or "£5,000.00) exceeds" in out

    def test_penny_arithmetic_locked(self):
        llm = (
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £0.02\n"  # LLM wrote wrong penny value
            "Net sum due: £4,249.98\n"
        )
        out = _enforce_subbi_financials(llm, {"certifiedValue": "4250", "amountWithheld": "0.01"})
        assert "Amount withheld: £0.01" in out
        assert "Net sum due: £4,249.99" in out

    def test_llm_extracts_number_from_reason_but_user_did_not_fill_withheld(self):
        """Exact user-reported repro: paylessReason mentions £250, form has
        no explicit Amount Withheld, backend forces no-withhold output."""
        llm = (
            "APPLICATION NUMBER: SUB-TEST-01\n"
            "\n"
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £250.00\n"  # inferred from reason
            "Net sum due: £4,000.00\n"
            "\n"
            "Reason: £250 withheld pending completion of outstanding snagging works.\n"
        )
        out = _enforce_subbi_financials(llm, {
            "certifiedValue": "4250",
            "paylessReason": "£250 withheld pending completion of outstanding snagging works.",
            # amountWithheld deliberately absent
        })
        # Verify canonical shape: only Gross, no Withheld, no Net.
        lines_before_reason = out.split("Reason:")[0]
        assert "Gross value certified: £4,250.00" in lines_before_reason
        assert "Amount withheld" not in lines_before_reason
        assert "Net sum due" not in lines_before_reason
        # Reason text preserved verbatim.
        assert "£250 withheld pending completion" in out

    def test_non_numeric_amount_withheld_treated_as_zero(self):
        llm = (
            "Gross value certified: £4,250.00\n"
            "Amount withheld: £250.00\n"
            "Net sum due: £4,000.00\n"
        )
        out = _enforce_subbi_financials(llm, {
            "certifiedValue": "4250",
            "amountWithheld": "not-a-number",
        })
        # Non-numeric → treated as blank → only Gross printed.
        assert "Gross value certified: £4,250.00" in out
        assert "Amount withheld" not in out
        assert "Net sum due" not in out

    def test_bullet_prefixes_and_indentation_preserved(self):
        llm = "  - Gross value certified: £4,250.00\n  - Amount withheld: £999.00\n  - Net sum due: £3,251.00\n"
        out = _enforce_subbi_financials(llm, {"certifiedValue": "4250", "amountWithheld": "250"})
        assert "  - Gross value certified: £4,250.00" in out
        assert "  - Amount withheld: £250.00" in out
        assert "  - Net sum due: £4,000.00" in out

    def test_empty_llm_output_no_change(self):
        assert _enforce_subbi_financials("", {"certifiedValue": "4250", "amountWithheld": "250"}) == ""

    def test_no_certified_value_returns_unchanged(self):
        llm = "Gross value certified: £4,250.00\nAmount withheld: £250.00\nNet sum due: £4,000.00\n"
        out = _enforce_subbi_financials(llm, {"paylessReason": "£250 withheld"})
        assert out == llm  # nothing to enforce, safety net stays out of the way
