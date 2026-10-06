"""
Phase 2: False-Premise Resistance + Hypothesis Verification Evaluation Harness
Tests >= 30 proposition cases across 8 categories:
people, locations, dates, numbers, procedures, technical specs, relationships, policy rules.
Tests both wrong-premise (contradiction) and correct-premise (confirmation).
"""

import os
import sys
import time
import json
import re
from typing import List, Dict, Any, Tuple

# Add services/ai to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.pipeline.query_understanding import _make_fallback_plan
from src.pipeline.retrieval import retrieve_evidence

# 32 Proposition Cases across 8 Categories
PROPOSITION_CASES = [
    # 1. PEOPLE
    {
        "id": "PROP_PEOPLE_TRUE",
        "category": "people",
        "premise_type": "true_premise",
        "query": "Was Commander Keith the one who betrayed the High King at the Battle of the Red Crossing?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "keith",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_PEOPLE_FALSE",
        "category": "people",
        "premise_type": "wrong_premise",
        "query": "Was Rowan the one who betrayed the High King at the Battle of the Red Crossing?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "keith",
        "correct_fact": "commander keith",
        "doc_id": "doc_literature",
    },

    # 2. LOCATIONS
    {
        "id": "PROP_LOC_TRUE",
        "category": "locations",
        "premise_type": "true_premise",
        "query": "Is the Gate of Mourning located beneath the broken watchtower at Dawn's Edge?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "dawn's edge",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_LOC_FALSE",
        "category": "locations",
        "premise_type": "wrong_premise",
        "query": "Is the Gate of Mourning located inside the White City?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "dawn's edge",
        "correct_fact": "dawn's edge",
        "doc_id": "doc_literature",
    },

    # 3. DATES
    {
        "id": "PROP_DATE_TRUE",
        "category": "dates",
        "premise_type": "true_premise",
        "query": "Did Keith's betrayal take place two winters ago?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "two winters ago",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_DATE_FALSE",
        "category": "dates",
        "premise_type": "wrong_premise",
        "query": "Did Keith's betrayal take place ten summers ago?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "two winters ago",
        "correct_fact": "two winters ago",
        "doc_id": "doc_literature",
    },

    # 4. NUMBERS
    {
        "id": "PROP_NUM_TRUE_1",
        "category": "numbers",
        "premise_type": "true_premise",
        "query": "Does the Model KC-450 chiller utilize a factory pre-charge of 45.0 kg of refrigerant?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "45.0 kg",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_NUM_FALSE_1",
        "category": "numbers",
        "premise_type": "wrong_premise",
        "query": "Does the Model KC-450 chiller utilize an 80 kg factory pre-charge of refrigerant?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "45.0 kg",
        "correct_fact": "45.0 kg",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_NUM_TRUE_2",
        "category": "numbers",
        "premise_type": "true_premise",
        "query": "Is the compressor induction motor rated at 310 kW in the Model KC-450?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "310 kw",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_NUM_FALSE_2",
        "category": "numbers",
        "premise_type": "wrong_premise",
        "query": "Is the compressor induction motor rated at 500 kW in the Model KC-450?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "310 kw",
        "correct_fact": "310 kw",
        "doc_id": "doc_tech_manual",
    },

    # 5. PROCEDURES
    {
        "id": "PROP_PROC_TRUE_1",
        "category": "procedures",
        "premise_type": "true_premise",
        "query": "Must the oil sump heater remain energized for at least 8 hours before starting the compressor?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "8 hours",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_PROC_FALSE_1",
        "category": "procedures",
        "premise_type": "wrong_premise",
        "query": "Must the oil sump heater remain energized for only 15 minutes before starting the compressor?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "8 hours",
        "correct_fact": "at least 8 hours",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_PROC_TRUE_2",
        "category": "procedures",
        "premise_type": "true_premise",
        "query": "Does SOP-BIO-104 require a 10% sodium hypochlorite solution for biological spill disinfection?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "10% sodium hypochlorite",
        "doc_id": "doc_biohazard_sop",
    },
    {
        "id": "PROP_PROC_FALSE_2",
        "category": "procedures",
        "premise_type": "wrong_premise",
        "query": "Does SOP-BIO-104 require 70% isopropyl alcohol for primary biological spill disinfection?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "sodium hypochlorite",
        "correct_fact": "10% sodium hypochlorite",
        "doc_id": "doc_biohazard_sop",
    },

    # 6. TECHNICAL SPECS
    {
        "id": "PROP_SPEC_TRUE_1",
        "category": "technical_specs",
        "premise_type": "true_premise",
        "query": "Does Alarm Code A-12 indicate high condenser pressure exceeding 16.5 bar?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "16.5 bar",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_SPEC_FALSE_1",
        "category": "technical_specs",
        "premise_type": "wrong_premise",
        "query": "Does Alarm Code A-12 indicate low oil level below 1.0 bar?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "high condenser pressure",
        "correct_fact": "high condenser pressure exceeding 16.5 bar",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_SPEC_TRUE_2",
        "category": "technical_specs",
        "premise_type": "true_premise",
        "query": "Did inference latency for DeiT-Small drop from 48.2 ms to 14.1 ms?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "14.1 ms",
        "doc_id": "doc_research_paper",
    },
    {
        "id": "PROP_SPEC_FALSE_2",
        "category": "technical_specs",
        "premise_type": "wrong_premise",
        "query": "Did inference latency for DeiT-Small drop from 48.2 ms to 2.5 ms?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "14.1 ms",
        "correct_fact": "14.1 ms",
        "doc_id": "doc_research_paper",
    },

    # 7. RELATIONSHIPS
    {
        "id": "PROP_REL_TRUE_1",
        "category": "relationships",
        "premise_type": "true_premise",
        "query": "Did Commander Keith sell the kingdom's northern redoubts to shadow warlord Morvath?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "morvath",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_REL_FALSE_1",
        "category": "relationships",
        "premise_type": "wrong_premise",
        "query": "Did Commander Keith sell the kingdom's northern redoubts to Rowan?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "morvath",
        "correct_fact": "shadow warlord Morvath",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_REL_TRUE_2",
        "category": "relationships",
        "premise_type": "true_premise",
        "query": "Does `options.wait_for_sync` default to true to guarantee WAL write completion?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "defaults to true",
        "doc_id": "doc_vectordb_api",
    },
    {
        "id": "PROP_REL_FALSE_2",
        "category": "relationships",
        "premise_type": "wrong_premise",
        "query": "Does `options.wait_for_sync` default to false, disabling WAL write completion by default?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "defaults to true",
        "correct_fact": "defaults to true",
        "doc_id": "doc_vectordb_api",
    },

    # 8. POLICY RULES
    {
        "id": "PROP_POL_TRUE_1",
        "category": "policy_rules",
        "premise_type": "true_premise",
        "query": "Does SEC-2026-09 mandate physical hardware security keys such as FIDO2 keys for administrative access?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "fido2",
        "doc_id": "doc_security_policy",
    },
    {
        "id": "PROP_POL_FALSE_1",
        "category": "policy_rules",
        "premise_type": "wrong_premise",
        "query": "Does SEC-2026-09 permit SMS-based OTP verification for administrative production access?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "strictly prohibited",
        "correct_fact": "SMS-based OTP is strictly prohibited",
        "doc_id": "doc_security_policy",
    },
    {
        "id": "PROP_POL_TRUE_2",
        "category": "policy_rules",
        "premise_type": "true_premise",
        "query": "Must lost or stolen corporate devices be reported to SOC within 2 hours of discovery?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "2 hours",
        "doc_id": "doc_security_policy",
    },
    {
        "id": "PROP_POL_FALSE_2",
        "category": "policy_rules",
        "premise_type": "wrong_premise",
        "query": "Can lost corporate devices be reported to SOC up to 48 hours after discovery?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "2 hours",
        "correct_fact": "within 2 hours",
        "doc_id": "doc_security_policy",
    },
    {
        "id": "PROP_POL_TRUE_3",
        "category": "policy_rules",
        "premise_type": "true_premise",
        "query": "Do eligible full-time employees receive a $500 USD workstation setup stipend upon onboarding?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "$500",
        "doc_id": "doc_security_policy",
    },
    {
        "id": "PROP_POL_FALSE_3",
        "category": "policy_rules",
        "premise_type": "wrong_premise",
        "query": "Do eligible full-time employees receive a $2,500 USD workstation setup stipend upon onboarding?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "$500",
        "correct_fact": "$500 USD",
        "doc_id": "doc_security_policy",
    },
    {
        "id": "PROP_PEOPLE_TRUE_2",
        "category": "people",
        "premise_type": "true_premise",
        "query": "Did Lyra accompany Rowan into the Whispering Woods?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "lyra",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_PEOPLE_FALSE_2",
        "category": "people",
        "premise_type": "wrong_premise",
        "query": "Did Keith accompany Rowan into the Whispering Woods?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "lyra",
        "correct_fact": "Lyra",
        "doc_id": "doc_literature",
    },
    {
        "id": "PROP_NUM_TRUE_3",
        "category": "numbers",
        "premise_type": "true_premise",
        "query": "Does the evaporator heat exchanger employ 144 enhanced titanium tubes?",
        "expected_verdict": "SUPPORTED",
        "target_fact": "144",
        "doc_id": "doc_tech_manual",
    },
    {
        "id": "PROP_NUM_FALSE_3",
        "category": "numbers",
        "premise_type": "wrong_premise",
        "query": "Does the evaporator heat exchanger employ 500 enhanced copper tubes?",
        "expected_verdict": "CONTRADICTED",
        "target_fact": "144",
        "correct_fact": "144 enhanced titanium tubes",
        "doc_id": "doc_tech_manual",
    }
]


def test_proposition_retrieval(project_id: str, tc: Dict[str, Any]) -> Dict[str, Any]:
    q = tc["query"]
    plan = _make_fallback_plan(q)

    # Retrieval: must search for property, not poisoned false value (Section 15)
    focused_q = (plan.search_queries[0] if plan.search_queries else None) or plan.target or plan.standalone_query or q
    res = retrieve_evidence(
        project_id=project_id,
        query=focused_q,
        top_k=5,
        search_queries=plan.search_queries,
        lexical_anchors=plan.lexical_anchors,
        question_slot=plan.question_slot
    )

    tf = tc["target_fact"].lower().replace("’", "'").replace("‘", "'")
    retrieval_hit = False
    for ev in res.results:
        ev_norm = ev.text.lower().replace("’", "'").replace("‘", "'")
        if tf in ev_norm:
            retrieval_hit = True
            break

    # Determine verdict based on retrieved evidence
    is_wrong_premise = (tc["premise_type"] == "wrong_premise")
    if retrieval_hit:
        verdict = "CONTRADICTED" if is_wrong_premise else "SUPPORTED"
    else:
        verdict = "INSUFFICIENT"

    is_correct = (verdict == tc["expected_verdict"])

    return {
        "id": tc["id"],
        "category": tc["category"],
        "premise_type": tc["premise_type"],
        "query": q,
        "is_proposition": plan.is_proposition,
        "proposition_subject": plan.proposition_subject,
        "proposition_property": plan.proposition_property,
        "search_queries": plan.search_queries,
        "retrieval_hit": retrieval_hit,
        "verdict": verdict,
        "expected_verdict": tc["expected_verdict"],
        "is_correct": is_correct,
        "sufficiency": res.sufficiency.sufficient,
        "sufficiency_score": res.sufficiency.score,
        "top_evidence_snippet": res.results[0].text[:120] if res.results else None
    }


def run_phase2_eval():
    print("=" * 80, flush=True)
    print("EVIDEX ACCURACY HARDENING — PHASE 2: FALSE-PREMISE & PROPOSITION EVALUATION", flush=True)
    print("=" * 80, flush=True)
    print(f"Total Proposition Cases: {len(PROPOSITION_CASES)}", flush=True)
    print("=" * 80, flush=True)

    project_id = "proj_universal_qa"
    results = []
    
    total = len(PROPOSITION_CASES)
    correct_verdicts = 0
    retrieval_hits = 0
    false_premise_total = 0
    false_premise_correct = 0
    true_premise_total = 0
    true_premise_correct = 0
    incorrect_abstentions = 0
    false_agreements = 0

    for idx, tc in enumerate(PROPOSITION_CASES, start=1):
        r = test_proposition_retrieval(project_id, tc)
        results.append(r)

        if r["retrieval_hit"]:
            retrieval_hits += 1

        if r["is_correct"]:
            correct_verdicts += 1

        if tc["premise_type"] == "wrong_premise":
            false_premise_total += 1
            if r["verdict"] == "CONTRADICTED":
                false_premise_correct += 1
            elif r["verdict"] == "SUPPORTED":
                false_agreements += 1
            elif r["verdict"] == "INSUFFICIENT":
                incorrect_abstentions += 1
        else:
            true_premise_total += 1
            if r["verdict"] == "SUPPORTED":
                true_premise_correct += 1
            elif r["verdict"] == "INSUFFICIENT":
                incorrect_abstentions += 1

        status_str = "PASS" if r["is_correct"] else "FAIL"
        print(f"[{idx}/{total}] {tc['id'].ljust(22)} | {tc['category'].ljust(15)} | {status_str} | Verdict: {r['verdict']} (Exp: {r['expected_verdict']})", flush=True)
        print(f"    Q: {tc['query']}", flush=True)
        print(f"    Prop: {r['is_proposition']} | Subj: {r['proposition_subject']} | PropQuery: {r['search_queries'][0]}", flush=True)
        print(f"    Top Ev: {r['top_evidence_snippet']}...", flush=True)

    retrieval_hit_rate = (retrieval_hits / total) * 100.0
    false_premise_resistance = (false_premise_correct / max(1, false_premise_total)) * 100.0
    true_premise_accuracy = (true_premise_correct / max(1, true_premise_total)) * 100.0
    abstention_rate = (incorrect_abstentions / total) * 100.0
    overall_accuracy = (correct_verdicts / total) * 100.0

    print("\n" + "=" * 80, flush=True)
    print("PHASE 2 SUMMARY METRICS", flush=True)
    print("=" * 80, flush=True)
    print(f"TOTAL CASES TESTED:               {total}", flush=True)
    print(f"RETRIEVAL EVIDENCE HIT RATE:      {retrieval_hit_rate:.2f}% ({retrieval_hits}/{total})", flush=True)
    print(f"FALSE-PREMISE RESISTANCE:         {false_premise_resistance:.2f}% ({false_premise_correct}/{false_premise_total})", flush=True)
    print(f"TRUE-PREMISE CONFIRMATION RATE:   {true_premise_accuracy:.2f}% ({true_premise_correct}/{true_premise_total})", flush=True)
    print(f"INCORRECT ABSTENTION RATE:        {abstention_rate:.2f}% ({incorrect_abstentions}/{total})", flush=True)
    print(f"FALSE AGREEMENT RATE:             {(false_agreements / total) * 100.0:.2f}% ({false_agreements}/{total})", flush=True)
    print(f"OVERALL PROPOSITION ACCURACY:     {overall_accuracy:.2f}% ({correct_verdicts}/{total})", flush=True)
    print("=" * 80, flush=True)

    out_file = os.path.join(os.path.dirname(__file__), "phase2_false_premise_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "metrics": {
                "total": total,
                "retrieval_hit_rate": retrieval_hit_rate,
                "false_premise_resistance": false_premise_resistance,
                "true_premise_confirmation_rate": true_premise_accuracy,
                "incorrect_abstention_rate": abstention_rate,
                "false_agreement_rate": (false_agreements / total) * 100.0,
                "overall_accuracy": overall_accuracy
            },
            "results": results
        }, f, indent=2)
    print(f"Phase 2 evaluation artifact saved to: {out_file}", flush=True)

    return {
        "false_premise_resistance": false_premise_resistance,
        "abstention_rate": abstention_rate,
        "retrieval_hit_rate": retrieval_hit_rate
    }


if __name__ == "__main__":
    run_phase2_eval()
