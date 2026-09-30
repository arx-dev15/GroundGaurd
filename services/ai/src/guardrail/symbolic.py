"""
GroundGuard Deterministic Guard (src/guardrail/symbolic.py)
Implements Mandate 6: Symbolic Gate Latency (<1ms).
Evaluates numerical scaling errors ($500 vs $5,000, 15.2 bar vs 152 bar)
and physical units using Pint and Regex before invoking any neural model.
"""

import re
import time
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger("guardrail-symbolic")

# Initialize Pint unit registry with fallbacks
try:
    import pint
    ureg = pint.UnitRegistry()
    # Define custom engineering units if missing
    try:
        ureg.define('barg = bar')
        ureg.define('bara = bar')
    except Exception:
        pass
    PINT_AVAILABLE = True
except Exception as e:
    logger.warning(f"Pint initialization warning: {e}. Fallback regex scaling enabled.")
    ureg = None
    PINT_AVAILABLE = False


CURRENCY_PATTERN = re.compile(r'(\$|€|£|¥)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)')
NUMERIC_UNIT_PATTERN = re.compile(
    r'([-+]?\d+(?:,\d{3})*(?:\.\d+)?)\s*([a-zA-Z°%µ][a-zA-Z0-9°%/³\^_-]*)'
)


def extract_quantities(text: str) -> List[Dict[str, Any]]:
    """
    Extracts all currencies, numerical values, and physical units from text in <0.3ms.
    """
    quantities = []

    # 1. Currencies ($500, $5,000.00)
    for m in CURRENCY_PATTERN.finditer(text):
        symbol = m.group(1)
        val_str = m.group(2).replace(',', '')
        try:
            val = float(val_str)
            quantities.append({
                "type": "currency",
                "symbol": symbol,
                "value": val,
                "raw": m.group(0),
                "unit": symbol
            })
        except ValueError:
            pass

    # 2. Physical Units (15.2 bar, 120 m³/h, 1450 rpm, 50 °C)
    for m in NUMERIC_UNIT_PATTERN.finditer(text):
        val_str = m.group(1).replace(',', '')
        unit_str = m.group(2)
        try:
            val = float(val_str)
            quantities.append({
                "type": "physical",
                "value": val,
                "unit": unit_str,
                "raw": m.group(0)
            })
        except ValueError:
            pass

    return quantities


class SymbolicVerificationResult:
    def __init__(self, passed: bool, discrepancy: Optional[str] = None, suggested_fix: Optional[str] = None, latency_ms: float = 0.0):
        self.passed = passed
        self.discrepancy = discrepancy
        self.suggested_fix = suggested_fix
        self.latency_ms = latency_ms


def verify_sentence_symbolic(
    claim_sentence: str,
    evidence_texts: List[str]
) -> SymbolicVerificationResult:
    """
    Mandate 6: Fast Symbolic Gate (<1ms).
    Compares numerical values, currencies ($500 vs $5,000), and units between claim and evidence.
    Returns SymbolicVerificationResult with instant suggested fix if scaling or unit mismatch detected.
    """
    t0 = time.perf_counter()
    claim_quantities = extract_quantities(claim_sentence)
    
    # If no numbers/units in claim, symbolic gate passes immediately in <0.1ms
    if not claim_quantities:
        latency = (time.perf_counter() - t0) * 1000.0
        return SymbolicVerificationResult(passed=True, latency_ms=latency)

    # Extract all evidence quantities
    evidence_quantities = []
    combined_ev = " ".join(evidence_texts)
    evidence_quantities = extract_quantities(combined_ev)

    if not evidence_quantities:
        # Claim asserted numbers but evidence has none -> Conflict / Missing
        latency = (time.perf_counter() - t0) * 1000.0
        return SymbolicVerificationResult(
            passed=False,
            discrepancy=f"Claim asserts numeric values ({[q['raw'] for q in claim_quantities]}) absent in source text",
            latency_ms=latency
        )

    # Check each claim quantity against evidence
    for cq in claim_quantities:
        c_val = cq["value"]
        c_raw = cq["raw"]
        c_type = cq["type"]

        matched = False
        potential_substitute = None

        for eq in evidence_quantities:
            # Same currency or physical unit family
            if cq["unit"].lower() == eq["unit"].lower():
                e_val = eq["value"]
                if abs(c_val - e_val) < 1e-5:
                    matched = True
                    break
                else:
                    # Detected numerical scaling error (e.g. $500 vs $5,000 or 15.2 vs 152)
                    potential_substitute = eq["raw"]

            # If Pint is available, check compatible dimensional conversion
            elif PINT_AVAILABLE and c_type == "physical" and eq["type"] == "physical":
                try:
                    q_c = c_val * ureg(cq["unit"])
                    q_e = eq["value"] * ureg(eq["unit"])
                    if q_c.dimensionality == q_e.dimensionality:
                        if abs(q_c.to_base_units().magnitude - q_e.to_base_units().magnitude) < 1e-4:
                            matched = True
                            break
                        else:
                            potential_substitute = eq["raw"]
                except Exception:
                    pass

        if not matched:
            latency = (time.perf_counter() - t0) * 1000.0
            return SymbolicVerificationResult(
                passed=False,
                discrepancy=f"Numerical scaling/unit mismatch on '{c_raw}'",
                suggested_fix=potential_substitute,
                latency_ms=latency
            )

    latency = (time.perf_counter() - t0) * 1000.0
    return SymbolicVerificationResult(passed=True, latency_ms=latency)
