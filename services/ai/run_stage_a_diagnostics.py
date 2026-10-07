import os
import sys
import json
import asyncio

# Setup environment
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["ALLOW_OFFLINE_DB"] = "true"
os.environ["ENVIRONMENT"] = "development"

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from src.pipeline.query_understanding import understand_query
from src.pipeline.retrieval import retrieve_evidence, evaluate_sufficiency, evaluate_scope, compute_evidence_coverage, SUFFICIENCY_THRESHOLD

DIAGNOSTIC_CASES = [
    # 1. Technical Manual (proj_doc_tech_manual / KC450_Chiller_Manual.pdf)
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "DIRECT FACT",
        "query": "What refrigerant is used in the Model KC-450 chiller?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["r-134a", "refrigerant", "kc-450"]
    },
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "NUMERIC VALUE",
        "query": "What is the factory pre-charge amount of refrigerant?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["45.0", "kg", "pre-charge"]
    },
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "PROCEDURE",
        "query": "What does the controller do before ramping compressor variable inlet guide vanes?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["pre-lube", "90-second", "purge"]
    },
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "CAUSE / EFFECT",
        "query": "Why does the low-oil-pressure alarm trip automatically?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["2.2 bar", "15 seconds", "oil pressure"]
    },
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "FALSE PREMISE",
        "query": "Why is the chilled water supply setpoint set to 22.0 C?",
        "expected_support": "SUPPORTED", # evidence exists to contradict premise (6.5 C)
        "expected_anchors": ["6.5", "setpoint", "chilled water"]
    },
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "PARTIAL PREMISE",
        "query": "What is the chilled water setpoint and what is the supplier phone number?",
        "expected_support": "PARTIAL",
        "expected_anchors": ["6.5", "setpoint"]
    },
    {
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "question_class": "ABSENCE / UNSUPPORTED",
        "query": "What brand of refrigerant oil filter is recommended for the secondary loop?",
        "expected_support": "UNSUPPORTED",
        "expected_anchors": []
    },

    # 2. Narrative / Prose (proj_doc_literature / Eldoria_Whispering_Woods.pdf)
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "DIRECT FACT / PERSON",
        "query": "Who betrayed the High King at the Battle of the Red Crossing?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["keith", "commander", "betrayed"]
    },
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "IDENTITY / OBJECT",
        "query": "What weapon did Rowan hold in his right hand?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["sunfire", "blade", "hilt"]
    },
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "LOCATION / WHERE",
        "query": "Where will the Gate of Mourning open?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["watchtower", "dawn", "edge"]
    },
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "TIME / WHEN",
        "query": "When will the Crimson Eclipse darken the valley?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["solstice", "autumn", "three nights"]
    },
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "FALSE PREMISE",
        "query": "Why did Commander Keith sell the redoubts for gold coins?",
        "expected_support": "SUPPORTED", # evidence contradicts premise (blackened silver)
        "expected_anchors": ["silver", "blackened", "seventy chests"]
    },
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "INFORMAL / TYPO",
        "query": "wher will the gate of mornin open?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["watchtower", "dawn", "mourning"]
    },
    {
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "question_class": "ABSENCE / UNSUPPORTED",
        "query": "What was the name of Lyra's pet falcon?",
        "expected_support": "UNSUPPORTED",
        "expected_anchors": []
    },

    # 3. Research Paper (proj_doc_research_paper / Quantized_Edge_Transformer.pdf)
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "DEFINITION",
        "query": "What is Q-EdgeAttention designed for?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["cortex-m55", "int4", "quantization"]
    },
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "NUMERIC VALUE",
        "query": "What was the inference latency reduction on DeiT-Small?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["48.2 ms", "14.1 ms", "deit-small"]
    },
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "PURPOSE / WHY",
        "query": "Why is Hessian-weighted second-order error minimization applied?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["attention entropy", "retraining", "post-training"]
    },
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "COMPARISON",
        "query": "How does inference speedup on ImageNet-1K compare to 16-bit floating-point baselines?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["3.4x", "imagenet", "speedup"]
    },
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "FALSE PREMISE",
        "query": "Does the framework perform full INT2 quantization of activations?",
        "expected_support": "SUPPORTED", # evidence contradicts: activations remain INT8
        "expected_anchors": ["int8", "activations", "quantized"]
    },
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "PARTIAL PREMISE",
        "query": "What core is targeted and what is the author's university email?",
        "expected_support": "PARTIAL",
        "expected_anchors": ["cortex-m55", "ethos"]
    },
    {
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "question_class": "ABSENCE / UNSUPPORTED",
        "query": "What was the total compute cost in GPU hours to train ImageNet?",
        "expected_support": "UNSUPPORTED",
        "expected_anchors": []
    },

    # 4. Policy / Rules (proj_doc_security_policy / SEC_2026_09_Remote_Security.pdf)
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "DIRECT FACT",
        "query": "What are the rules regarding laptops and airline cargo holds?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["cargo holds", "laptops", "never"]
    },
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "TIME / DEADLINE",
        "query": "How quickly must a lost or stolen device be reported to SOC?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["2 hours", "soc@corp.com", "discovery"]
    },
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "NUMERIC VALUE",
        "query": "What is the home workstation setup stipend amount?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["$500", "stipend", "workstation"]
    },
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "PROCEDURE",
        "query": "What multi-factor authentication hardware is mandated for production access?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["fido2", "yubikey", "security keys"]
    },
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "FALSE PREMISE",
        "query": "Can employees use SMS-based OTP for administrative access?",
        "expected_support": "SUPPORTED", # evidence contradicts: strictly prohibited
        "expected_anchors": ["sms-based", "prohibited", "administrative"]
    },
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "COMPOUND QUESTION",
        "query": "What are the core hours and what happens if you report a lost laptop late?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["10:00 utc", "revocation", "disciplinary"]
    },
    {
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "question_class": "ABSENCE / UNSUPPORTED",
        "query": "What is the pet policy for employees working in regional corporate offices?",
        "expected_support": "UNSUPPORTED",
        "expected_anchors": []
    },

    # 5. Architecture / Specification (proj_doc_telemetry_arch / Telemetry_Architecture_v2.3.pdf)
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "DIRECT FACT / SCALE",
        "query": "How many edge nodes does the telemetry pipeline ingest from?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["50,000", "edge nodes", "ingests"]
    },
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "FUNCTION / ROLE",
        "query": "What is ClickHouse used for in the telemetry architecture?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["clickhouse", "time-series", "analytics"]
    },
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "NUMERIC / SLA",
        "query": "What is the recovery time objective (RTO) for automated cloud failover?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["4 minutes", "rto", "recovery time"]
    },
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "SEQUENCE / PROCEDURE",
        "query": "What occurs during a primary cloud region outage?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["route 53", "dns routing", "hot-standby"]
    },
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "FALSE PREMISE",
        "query": "Is Apache Flink running on bare-metal virtual machines without Kubernetes?",
        "expected_support": "SUPPORTED", # contradicts: runs on dedicated Kubernetes node pools
        "expected_anchors": ["kubernetes", "node pools", "flink"]
    },
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "SUMMARY / EXPLANATION",
        "query": "Explain the stream processing and storage architecture.",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["flink", "timescaledb", "clickhouse"]
    },
    {
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "question_class": "ABSENCE / UNSUPPORTED",
        "query": "What is the private password for the Grafana administrative dashboard?",
        "expected_support": "UNSUPPORTED",
        "expected_anchors": []
    },

    # 6. Incident / SOP / Procedure (proj_doc_biohazard_sop / SOP_BIO_104_Cleanroom_Spill.pdf)
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "PROCEDURE",
        "query": "What is Step 1 of immediate containment and evacuation?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["evacuate", "5 meters", "30 minutes"]
    },
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "LIST / ENUMERATION",
        "query": "What personal protective equipment is required for Level C biohazard PPE?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["tyvek", "p100", "respirator", "nitrile"]
    },
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "NUMERIC / DWELL",
        "query": "What is the mandatory disinfectant contact dwell time?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["20 minutes", "contact dwell", "disinfectant"]
    },
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "TIME / SLA",
        "query": "Within what timeframe must EHS-Form-12 be filed?",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["24 hours", "ehs-form-12"]
    },
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "MULTI-PASSAGE",
        "query": "Walk me through the neutralization steps and the disposal procedure.",
        "expected_support": "SUPPORTED",
        "expected_anchors": ["bleach", "pads", "autoclave", "121"]
    },
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "FALSE PREMISE",
        "query": "Should the absorbent spill pads be wiped outward toward the edges?",
        "expected_support": "SUPPORTED", # contradicts: working inward from periphery toward center
        "expected_anchors": ["inward", "periphery", "center"]
    },
    {
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "question_class": "ABSENCE / UNSUPPORTED",
        "query": "Who was the manufacturing supervisor on duty during the spill incident?",
        "expected_support": "UNSUPPORTED",
        "expected_anchors": []
    }
]

async def run_diagnostics():
    print(f"Starting Stage A Diagnostics: {len(DIAGNOSTIC_CASES)} questions across 6 document types...")
    print("=" * 80)
    
    total = len(DIAGNOSTIC_CASES)
    supported_passes = 0
    supported_total = 0
    unsupported_passes = 0
    unsupported_total = 0
    partial_passes = 0
    partial_total = 0
    false_abstentions = 0
    failures = []

    for idx, c in enumerate(DIAGNOSTIC_CASES):
        doc_type = c["doc_type"]
        q_class = c["question_class"]
        q = c["query"]
        expected = c["expected_support"]
        proj_id = c["project_id"]

        # Run retrieval pipeline
        res = retrieve_evidence(
            project_id=proj_id,
            query=q,
            top_k=5,
            request_id=f"diag_{idx}"
        )

        top_score = res.sufficiency.score if res.sufficiency else 0.0
        is_sufficient = res.sufficiency.sufficient if res.sufficiency else False
        top_cand_text = res.results[0].text.lower() if res.results else ""
        combined_text = " ".join(r.text.lower() for r in res.results)

        anchors_found = [a for a in c["expected_anchors"] if a.lower() in combined_text]
        anchor_match = len(anchors_found) > 0 if c["expected_anchors"] else True

        # Evaluate against expectations
        if expected == "SUPPORTED":
            supported_total += 1
            if is_sufficient and anchor_match:
                supported_passes += 1
                status = "PASS"
            else:
                status = "FAIL (FALSE ABSTENTION)" if not is_sufficient else "FAIL (EVIDENCE MISMATCH)"
                false_abstentions += 1
                failures.append({
                    "index": idx,
                    "doc_type": doc_type,
                    "class": q_class,
                    "query": q,
                    "expected": expected,
                    "is_sufficient": is_sufficient,
                    "score": top_score,
                    "anchors_found": anchors_found,
                    "expected_anchors": c["expected_anchors"],
                    "reason": res.sufficiency.reason if res.sufficiency else "N/A"
                })
        elif expected == "PARTIAL":
            partial_total += 1
            if is_sufficient and anchor_match:
                partial_passes += 1
                status = "PASS (PARTIAL GROUNDED)"
            else:
                status = "FAIL (PARTIAL MISSED)"
                failures.append({
                    "index": idx,
                    "doc_type": doc_type,
                    "class": q_class,
                    "query": q,
                    "expected": expected,
                    "is_sufficient": is_sufficient,
                    "score": top_score,
                    "reason": "Failed to retrieve grounded portion"
                })
        elif expected == "UNSUPPORTED":
            unsupported_total += 1
            if not is_sufficient:
                unsupported_passes += 1
                status = "PASS (TRUE ABSTENTION)"
            else:
                status = "FAIL (FALSE SUFFICIENT)"
                failures.append({
                    "index": idx,
                    "doc_type": doc_type,
                    "class": q_class,
                    "query": q,
                    "expected": expected,
                    "is_sufficient": is_sufficient,
                    "score": top_score,
                    "reason": "False positive sufficiency on unsupported query"
                })

        print(f"[{idx+1:02d}/{total}] [{status:24s}] {doc_type:18s} | {q_class:20s} | Score: {top_score:.4f} | Q: '{q[:45]}...'")

    print("\n" + "=" * 80)
    print("STAGE A DIAGNOSTIC SUMMARY:")
    print(f"  Supported Accuracy:   {supported_passes}/{supported_total} ({(supported_passes/supported_total)*100:.1f}%)")
    print(f"  Partial Handling:     {partial_passes}/{partial_total} ({(partial_passes/partial_total)*100:.1f}%)")
    print(f"  True Abstention Rate: {unsupported_passes}/{unsupported_total} ({(unsupported_passes/unsupported_total)*100:.1f}%)")
    print(f"  False Abstention Rate: {false_abstentions}/{supported_total} ({(false_abstentions/supported_total)*100:.1f}%)")
    print("=" * 80)

    if failures:
        print(f"\n{len(failures)} FAILURES IDENTIFIED:")
        for f in failures:
            print(f"  - [{f['doc_type']} - {f['class']}] Q: '{f['query']}'")
            print(f"    Expected: {f['expected']}, Got sufficient={f.get('is_sufficient')}, Score={f.get('score')}")
            print(f"    Reason: {f.get('reason')}")
    else:
        print("\nALL 42 CROSS-DOCUMENT DIAGNOSTIC CASES PASSED PERFECTLY!")

    with open("stage_a_diagnostic_results.json", "w") as out:
        json.dump({
            "total": total,
            "supported_passes": supported_passes,
            "supported_total": supported_total,
            "partial_passes": partial_passes,
            "partial_total": partial_total,
            "unsupported_passes": unsupported_passes,
            "unsupported_total": unsupported_total,
            "failures": failures
        }, out, indent=2)

if __name__ == "__main__":
    asyncio.run(run_diagnostics())
