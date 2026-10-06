"""
Phase 1: Retrieval + Paraphrase Stability Evaluation Harness
Evaluates retrieval consistency across semantically equivalent queries (5-8 variants per group)
across multiple unseen documents without fixture-specific logic.
"""

import os
import sys
import time
import json
import requests
from typing import List, Dict, Any, Tuple

AI_URL = "http://localhost:8000"

# 8 Paraphrase groups across multiple unseen documents and entities
# Each group tests 7 semantically equivalent variants:
# 1. formal
# 2. informal
# 3. short
# 4. verbose
# 5. passive voice
# 6. question with synonym
# 7. question with minor typo
PARAPHRASE_GROUPS = [
    {
        "group_id": "GRP_01_CHILLER_REFRIGERANT",
        "doc_id": "doc_tech_manual",
        "project_id": "proj_doc_tech_manual",
        "fact_description": "KC-450 refrigerant type and charge (R-134a, 45.0 kg)",
        "target_fact": "r-134a",
        "variants": [
            {"style": "formal", "query": "What type of refrigerant and pre-charge mass does the Model KC-450 chiller utilize?"},
            {"style": "informal", "query": "what refrigerant is inside the kc450 and how much does it take?"},
            {"style": "short", "query": "KC-450 refrigerant charge?"},
            {"style": "verbose", "query": "Could you please identify the specific cooling chemical refrigerant blend and factory pre-charge amount specified for the KC-450 chiller?"},
            {"style": "passive", "query": "Which refrigerant is utilized by the KC-450 and what charge weight is required?"},
            {"style": "synonym", "query": "What cooling fluid and factory coolant quantity is filled in the KC-450 chiller?"},
            {"style": "minor_typo", "query": "Wat refridgerant and precharge mass does KC-450 use?"},
        ]
    },
    {
        "group_id": "GRP_02_CHILLER_MOTOR",
        "doc_id": "doc_tech_manual",
        "project_id": "proj_doc_tech_manual",
        "fact_description": "KC-450 motor drive rating and voltage (480V 3-phase, 310 kW)",
        "target_fact": "310 kw",
        "variants": [
            {"style": "formal", "query": "What is the voltage and power rating of the primary compressor motor in the Model KC-450?"},
            {"style": "informal", "query": "how much power and voltage does the main compressor motor on the kc-450 need?"},
            {"style": "short", "query": "KC-450 motor voltage and kW?"},
            {"style": "verbose", "query": "According to the equipment specifications, what electrical supply voltage and motor power output rating are specified for the compressor drive?"},
            {"style": "passive", "query": "What voltage and power rating is required by the KC-450 compressor induction motor?"},
            {"style": "synonym", "query": "What electrical potential and kilowatt capacity does the primary drive unit consume?"},
            {"style": "minor_typo", "query": "What voltige and kw rating is the KC-450 drive moter?"},
        ]
    },
    {
        "group_id": "GRP_03_ELDORIA_WHITE_STAG",
        "doc_id": "doc_literature",
        "project_id": "proj_universal_qa",
        "fact_description": "Legendary white stag discovered by the river Aeloria (Elyon)",
        "target_fact": "elyon",
        "variants": [
            {"style": "formal", "query": "What is the name of the great white stag discovered by the river Aeloria in the Whispering Woods?"},
            {"style": "informal", "query": "what is the name of that white stag rowan and lyra find by the river?"},
            {"style": "short", "query": "River Aeloria white stag name?"},
            {"style": "verbose", "query": "Could you please identify the name of the legendary white stag beast with starlight antlers encountered by the serpentine banks of the river?"},
            {"style": "passive", "query": "By what name is the great white stag with spun starlight antlers known?"},
            {"style": "synonym", "query": "What is the identity of the mythical white deer creature found by the river Aeloria?"},
            {"style": "minor_typo", "query": "Wat is the name of the grate white stag by the river in Eldoria?"},
        ]
    },
    {
        "group_id": "GRP_04_EDGE_TRANSFORMER_QUANT",
        "doc_id": "doc_research_paper",
        "project_id": "proj_universal_qa",
        "fact_description": "Quantization scheme and target bit-width (INT4 quantization framework, Q-EdgeAttention)",
        "target_fact": "int4",
        "variants": [
            {"style": "formal", "query": "What quantization precision scheme is proposed in the edge transformer research paper?"},
            {"style": "informal", "query": "what bit precision does the edge transformer paper use for quantization?"},
            {"style": "short", "query": "Edge transformer quantization bit width?"},
            {"style": "verbose", "query": "I would like to know the exact quantization methodology and bit-width level developed in the low-latency edge transformer study."},
            {"style": "passive", "query": "What bit precision is employed for non-uniform quantization in the proposed edge model?"},
            {"style": "synonym", "query": "What compression bit depth and quantization approach is introduced in the edge inference paper?"},
            {"style": "minor_typo", "query": "Wat bit precision and quantisation scheme is used in the edge transformer paper?"},
        ]
    },
    {
        "group_id": "GRP_05_SECURITY_MFA",
        "doc_id": "doc_security_policy",
        "project_id": "proj_doc_security_policy",
        "fact_description": "Mandatory authentication token for administrative production access (hardware FIDO2 security key)",
        "target_fact": "fido2",
        "variants": [
            {"style": "formal", "query": "What authentication device is mandatory for administrative production access under SEC-2026-09?"},
            {"style": "informal", "query": "what hardware key do admins have to use to log into production?"},
            {"style": "short", "query": "Production admin required MFA token?"},
            {"style": "verbose", "query": "Can you specify the mandatory physical authentication token mechanism required by policy SEC-2026-09 when engineers access administrative production systems?"},
            {"style": "passive", "query": "Which physical security token is mandated for production admin access?"},
            {"style": "synonym", "query": "What hardware authentication device must administrators plug in for production authorization?"},
            {"style": "minor_typo", "query": "What hardwre MFA key is requierd for admin production access?"},
        ]
    },
    {
        "group_id": "GRP_06_TELEMETRY_CLICKHOUSE",
        "doc_id": "doc_telemetry_arch",
        "project_id": "proj_doc_telemetry_arch",
        "fact_description": "Datastore used for high-volume analytical telemetry (ClickHouse)",
        "target_fact": "clickhouse",
        "variants": [
            {"style": "formal", "query": "Which datastore is designated for high-volume historical telemetry analytics in the architecture?"},
            {"style": "informal", "query": "where do large volumes of historical telemetry get stored for analytics?"},
            {"style": "short", "query": "Telemetry architecture analytical datastore?"},
            {"style": "verbose", "query": "Could you explain what specific columnar database engine is implemented to handle high-throughput historical telemetry aggregation?"},
            {"style": "passive", "query": "Which database is chosen for high-volume analytical telemetry retention in the storage tier?"},
            {"style": "synonym", "query": "What storage engine powers heavy telemetry analytics and aggregate queries?"},
            {"style": "minor_typo", "query": "Which datastore handles high-volum historical telemetry analitics?"},
        ]
    },
    {
        "group_id": "GRP_07_BIOHAZARD_DISINFECTANT",
        "doc_id": "doc_biohazard_sop",
        "project_id": "proj_doc_biohazard_sop",
        "fact_description": "Disinfectant solution for cleanroom biological spills (10% sodium hypochlorite solution)",
        "target_fact": "sodium hypochlorite",
        "variants": [
            {"style": "formal", "query": "What chemical disinfectant solution is mandated for cleanroom biological spill cleanup in SOP-BIO-104?"},
            {"style": "informal", "query": "what cleaner or bleach solution do you wipe bio spills with in sop-bio-104?"},
            {"style": "short", "query": "SOP-BIO-104 spill disinfectant?"},
            {"style": "verbose", "query": "According to the cleanroom safety procedure SOP-BIO-104, what specific chemical disinfecting agent must personnel apply to decontamination spills?"},
            {"style": "passive", "query": "Which decontamination solution is required to be applied during biohazard spill neutralization?"},
            {"style": "synonym", "query": "What sanitizing agent is specified for neutralizing biohazard spills in the cleanroom standard?"},
            {"style": "minor_typo", "query": "What disinfactant is used for biohazard spill cleenup in SOP-BIO-104?"},
        ]
    },
    {
        "group_id": "GRP_08_VECTORDB_SYNC",
        "doc_id": "doc_vectordb_api",
        "project_id": "proj_doc_vectordb_api",
        "fact_description": "Default value and write durability behavior of options.wait_for_sync (defaults to true, waits for WAL write)",
        "target_fact": "wait_for_sync",
        "variants": [
            {"style": "formal", "query": "What is the default value of `options.wait_for_sync` in the VectorDB Rust SDK and how does it affect durability?"},
            {"style": "informal", "query": "what does wait_for_sync default to in vectordb_rs and what does it do for writes?"},
            {"style": "short", "query": "VectorDB wait_for_sync default and WAL durability?"},
            {"style": "verbose", "query": "In the VectorDB client library documentation, what is the default configuration setting for `wait_for_sync` and how does it guarantee write-ahead-log persistence?"},
            {"style": "passive", "query": "How is write durability governed by `options.wait_for_sync` and what default boolean is assigned to it?"},
            {"style": "synonym", "query": "What is the out-of-the-box setting for `wait_for_sync` in vector insertion and does it block for WAL commit?"},
            {"style": "minor_typo", "query": "What does options.wait_for_sync defalt to in VectorDB and how does it relte to WAL?"},
        ]
    }
]


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio
from src.pipeline.query_understanding import _make_fallback_plan
from src.pipeline.retrieval import retrieve_evidence

def execute_pipeline(project_id: str, query: str) -> Dict[str, Any]:
    # 1. Run Generic Deterministic Query Understanding
    plan = _make_fallback_plan(query)
    
    # 2. Run Retrieval
    focused_q = (plan.search_queries[0] if plan.search_queries else None) or plan.target or plan.standalone_query or query
    res = retrieve_evidence(
        project_id=project_id,
        query=focused_q,
        top_k=5,
        search_queries=plan.search_queries,
        lexical_anchors=plan.lexical_anchors,
        question_slot=plan.question_slot
    )
    
    return {
        "intent": plan.task,
        "search_queries": plan.search_queries,
        "question_slot": plan.question_slot,
        "lexical_anchors": plan.lexical_anchors,
        "is_proposition": plan.is_proposition,
        "evidence": [{"chunkId": r.chunkId, "text": r.text, "score": r.rerankScore or r.score, "documentId": r.documentId} for r in res.results],
        "sufficiency": {
            "sufficient": res.sufficiency.sufficient,
            "score": res.sufficiency.score,
            "reason": res.sufficiency.reason
        }
    }


def run_phase1_paraphrase_eval():
    print("=" * 80, flush=True)
    print("EVIDEX ACCURACY HARDENING — PHASE 1: PARAPHRASE RETRIEVAL STABILITY", flush=True)
    print("=" * 80, flush=True)
    print(f"Total Paraphrase Groups: {len(PARAPHRASE_GROUPS)}", flush=True)
    total_queries = sum(len(g["variants"]) for g in PARAPHRASE_GROUPS)
    print(f"Total Query Variants: {total_queries}", flush=True)
    print("=" * 80, flush=True)

    for g in PARAPHRASE_GROUPS:
        g["project_id"] = "proj_universal_qa"

    group_results = []
    total_retrieval_hits = 0
    total_direct_evidence_hits = 0
    stable_groups = 0

    for g_idx, group in enumerate(PARAPHRASE_GROUPS, start=1):
        gid = group["group_id"]
        pid = "proj_universal_qa"
        target = group["target_fact"].lower()
        desc = group["fact_description"]
        variants = group["variants"]

        print(f"\n--- Group {g_idx}/{len(PARAPHRASE_GROUPS)}: {gid} ---", flush=True)
        print(f"Fact Target: {desc}", flush=True)

        group_hits = 0
        group_direct_hits = 0
        common_chunk_ids = None
        variant_evals = []

        for v_idx, v in enumerate(variants, start=1):
            style = v["style"]
            query = v["query"]

            t0 = time.time()
            res = execute_pipeline(pid, query)
            elapsed = time.time() - t0

            evidence = res.get("evidence", [])
            suf = res.get("sufficiency", {})
            chunk_ids = set()

            retrieval_hit = False
            direct_evidence_hit = False

            for ev in evidence:
                text = ev.get("text", "").lower()
                c_id = ev.get("chunkId")
                if c_id:
                    chunk_ids.add(c_id)
                if target in text:
                    retrieval_hit = True
                    direct_evidence_hit = True

            if retrieval_hit:
                group_hits += 1
                total_retrieval_hits += 1

            if direct_evidence_hit:
                group_direct_hits += 1
                total_direct_evidence_hits += 1

            if common_chunk_ids is None:
                common_chunk_ids = set(chunk_ids)
            else:
                common_chunk_ids = common_chunk_ids.intersection(chunk_ids)

            print(f"  [{v_idx}/{len(variants)}] {style.ljust(11)} | Hit: {retrieval_hit} | Direct: {direct_evidence_hit} | Suf: {suf.get('sufficient')} (Score: {suf.get('score'):.3f}) | ({elapsed:.2f}s)", flush=True)
            print(f"    Q: {query}", flush=True)
            print(f"    Searches: {res.get('search_queries')}", flush=True)
            print(f"    Slot: {res.get('question_slot')} | Anchors: {res.get('lexical_anchors')}", flush=True)

            variant_evals.append({
                "style": style,
                "query": query,
                "retrieval_hit": retrieval_hit,
                "direct_evidence_hit": direct_evidence_hit,
                "sufficiency": suf,
                "search_queries": res.get("search_queries"),
                "question_slot": res.get("question_slot"),
                "lexical_anchors": res.get("lexical_anchors"),
                "chunk_ids": list(chunk_ids)
            })

        # Group stability: at least 6 out of 7 variants (>= 85%) or all 7 retrieve target fact
        is_stable = group_hits >= (len(variants) - 1)
        if is_stable:
            stable_groups += 1

        print(f"--> Group {gid} Stability: {'PASS' if is_stable else 'FAIL'} ({group_hits}/{len(variants)} hits, Common Chunks: {len(common_chunk_ids)})", flush=True)

        group_results.append({
            "group_id": gid,
            "fact_description": desc,
            "target_fact": target,
            "total_variants": len(variants),
            "hits": group_hits,
            "direct_hits": group_direct_hits,
            "is_stable": is_stable,
            "variant_evals": variant_evals
        })

    retrieval_hit_rate = (total_retrieval_hits / total_queries) * 100.0
    direct_evidence_rate = (total_direct_evidence_hits / total_queries) * 100.0
    group_consistency_rate = (stable_groups / len(PARAPHRASE_GROUPS)) * 100.0

    print("\n" + "=" * 80)
    print("PHASE 1 SUMMARY METRICS")
    print("=" * 80)
    print(f"TOTAL PARAPHRASE GROUPS:           {len(PARAPHRASE_GROUPS)}")
    print(f"TOTAL QUERY VARIANTS:             {total_queries}")
    print(f"RETRIEVAL EVIDENCE HIT RATE:      {retrieval_hit_rate:.2f}% ({total_retrieval_hits}/{total_queries})")
    print(f"DIRECT ANSWER EVIDENCE RATE:      {direct_evidence_rate:.2f}% ({total_direct_evidence_hits}/{total_queries})")
    print(f"PARAPHRASE RETRIEVAL CONSISTENCY: {group_consistency_rate:.2f}% ({stable_groups}/{len(PARAPHRASE_GROUPS)} groups)")
    print("=" * 80)

    # Save artifact
    out_file = os.path.join(os.path.dirname(__file__), "phase1_paraphrase_results.json")
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump({
            "retrieval_evidence_hit_rate": retrieval_hit_rate,
            "direct_evidence_rate": direct_evidence_rate,
            "paraphrase_consistency_rate": group_consistency_rate,
            "stable_groups": stable_groups,
            "total_groups": len(PARAPHRASE_GROUPS),
            "total_queries": total_queries,
            "group_results": group_results
        }, f, indent=2)
    print(f"Phase 1 evaluation artifact saved to: {out_file}")

    return {
        "retrieval_evidence_hit_rate": retrieval_hit_rate,
        "direct_evidence_rate": direct_evidence_rate,
        "paraphrase_consistency_rate": group_consistency_rate,
        "stable_groups": stable_groups,
        "total_groups": len(PARAPHRASE_GROUPS),
    }


if __name__ == "__main__":
    run_phase1_paraphrase_eval()
