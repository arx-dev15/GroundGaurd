import os
import sys
import json
import asyncio
import httpx

FINAL_GATE_CASES = [
    # 1. DIRECT FACT
    {
        "id": "gate_01",
        "category": "DIRECT FACT",
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "query": "What refrigerant is used in the Model KC-450 chiller?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["r-134a", "refrigerant"]
    },
    {
        "id": "gate_02",
        "category": "DIRECT FACT",
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "query": "How many edge nodes does the telemetry pipeline ingest from?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["50,000", "edge nodes"]
    },

    # 2. DEFINITION / IDENTITY
    {
        "id": "gate_03",
        "category": "DEFINITION",
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "query": "What is Q-EdgeAttention designed for?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["cortex-m55", "int4", "quantization"]
    },
    {
        "id": "gate_04",
        "category": "IDENTITY",
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "query": "What weapon did Rowan hold in his right hand?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["sunfire blade", "hilt"]
    },

    # 3. FUNCTION / ROLE
    {
        "id": "gate_05",
        "category": "FUNCTION",
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "query": "What is ClickHouse used for in the telemetry architecture?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["clickhouse", "analytics", "time-series"]
    },
    {
        "id": "gate_06",
        "category": "FUNCTION",
        "doc_type": "Technical / Reproduction",
        "project_id": "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40",
        "query": "what does gnd do in pin configuration",
        "expected_nature": "PARTIAL",
        "expected_keywords": ["gnd", "right side", "-"]
    },

    # 4. WHY / PURPOSE
    {
        "id": "gate_07",
        "category": "WHY / PURPOSE",
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "query": "Why is Hessian-weighted second-order error minimization applied?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["entropy", "retraining"]
    },
    {
        "id": "gate_08",
        "category": "WHY / PURPOSE",
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "query": "Why does the low-oil-pressure alarm trip automatically?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["2.2 bar", "15 seconds"]
    },

    # 5. PROCEDURE / SEQUENCE
    {
        "id": "gate_09",
        "category": "PROCEDURE",
        "doc_type": "Technical / Reproduction",
        "project_id": "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40",
        "query": "explain the connectivity setup",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["gnd", "5v", "pin 5", "vin"]
    },
    {
        "id": "gate_10",
        "category": "PROCEDURE",
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "query": "What is Step 1 of immediate containment and evacuation?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["evacuate", "5 meters", "30 minutes"]
    },
    {
        "id": "gate_11",
        "category": "SEQUENCE",
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "query": "What occurs during a primary cloud region outage?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["route 53", "dns", "hot-standby"]
    },

    # 6. MULTI-PASSAGE / SYNTHESIS
    {
        "id": "gate_12",
        "category": "MULTI-PASSAGE",
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "query": "Walk me through the neutralization steps and the disposal procedure.",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["bleach", "pads", "autoclave", "121"]
    },
    {
        "id": "gate_13",
        "category": "MULTI-PASSAGE",
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "query": "What is the pre-start sequence for the compressor before opening variable inlet guide vanes?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["pre-lube", "90-second", "sump heater"]
    },

    # 7. SUMMARY
    {
        "id": "gate_14",
        "category": "SUMMARY",
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "query": "Explain the stream processing and storage architecture.",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["flink", "timescaledb", "clickhouse"]
    },

    # 8. COMPARISON
    {
        "id": "gate_15",
        "category": "COMPARISON",
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "query": "How does inference speedup on ImageNet-1K compare to 16-bit floating-point baselines?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["3.4x", "imagenet", "sram"]
    },

    # 9. FALSE PREMISE (Contradiction & correction from evidence)
    {
        "id": "gate_16",
        "category": "FALSE PREMISE",
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "query": "Why is the chilled water supply setpoint set to 22.0 C?",
        "expected_nature": "CONTRADICTION",
        "expected_keywords": ["6.5"]
    },
    {
        "id": "gate_17",
        "category": "FALSE PREMISE",
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "query": "Does the framework perform full INT2 quantization of activations?",
        "expected_nature": "CONTRADICTION",
        "expected_keywords": ["int8"]
    },
    {
        "id": "gate_18",
        "category": "FALSE PREMISE",
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "query": "Can employees use SMS-based OTP for administrative access?",
        "expected_nature": "CONTRADICTION",
        "expected_keywords": ["prohibited"]
    },

    # 10. PARTIAL SUPPORT (Answer supported portion + qualify missing portion)
    {
        "id": "gate_19",
        "category": "PARTIAL SUPPORT",
        "doc_type": "Research Paper",
        "project_id": "proj_doc_research_paper",
        "query": "What core is targeted and what is the author's university email?",
        "expected_nature": "PARTIAL",
        "expected_keywords": ["cortex-m55"]
    },
    {
        "id": "gate_20",
        "category": "PARTIAL SUPPORT",
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "query": "What is the chilled water setpoint and what is the supplier phone number?",
        "expected_nature": "PARTIAL",
        "expected_keywords": ["6.5"]
    },
    {
        "id": "gate_21",
        "category": "PARTIAL SUPPORT",
        "doc_type": "Technical / Reproduction",
        "project_id": "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40",
        "query": "Why troubleshooting",
        "expected_nature": "PARTIAL",
        "expected_keywords": ["zip", "library", "arduino"]
    },

    # 11. INFORMAL / TYPO
    {
        "id": "gate_22",
        "category": "INFORMAL / TYPO",
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "query": "wher will the gate of mornin open?",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["dawn's edge", "watchtower", "mourning"]
    },
    {
        "id": "gate_23",
        "category": "INFORMAL / TYPO",
        "doc_type": "Technical / Reproduction",
        "project_id": "proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40",
        "query": "what is troubleshooting frm thw source",
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["zip", "library", "arduino"]
    },

    # 12. FOLLOW-UP (Conversation context resolution)
    {
        "id": "gate_24",
        "category": "FOLLOW-UP",
        "doc_type": "Policy / Rules",
        "project_id": "proj_doc_security_policy",
        "query": "How quickly must I report it if lost?",
        "context": [
            {"role": "user", "content": "What are the rules regarding laptops and airline cargo holds?"},
            {"role": "assistant", "content": "Laptops must never be checked into airline cargo holds or left visible inside unattended motor vehicles [Remote Security Policy, p. 2]."}
        ],
        "expected_nature": "SUPPORTED",
        "expected_keywords": ["2 hours", "soc@corp.com"]
    },

    # 13. UNSUPPORTED / ABSENCE (Precise abstention)
    {
        "id": "gate_25",
        "category": "UNSUPPORTED",
        "doc_type": "Technical Manual",
        "project_id": "proj_doc_tech_manual",
        "query": "What brand of refrigerant oil filter is recommended for the secondary loop?",
        "expected_nature": "UNSUPPORTED",
        "expected_keywords": []
    },
    {
        "id": "gate_26",
        "category": "UNSUPPORTED",
        "doc_type": "Narrative / Prose",
        "project_id": "proj_doc_literature",
        "query": "What was the name of Lyra's pet falcon?",
        "expected_nature": "UNSUPPORTED",
        "expected_keywords": []
    },
    {
        "id": "gate_27",
        "category": "UNSUPPORTED",
        "doc_type": "Architecture / Spec",
        "project_id": "proj_doc_telemetry_arch",
        "query": "What is the private password for the Grafana administrative dashboard?",
        "expected_nature": "UNSUPPORTED",
        "expected_keywords": []
    },
    {
        "id": "gate_28",
        "category": "UNSUPPORTED",
        "doc_type": "Incident / SOP",
        "project_id": "proj_doc_biohazard_sop",
        "query": "Who was the manufacturing supervisor on duty during the spill incident?",
        "expected_nature": "UNSUPPORTED",
        "expected_keywords": []
    }
]

async def run_gate():
    print(f"================================================================================")
    print(f"EVIDEX — FINAL PROVIDER-BACKED GENERALIZATION GATE ({len(FINAL_GATE_CASES)} CASES)")
    print(f"================================================================================")

    results = []
    supported_hits = 0
    supported_total = 0
    false_abstentions = 0
    true_abstentions = 0
    unsupported_total = 0
    partial_hits = 0
    partial_total = 0

    client = httpx.AsyncClient(timeout=60.0)

    for idx, c in enumerate(FINAL_GATE_CASES, start=1):
        cid = c["id"]
        cat = c["category"]
        dtype = c["doc_type"]
        pid = c["project_id"]
        q = c["query"]
        expected = c["expected_nature"]
        ctx = c.get("context", [])

        payload = {
            "projectId": pid,
            "query": q,
            "conversationContext": ctx
        }

        data = None
        for attempt in range(4):
            try:
                resp = await client.post("http://localhost:8000/generate", json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    break
                elif resp.status_code in (429, 503):
                    print(f"[{idx:02d}] Rate limited (attempt {attempt+1}), pausing 25s...")
                    await asyncio.sleep(25)
                else:
                    data = resp.json()
                    break
            except Exception as e:
                print(f"[{idx:02d}] Request exception (attempt {attempt+1}): {e}, retrying in 10s...")
                await asyncio.sleep(10)

        if not data:
            print(f"[{idx:02d}] ERROR: Failed after retries")
            continue

        meta = data.get("metadata") or {}
        answer = data.get("answer", "")
        abstention = meta.get("abstention", False)
        suff_score = data.get("sufficiency", {}).get("score", 0.0) if data.get("sufficiency") else 0.0
        reason = meta.get("reason")
        claims = data.get("claims", [])
        evidence_count = len(data.get("evidence", []))

        # Verification logic
        ans_lower = answer.lower()
        keywords_matched = [kw for kw in c["expected_keywords"] if kw.lower() in ans_lower]

        if expected in ("SUPPORTED", "CONTRADICTION"):
            supported_total += 1
            if not abstention and len(keywords_matched) > 0:
                supported_hits += 1
                status = "PASS"
            elif abstention:
                false_abstentions += 1
                status = "FAIL (FALSE ABSTENTION)"
            else:
                status = "FAIL (ANSWER MISMATCH)"
        elif expected == "PARTIAL":
            partial_total += 1
            # Partially supported questions must not falsely abstain totally; must include supported fact
            if not abstention and len(keywords_matched) > 0:
                partial_hits += 1
                status = "PASS (PARTIAL GROUNDED)"
            else:
                status = "FAIL (PARTIAL MISSED)"
        elif expected == "UNSUPPORTED":
            unsupported_total += 1
            if abstention:
                true_abstentions += 1
                status = "PASS (TRUE ABSTENTION)"
            else:
                status = "FAIL (FALSE SUFFICIENT)"

        print(f"[{idx:02d}/28] [{status:24s}] {cat:16s} | {dtype:18s} | Suff: {suff_score:.3f}")
        print(f"     Q: '{q[:60]}'")
        print(f"     A: {answer[:120].strip()}...\n")

        results.append({
            "id": cid,
            "category": cat,
            "doc_type": dtype,
            "query": q,
            "expected": expected,
            "status": status,
            "abstention": abstention,
            "sufficiency_score": suff_score,
            "evidence_count": evidence_count,
            "answer": answer
        })
        await asyncio.sleep(4)

    await client.aclose()

    print("=" * 80)
    print("FINAL PROVIDER GATE METRICS:")
    print(f"  Supported Answer Accuracy: {supported_hits}/{supported_total} ({(supported_hits/supported_total)*100:.1f}%) [Target >= 95%]")
    print(f"  False Abstention Rate:     {false_abstentions}/{supported_total} ({(false_abstentions/supported_total)*100:.1f}%) [Target <= 3%]")
    print(f"  True Abstention Rate:      {true_abstentions}/{unsupported_total} ({(true_abstentions/unsupported_total)*100:.1f}%) [Target >= 95%]")
    print(f"  Partial Support Rate:      {partial_hits}/{partial_total} ({(partial_hits/partial_total)*100:.1f}%) [Target >= 95%]")
    print("=" * 80)

    with open("final_provider_gate_results.json", "w") as out:
        json.dump({
            "total": len(FINAL_GATE_CASES),
            "supported_accuracy": (supported_hits / supported_total) * 100,
            "false_abstention_rate": (false_abstentions / supported_total) * 100,
            "true_abstention_rate": (true_abstentions / unsupported_total) * 100,
            "partial_support_rate": (partial_hits / partial_total) * 100,
            "cases": results
        }, out, indent=2)

if __name__ == "__main__":
    asyncio.run(run_gate())
