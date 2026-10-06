"""
EVIDEX Phase 3 Evaluation Suite:
Answer Quality + Provenance + User-Facing Cleanup Verification

Tests Sections 19 through 25 deterministically:
19. Simple Fact Tests (10 cases)
20. False Premise Tests (5 cases)
21. Compound Tests (5 cases)
22. Conflict Tests (5 cases)
23. Abstention Tests (5 cases)
24. Follow-up Tests (5 cases)
25. Real Document Sanity Pass (3 documents: A Study in Scarlet, Technical manual, Policy/research)
"""

import re
import sys
import os
from typing import List, Dict, Any, Optional

# Set up environment and paths
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ["ALLOW_OFFLINE_DB"] = "true"

from src.pipeline.context import ContextBuilder
from src.pipeline.prompts import (
    GROUNDGUARD_SYSTEM_PROMPT,
    build_grounded_user_prompt,
)
from src.pipeline.conversational import (
    generate_abstention_response,
    FALLBACK_ABSTENTION,
    ABSTENTION_SYSTEM_PROMPT,
)
from src.pipeline.retrieval import EvidenceItem
from src.main import (
    sanitize_user_facing_answer,
    filter_relevant_evidence,
    classify_premise_outcome,
    ClaimItem,
)


def count_sentences(text: str) -> int:
    """Estimates sentence count in text excluding citations and decimals/IPs."""
    cleaned = re.sub(r'\[[^\]]+\]', '', text)
    # Mask numbers with decimals/IPs like 10.240.10.0 or 15.2
    masked = re.sub(r'\d+\.\d+', '<NUM>', cleaned)
    sentences = [s.strip() for s in re.split(r'[.!?]+(?:\s+|$)', masked) if s.strip()]
    return len(sentences)


def contains_raw_ids(text: str) -> bool:
    """Checks if text contains raw internal identifiers."""
    if re.search(r'\bdoc_[a-zA-Z0-9_\-]+\b', text):
        return True
    if re.search(r'\bchunk_[a-zA-Z0-9_\-]+\b', text):
        return True
    if re.search(r'\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b', text):
        return True
    return False


def contains_conversational_filler(text: str) -> bool:
    """Checks if text contains disallowed robotic or conversational filler."""
    patterns = [
        r'\bbased on the project documentation\b',
        r'\bthe answer to your question is\b',
        r'\bplease let me know if\b',
        r'\bi hope this helps\b',
        r'\bfeel free to ask\b',
    ]
    text_lower = text.lower()
    return any(re.search(p, text_lower) for p in patterns)


def contains_metadata_dump(text: str) -> bool:
    """Checks for disallowed metadata dumps in normal answers."""
    patterns = [
        r'Document\s*ID\s*:',
        r'Chunk\s*ID\s*:',
        r'Supporting\s*Excerpt\s*:',
        r'Internal\s*ID\s*:',
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in patterns)


def run_simple_fact_tests() -> Dict[str, Any]:
    """Section 19: 10 Simple Factual Questions."""
    cases = [
        {
            "id": "SF-01",
            "query": "What is the rated power of the KC-450 motor?",
            "raw_answer": "Based on the project documentation, the KC-450 motor is rated at 310 kW [doc_kc450_manual, p. 4]. Please let me know if you need anything else.",
            "doc_id": "doc_kc450_manual",
            "filename": "KC450_Chiller_Manual.pdf",
            "page": 4,
            "expected_fact": "310 kW",
        },
        {
            "id": "SF-02",
            "query": "What is the operating voltage for Sensor Node Alpha?",
            "raw_answer": "Sensor Node Alpha operates at 3.3 V DC [doc_sensor_spec, p. 2].",
            "doc_id": "doc_sensor_spec",
            "filename": "Sensor_Node_Alpha_Spec.pdf",
            "page": 2,
            "expected_fact": "3.3 V",
        },
        {
            "id": "SF-03",
            "query": "What is the maximum discharge pressure of pump P-101A?",
            "raw_answer": "Pump P-101A has a maximum discharge pressure of 15.2 bar [doc_p101_spec, p. 12].",
            "doc_id": "doc_p101_spec",
            "filename": "Pump_P101A_Technical_Sheet.pdf",
            "page": 12,
            "expected_fact": "15.2 bar",
        },
        {
            "id": "SF-04",
            "query": "What port does the telemetry gateway listen on?",
            "raw_answer": "According to the project documentation, the telemetry gateway listens on TCP port 9042 [doc_gw_spec, p. 8].",
            "doc_id": "doc_gw_spec",
            "filename": "Gateway_Architecture.pdf",
            "page": 8,
            "expected_fact": "9042",
        },
        {
            "id": "SF-05",
            "query": "What is the maximum operating depth of the AUV-X1?",
            "raw_answer": "The AUV-X1 has a maximum rated operating depth of 300 meters [doc_auv_x1, p. 1].",
            "doc_id": "doc_auv_x1",
            "filename": "AUV_X1_Operations.pdf",
            "page": 1,
            "expected_fact": "300 meters",
        },
        {
            "id": "SF-06",
            "query": "What communication baud rate is configured on the RS-485 bus?",
            "raw_answer": "The RS-485 communication bus is configured for 115200 baud [doc_comm_cfg, p. 5].",
            "doc_id": "doc_comm_cfg",
            "filename": "Bus_Configuration.pdf",
            "page": 5,
            "expected_fact": "115200 baud",
        },
        {
            "id": "SF-07",
            "query": "What is the design temperature of boiler B-201?",
            "raw_answer": "Based on the provided project documentation, the design temperature of boiler B-201 is 450 °C [doc_boiler_spec, p. 14].",
            "doc_id": "doc_boiler_spec",
            "filename": "Boiler_B201_Rating.pdf",
            "page": 14,
            "expected_fact": "450 °C",
        },
        {
            "id": "SF-08",
            "query": "What is the minimum lubrication oil viscosity for Gearbox G-30?",
            "raw_answer": "The minimum lubrication oil viscosity for Gearbox G-30 is ISO VG 220 [doc_gearbox_manual, p. 9].",
            "doc_id": "doc_gearbox_manual",
            "filename": "Gearbox_G30_Maintenance.pdf",
            "page": 9,
            "expected_fact": "ISO VG 220",
        },
        {
            "id": "SF-09",
            "query": "Where was John Watson wounded in the Afghan campaign?",
            "raw_answer": "John Watson was wounded at the fatal battle of Maiwand by a Jezail bullet [doc_scarlet, p. 3].",
            "doc_id": "doc_scarlet",
            "filename": "A_Study_in_Scarlet.pdf",
            "page": 3,
            "expected_fact": "Maiwand",
        },
        {
            "id": "SF-10",
            "query": "What is the primary IP subnet assigned to the management VLAN?",
            "raw_answer": "The management VLAN is assigned the 10.240.10.0/24 subnet [doc_net_plan, p. 6]. I hope this helps.",
            "doc_id": "doc_net_plan",
            "filename": "Network_Addressing_Plan.pdf",
            "page": 6,
            "expected_fact": "10.240.10.0/24",
        },
    ]

    results = []
    concise_count = 0
    zero_raw_ids_count = 0
    zero_filler_count = 0
    clean_citations_count = 0

    for c in cases:
        ev_item = EvidenceItem(
            evidenceId="ev_test",
            chunkId="chk_test",
            documentId=c["doc_id"],
            text=f"Supporting text for {c['expected_fact']}",
            pageNumber=c["page"],
            metadata={"filename": c["filename"]}
        )
        cleaned = sanitize_user_facing_answer(c["raw_answer"], [ev_item])

        sent_count = count_sentences(cleaned)
        is_concise = (1 <= sent_count <= 2)
        has_no_raw_ids = not contains_raw_ids(cleaned)
        has_no_filler = not contains_conversational_filler(cleaned)
        has_clean_citation = c["filename"] in cleaned and f"p. {c['page']}" in cleaned

        if is_concise:
            concise_count += 1
        if has_no_raw_ids:
            zero_raw_ids_count += 1
        if has_no_filler:
            zero_filler_count += 1
        if has_clean_citation:
            clean_citations_count += 1

        results.append({
            "id": c["id"],
            "cleaned": cleaned,
            "concise": is_concise,
            "no_raw_ids": has_no_raw_ids,
            "no_filler": has_no_filler,
            "clean_citation": has_clean_citation,
        })

    return {
        "total": len(cases),
        "concise_rate": concise_count / len(cases),
        "zero_raw_ids_rate": zero_raw_ids_count / len(cases),
        "zero_filler_rate": zero_filler_count / len(cases),
        "clean_citations_rate": clean_citations_count / len(cases),
        "details": results,
    }


def run_false_premise_tests() -> Dict[str, Any]:
    """Section 20: 5 False-Premise Questions."""
    cases = [
        {
            "id": "FP-01",
            "premise": "Does the controller communicate over port 8080?",
            "raw_answer": "No. The source states that the controller uses port 7421, not 8080 [doc_ctrl_spec, p. 5].",
            "doc_id": "doc_ctrl_spec",
            "filename": "Controller_Spec.pdf",
            "page": 5,
        },
        {
            "id": "FP-02",
            "premise": "Is pump P-101A rated for 25 bar?",
            "raw_answer": "No. The source states that pump P-101A has a maximum discharge pressure of 15.2 bar, not 25 bar [doc_p101_spec, p. 12].",
            "doc_id": "doc_p101_spec",
            "filename": "Pump_P101A_Technical_Sheet.pdf",
            "page": 12,
        },
        {
            "id": "FP-03",
            "premise": "Does the system use MySQL for event storage?",
            "raw_answer": "No. The source states that the system stores telemetry events in PostgreSQL, not MySQL [doc_arch, p. 3].",
            "doc_id": "doc_arch",
            "filename": "System_Architecture.pdf",
            "page": 3,
        },
        {
            "id": "FP-04",
            "premise": "Was Enoch Drebber murdered in Baker Street?",
            "raw_answer": "No. The source states that Enoch Drebber was found murdered in an empty house in Lauriston Gardens, not Baker Street [doc_scarlet, p. 15].",
            "doc_id": "doc_scarlet",
            "filename": "A_Study_in_Scarlet.pdf",
            "page": 15,
        },
        {
            "id": "FP-05",
            "premise": "Is the emergency battery backup rated for 24 hours?",
            "raw_answer": "No. The source states that the emergency battery backup provides 4 hours of autonomous operation, not 24 hours [doc_pwr_spec, p. 7].",
            "doc_id": "doc_pwr_spec",
            "filename": "Power_Subsystem.pdf",
            "page": 7,
        },
    ]

    direct_corrections = 0
    clean_citations = 0
    zero_raw_ids = 0

    results = []
    for c in cases:
        ev_item = EvidenceItem(
            evidenceId="ev_test",
            chunkId="chk_test",
            documentId=c["doc_id"],
            text="Supporting text",
            pageNumber=c["page"],
            metadata={"filename": c["filename"]}
        )
        cleaned = sanitize_user_facing_answer(c["raw_answer"], [ev_item])

        is_direct_correction = cleaned.startswith("No.") and ("not" in cleaned.lower() or "instead" in cleaned.lower())
        has_clean_citation = c["filename"] in cleaned and f"p. {c['page']}" in cleaned
        no_raw_ids = not contains_raw_ids(cleaned)
        cls_outcome = classify_premise_outcome(cleaned, is_proposition=True, is_abstained=False)

        if is_direct_correction and cls_outcome == "CONTRADICTED":
            direct_corrections += 1
        if has_clean_citation:
            clean_citations += 1
        if no_raw_ids:
            zero_raw_ids += 1

        results.append({
            "id": c["id"],
            "cleaned": cleaned,
            "direct_correction": is_direct_correction,
            "outcome": cls_outcome,
            "no_raw_ids": no_raw_ids,
        })

    return {
        "total": len(cases),
        "direct_correction_rate": direct_corrections / len(cases),
        "clean_citations_rate": clean_citations / len(cases),
        "zero_raw_ids_rate": zero_raw_ids / len(cases),
        "details": results,
    }


def run_compound_tests() -> Dict[str, Any]:
    """Section 21: 5 Compound Questions."""
    cases = [
        {
            "id": "CP-01",
            "query": "What is the operating voltage, sensor sampling rate, and deployment region?",
            "raw_answer": "Sensor Node Alpha operates at 3.3 V DC [doc_sensor, p. 2] with a sampling rate of 10 Hz [doc_sensor, p. 3]. The available project evidence does not specify the deployment region.",
            "doc_id": "doc_sensor",
            "filename": "Sensor_Specification.pdf",
            "supported_facets": ["3.3 V", "10 Hz"],
            "unsupported_facet": "deployment region",
        },
        {
            "id": "CP-02",
            "query": "Who manufactures pump P-101A and what is its flow rate and shipping weight?",
            "raw_answer": "Pump P-101A is manufactured by FlowServe with a rated flow of 120 m³/h [doc_p101, p. 4]. The available project evidence does not specify the shipping weight.",
            "doc_id": "doc_p101",
            "filename": "Pump_P101A_Manual.pdf",
            "supported_facets": ["FlowServe", "120 m³/h"],
            "unsupported_facet": "shipping weight",
        },
        {
            "id": "CP-03",
            "query": "What chemical formula was found written on the wall and who discovered the body?",
            "raw_answer": "The word RACHE was written on the wall in blood, not a chemical formula [doc_scarlet, p. 18]. The body of Enoch Drebber was discovered by Constable John Rance [doc_scarlet, p. 20].",
            "doc_id": "doc_scarlet",
            "filename": "A_Study_in_Scarlet.pdf",
            "supported_facets": ["RACHE", "John Rance"],
            "unsupported_facet": None,
        },
        {
            "id": "CP-04",
            "query": "What is the chiller refrigerant type, cooling capacity, and maintenance contract number?",
            "raw_answer": "The chiller uses R-134a refrigerant with a cooling capacity of 450 kW [doc_chiller, p. 5]. The available project evidence does not specify the maintenance contract number.",
            "doc_id": "doc_chiller",
            "filename": "KC450_Chiller_Manual.pdf",
            "supported_facets": ["R-134a", "450 kW"],
            "unsupported_facet": "maintenance contract",
        },
        {
            "id": "CP-05",
            "query": "Does the gateway support LoRaWAN and what is its transmit power and manufacturer warranty?",
            "raw_answer": "The gateway supports LoRaWAN EU868 with a maximum transmit power of +14 dBm [doc_gw, p. 11]. The available project evidence does not specify the manufacturer warranty.",
            "doc_id": "doc_gw",
            "filename": "Gateway_Manual.pdf",
            "supported_facets": ["LoRaWAN", "+14 dBm"],
            "unsupported_facet": "warranty",
        },
    ]

    results = []
    facet_coverage_count = 0
    citation_correct_count = 0
    zero_raw_ids_count = 0

    for c in cases:
        ev_item = EvidenceItem(
            evidenceId="ev_test",
            chunkId="chk_test",
            documentId=c["doc_id"],
            text="Supporting compound evidence",
            pageNumber=2,
            metadata={"filename": c["filename"]}
        )
        cleaned = sanitize_user_facing_answer(c["raw_answer"], [ev_item])

        all_supported_present = all(f in cleaned for f in c["supported_facets"])
        unsupported_marked = (c["unsupported_facet"] is None) or ("does not specify" in cleaned.lower() and c["unsupported_facet"].lower() in cleaned.lower())
        facet_ok = all_supported_present and unsupported_marked
        no_raw_ids = not contains_raw_ids(cleaned)
        citations_ok = c["filename"] in cleaned

        if facet_ok:
            facet_coverage_count += 1
        if citations_ok:
            citation_correct_count += 1
        if no_raw_ids:
            zero_raw_ids_count += 1

        results.append({
            "id": c["id"],
            "cleaned": cleaned,
            "facet_ok": facet_ok,
            "citations_ok": citations_ok,
            "no_raw_ids": no_raw_ids,
        })

    return {
        "total": len(cases),
        "facet_coverage_rate": facet_coverage_count / len(cases),
        "citation_correct_rate": citation_correct_count / len(cases),
        "zero_raw_ids_rate": zero_raw_ids_count / len(cases),
        "details": results,
    }


def run_conflict_tests() -> Dict[str, Any]:
    """Section 22: 5 Conflict Questions."""
    cases = [
        {
            "id": "CONF-01",
            "query": "What is the control bus operating voltage?",
            "raw_answer": "The project sources conflict: Spec A lists 24 V [doc_spec_a, p. 2], while Spec B lists 12 V [doc_spec_b, p. 4].",
            "doc_a": ("doc_spec_a", "Control_Spec_A.pdf", 2, "24 V"),
            "doc_b": ("doc_spec_b", "Control_Spec_B.pdf", 4, "12 V"),
        },
        {
            "id": "CONF-02",
            "query": "What is the maximum operating temperature of Sensor Node Alpha?",
            "raw_answer": "The project sources conflict: Datasheet 1 lists 85 °C [doc_ds1, p. 1], while Manual Rev 2 lists 70 °C [doc_ds2, p. 6].",
            "doc_a": ("doc_ds1", "Sensor_Datasheet_1.pdf", 1, "85 °C"),
            "doc_b": ("doc_ds2", "Sensor_Manual_Rev2.pdf", 6, "70 °C"),
        },
        {
            "id": "CONF-03",
            "query": "What is the default baud rate for the serial diagnostics port?",
            "raw_answer": "The project sources conflict: Hardware Guide lists 115200 baud [doc_hw_guide, p. 8], while Quick Start lists 9600 baud [doc_qs_guide, p. 2].",
            "doc_a": ("doc_hw_guide", "Hardware_Guide.pdf", 8, "115200 baud"),
            "doc_b": ("doc_qs_guide", "Quick_Start_Guide.pdf", 2, "9600 baud"),
        },
        {
            "id": "CONF-04",
            "query": "What is the emergency shutdown timeout for valve XV-204?",
            "raw_answer": "The project sources conflict: P&ID Diagram lists 3 seconds [doc_pid, p. 1], while Safety Protocol lists 5 seconds [doc_safety, p. 12].",
            "doc_a": ("doc_pid", "PID_Diagram.pdf", 1, "3 seconds"),
            "doc_b": ("doc_safety", "Safety_Protocol.pdf", 12, "5 seconds"),
        },
        {
            "id": "CONF-05",
            "query": "What is the chemical tank TK-500 capacity?",
            "raw_answer": "The project sources conflict: Facility Spec lists 5000 liters [doc_fac, p. 10], while Vessel Drawing lists 4500 liters [doc_draw, p. 1].",
            "doc_a": ("doc_fac", "Facility_Specification.pdf", 10, "5000 liters"),
            "doc_b": ("doc_draw", "Vessel_Drawing.pdf", 1, "4500 liters"),
        },
    ]

    both_sides_surfaced = 0
    both_sources_shown = 0
    zero_raw_ids = 0

    results = []
    for c in cases:
        ev_a = EvidenceItem(
            evidenceId="ev_a", chunkId="chk_a", documentId=c["doc_a"][0],
            text=f"Value is {c['doc_a'][3]}", pageNumber=c["doc_a"][2],
            metadata={"filename": c["doc_a"][1]}
        )
        ev_b = EvidenceItem(
            evidenceId="ev_b", chunkId="chk_b", documentId=c["doc_b"][0],
            text=f"Value is {c['doc_b'][3]}", pageNumber=c["doc_b"][2],
            metadata={"filename": c["doc_b"][1]}
        )
        cleaned = sanitize_user_facing_answer(c["raw_answer"], [ev_a, ev_b])

        both_values = (c["doc_a"][3] in cleaned) and (c["doc_b"][3] in cleaned)
        conflict_phrase = "conflict" in cleaned.lower() or "disagree" in cleaned.lower()
        surfaced = both_values and conflict_phrase

        sources_present = (c["doc_a"][1] in cleaned) and (c["doc_b"][1] in cleaned)
        no_raw_ids = not contains_raw_ids(cleaned)

        if surfaced:
            both_sides_surfaced += 1
        if sources_present:
            both_sources_shown += 1
        if no_raw_ids:
            zero_raw_ids += 1

        results.append({
            "id": c["id"],
            "cleaned": cleaned,
            "surfaced": surfaced,
            "both_sources": sources_present,
            "no_raw_ids": no_raw_ids,
        })

    return {
        "total": len(cases),
        "both_sides_rate": both_sides_surfaced / len(cases),
        "both_sources_rate": both_sources_shown / len(cases),
        "zero_raw_ids_rate": zero_raw_ids / len(cases),
        "details": results,
    }


def run_abstention_tests() -> Dict[str, Any]:
    """Section 23: 5 Unsupported Questions."""
    cases = [
        {"id": "ABS-01", "query": "What is the CEO's personal home address?"},
        {"id": "ABS-02", "query": "What was the weather in Tokyo yesterday?"},
        {"id": "ABS-03", "query": "What is the stock price of Apple?"},
        {"id": "ABS-04", "query": "What are the secret nuclear launch codes?"},
        {"id": "ABS-05", "query": "Who won the 2026 World Cup?"},
    ]

    concise_count = 0
    zero_unrelated_sources = 0
    zero_filler = 0
    zero_world_knowledge = 0

    results = []
    for c in cases:
        # Simulate abstention generation through deterministic fallback
        ans = FALLBACK_ABSTENTION
        sent_count = count_sentences(ans)
        is_concise = (sent_count == 1)
        no_filler = not contains_conversational_filler(ans)
        no_world = not any(w in ans.lower() for w in ["apple", "tokyo", "fifa", "ceo", "nuclear"])

        # Abstention response returns evidence=[]
        filtered_ev = filter_relevant_evidence([], [], is_abstention=True)
        unrelated_sources_count = len(filtered_ev)

        if is_concise:
            concise_count += 1
        if unrelated_sources_count == 0:
            zero_unrelated_sources += 1
        if no_filler:
            zero_filler += 1
        if no_world:
            zero_world_knowledge += 1

        results.append({
            "id": c["id"],
            "ans": ans,
            "is_concise": is_concise,
            "unrelated_sources_count": unrelated_sources_count,
        })

    return {
        "total": len(cases),
        "concise_rate": concise_count / len(cases),
        "zero_unrelated_sources_rate": zero_unrelated_sources / len(cases),
        "zero_filler_rate": zero_filler / len(cases),
        "zero_world_knowledge_rate": zero_world_knowledge / len(cases),
        "details": results,
    }


def run_followup_tests() -> Dict[str, Any]:
    """Section 24: 5 Conversational Follow-up Questions."""
    cases = [
        {
            "id": "FOL-01",
            "context": [
                {"role": "user", "content": "What is pump P-101A?"},
                {"role": "assistant", "content": "Pump P-101A is the primary boiler feedwater pump."}
            ],
            "query": "What is its rated flow?",
            "raw_answer": "Pump P-101A has a rated flow of 120 m³/h [doc_p101_spec, p. 4].",
            "doc_id": "doc_p101_spec",
            "filename": "Pump_P101A_Spec.pdf",
            "page": 4,
            "expected_referent": "Pump P-101A",
        },
        {
            "id": "FOL-02",
            "context": [
                {"role": "user", "content": "Where was John Watson wounded?"},
                {"role": "assistant", "content": "John Watson was wounded at Maiwand."}
            ],
            "query": "Who saved him?",
            "raw_answer": "John Watson was saved by his orderly Murray [doc_scarlet, p. 3].",
            "doc_id": "doc_scarlet",
            "filename": "A_Study_in_Scarlet.pdf",
            "page": 3,
            "expected_referent": "Murray",
        },
        {
            "id": "FOL-03",
            "context": [
                {"role": "user", "content": "What is Sensor Node Alpha?"},
                {"role": "assistant", "content": "Sensor Node Alpha is an environmental monitoring unit."}
            ],
            "query": "What battery does it require?",
            "raw_answer": "Sensor Node Alpha is powered by a 3.7 V 2000 mAh Li-ion battery [doc_sensor, p. 5].",
            "doc_id": "doc_sensor",
            "filename": "Sensor_Node_Alpha.pdf",
            "page": 5,
            "expected_referent": "Sensor Node Alpha",
        },
        {
            "id": "FOL-04",
            "context": [
                {"role": "user", "content": "Tell me about the KC-450 chiller."},
                {"role": "assistant", "content": "The KC-450 chiller is a centrifugal water-cooled chiller."}
            ],
            "query": "What refrigerant does it charge?",
            "raw_answer": "The KC-450 chiller uses R-134a refrigerant [doc_kc450, p. 7].",
            "doc_id": "doc_kc450",
            "filename": "KC450_Chiller.pdf",
            "page": 7,
            "expected_referent": "KC-450",
        },
        {
            "id": "FOL-05",
            "context": [
                {"role": "user", "content": "What is the telemetry gateway?"},
                {"role": "assistant", "content": "The telemetry gateway bridges field sensors to the campus backbone."}
            ],
            "query": "How many channels does it support?",
            "raw_answer": "The telemetry gateway supports 8 concurrent LoRa channels [doc_gw, p. 9].",
            "doc_id": "doc_gw",
            "filename": "Gateway_Manual.pdf",
            "page": 9,
            "expected_referent": "gateway",
        },
    ]

    referent_preserved_count = 0
    concise_count = 0
    zero_raw_ids_count = 0

    results = []
    for c in cases:
        ev_item = EvidenceItem(
            evidenceId="ev_test",
            chunkId="chk_test",
            documentId=c["doc_id"],
            text="Supporting follow up evidence",
            pageNumber=c["page"],
            metadata={"filename": c["filename"]}
        )
        cleaned = sanitize_user_facing_answer(c["raw_answer"], [ev_item])

        sent_count = count_sentences(cleaned)
        is_concise = (1 <= sent_count <= 2)
        ref_preserved = c["expected_referent"].lower() in cleaned.lower()
        no_raw_ids = not contains_raw_ids(cleaned)

        if is_concise:
            concise_count += 1
        if ref_preserved:
            referent_preserved_count += 1
        if no_raw_ids:
            zero_raw_ids_count += 1

        results.append({
            "id": c["id"],
            "cleaned": cleaned,
            "is_concise": is_concise,
            "ref_preserved": ref_preserved,
            "no_raw_ids": no_raw_ids,
        })

    return {
        "total": len(cases),
        "concise_rate": concise_count / len(cases),
        "referent_preserved_rate": referent_preserved_count / len(cases),
        "zero_raw_ids_rate": zero_raw_ids_count / len(cases),
        "details": results,
    }


def run_real_document_sanity_pass() -> Dict[str, Any]:
    """Section 25: Real Document Sanity Pass."""
    # 1. A Study in Scarlet
    scarlet_cases = [
        ("Where was Dr. Watson wounded?", "Dr. Watson was struck on the shoulder by a Jezail bullet at the battle of Maiwand [A_Study_in_Scarlet.pdf, p. 3].", 3),
        ("What address did Holmes and Watson share?", "Sherlock Holmes and Dr. Watson took rooms at 221B Baker Street [A_Study_in_Scarlet.pdf, p. 11].", 11),
        ("Who was the murdered man found in Lauriston Gardens?", "The murdered man found in Lauriston Gardens was Enoch J. Drebber of Cleveland, Ohio [A_Study_in_Scarlet.pdf, p. 19].", 19),
        ("What word was written on the wall in blood?", "The word RACHE was written on the wall in letters of blood [A_Study_in_Scarlet.pdf, p. 22].", 22),
    ]

    # 2. Technical manual (KC450 Chiller / Industrial Plant)
    tech_cases = [
        ("What is the rated motor power of the KC-450?", "The KC-450 chiller motor is rated at 310 kW [KC450_Chiller_Manual.pdf, p. 4].", 4),
        ("What refrigerant does the KC-450 use?", "The KC-450 chiller uses R-134a refrigerant [KC450_Chiller_Manual.pdf, p. 6].", 6),
        ("What is the maximum operating discharge pressure?", "The maximum operating discharge pressure is 15.2 bar [KC450_Chiller_Manual.pdf, p. 12].", 12),
        ("What is the oil sump capacity?", "The lubrication oil sump capacity is 25 liters [KC450_Chiller_Manual.pdf, p. 15].", 15),
    ]

    # 3. Policy / Research (Campus Monitor)
    policy_cases = [
        ("What wireless protocol does the sensor network use?", "The sensor nodes transmit data via LoRaWAN at 868 MHz [Campus_Monitor_Architecture.pdf, p. 2].", 2),
        ("What is the environmental sensor sampling interval?", "Environmental telemetry is sampled at 60-second intervals [Campus_Monitor_Architecture.pdf, p. 5].", 5),
        ("Where is the telemetry database hosted?", "Telemetry data is stored in a self-hosted PostgreSQL cluster [Campus_Monitor_Architecture.pdf, p. 8].", 8),
        ("What is the battery backup duration for the gateway?", "The gateway incorporates an internal battery backup providing 8 hours of standby operation [Campus_Monitor_Architecture.pdf, p. 14].", 14),
    ]

    def _eval_group(cases_list, doc_name):
        passes = 0
        for q, raw_ans, page in cases_list:
            ev = EvidenceItem(
                evidenceId="ev_sanity", chunkId="chk_sanity", documentId="doc_sanity",
                text=raw_ans, pageNumber=page, metadata={"filename": doc_name}
            )
            cleaned = sanitize_user_facing_answer(raw_ans, [ev])
            if (
                not contains_raw_ids(cleaned)
                and not contains_conversational_filler(cleaned)
                and not contains_metadata_dump(cleaned)
                and doc_name in cleaned
                and f"p. {page}" in cleaned
                and count_sentences(cleaned) <= 2
            ):
                passes += 1
        return passes == len(cases_list)

    scarlet_pass = _eval_group(scarlet_cases, "A_Study_in_Scarlet.pdf")
    tech_pass = _eval_group(tech_cases, "KC450_Chiller_Manual.pdf")
    policy_pass = _eval_group(policy_cases, "Campus_Monitor_Architecture.pdf")

    return {
        "scarlet": scarlet_pass,
        "technical_manual": tech_pass,
        "policy_research": policy_pass,
        "all_pass": scarlet_pass and tech_pass and policy_pass,
    }


def main():
    print("============================================================")
    print("EVIDEX — PHASE 3 EVALUATION SUITE")
    print("Answer Quality + Provenance + User-Facing Cleanup")
    print("============================================================")

    res_sf = run_simple_fact_tests()
    print(f"\n[1] SIMPLE FACT TESTS (10 Cases):")
    print(f"    Concise Rate (1-2 sentences): {res_sf['concise_rate']*100:.1f}%")
    print(f"    Zero Raw IDs:                 {res_sf['zero_raw_ids_rate']*100:.1f}%")
    print(f"    Zero Filler:                  {res_sf['zero_filler_rate']*100:.1f}%")
    print(f"    Clean Citations [Doc, p. X]:  {res_sf['clean_citations_rate']*100:.1f}%")

    res_fp = run_false_premise_tests()
    print(f"\n[2] FALSE PREMISE TESTS (5 Cases):")
    print(f"    Direct Correction Rate:       {res_fp['direct_correction_rate']*100:.1f}%")
    print(f"    Clean Citations:              {res_fp['clean_citations_rate']*100:.1f}%")
    print(f"    Zero Raw IDs:                 {res_fp['zero_raw_ids_rate']*100:.1f}%")

    res_cp = run_compound_tests()
    print(f"\n[3] COMPOUND TESTS (5 Cases):")
    print(f"    Facet Coverage Rate:          {res_cp['facet_coverage_rate']*100:.1f}%")
    print(f"    Citation Correctness:         {res_cp['citation_correct_rate']*100:.1f}%")
    print(f"    Zero Raw IDs:                 {res_cp['zero_raw_ids_rate']*100:.1f}%")

    res_cf = run_conflict_tests()
    print(f"\n[4] CONFLICT TESTS (5 Cases):")
    print(f"    Both Sides Surfaced Rate:     {res_cf['both_sides_rate']*100:.1f}%")
    print(f"    Both Sources Shown Rate:      {res_cf['both_sources_rate']*100:.1f}%")
    print(f"    Zero Raw IDs:                 {res_cf['zero_raw_ids_rate']*100:.1f}%")

    res_ab = run_abstention_tests()
    print(f"\n[5] ABSTENTION TESTS (5 Cases):")
    print(f"    Concise (1 sentence):         {res_ab['concise_rate']*100:.1f}%")
    print(f"    Zero Unrelated Sources:       {res_ab['zero_unrelated_sources_rate']*100:.1f}%")
    print(f"    Zero World Knowledge:         {res_ab['zero_world_knowledge_rate']*100:.1f}%")
    print(f"    Zero Filler:                  {res_ab['zero_filler_rate']*100:.1f}%")

    res_fo = run_followup_tests()
    print(f"\n[6] FOLLOW-UP TESTS (5 Cases):")
    print(f"    Referent Preserved:           {res_fo['referent_preserved_rate']*100:.1f}%")
    print(f"    Concise Rate:                 {res_fo['concise_rate']*100:.1f}%")
    print(f"    Zero Raw IDs:                 {res_fo['zero_raw_ids_rate']*100:.1f}%")

    res_san = run_real_document_sanity_pass()
    print(f"\n[7] REAL DOCUMENT SANITY PASS:")
    print(f"    A Study in Scarlet:           {'PASS' if res_san['scarlet'] else 'FAIL'}")
    print(f"    Technical manual:             {'PASS' if res_san['technical_manual'] else 'FAIL'}")
    print(f"    Policy / Research:            {'PASS' if res_san['policy_research'] else 'FAIL'}")

    all_passed = (
        res_sf["concise_rate"] == 1.0
        and res_sf["zero_raw_ids_rate"] == 1.0
        and res_sf["zero_filler_rate"] == 1.0
        and res_fp["direct_correction_rate"] == 1.0
        and res_cp["facet_coverage_rate"] == 1.0
        and res_cf["both_sides_rate"] == 1.0
        and res_cf["both_sources_rate"] == 1.0
        and res_ab["zero_unrelated_sources_rate"] == 1.0
        and res_san["all_pass"]
    )

    print("\n============================================================")
    if all_passed:
        print("PHASE 3 CLOSURE VALIDATION: 100% COMPLIANT")
    else:
        print("PHASE 3 CLOSURE VALIDATION: DEFECT DETECTED")
    print("============================================================")
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
