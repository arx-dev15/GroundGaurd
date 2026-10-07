import os
import re

def update_main():
    file_path = os.path.join(os.path.dirname(__file__), "src", "main.py")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Define helper function before @app.middleware
    helper_code = '''def _fetch_successor_chunk(project_id: str, document_id: str, chunk_index: int) -> Optional[Dict[str, Any]]:
    try:
        from qdrant_client.http.models import Filter, FieldCondition, MatchValue
        res = qdrant_store.client.scroll(
            collection_name="groundguard_chunks",
            scroll_filter=Filter(
                must=[
                    FieldCondition(key="projectId", match=MatchValue(value=project_id)),
                    FieldCondition(key="documentId", match=MatchValue(value=document_id)),
                    FieldCondition(key="chunkIndex", match=MatchValue(value=chunk_index)),
                ]
            ),
            limit=1
        )
        if res and res[0]:
            return res[0][0].payload
    except Exception as e:
        logger.warning("[/generate successor error] %s", e)
    return None

def _apply_bounded_context_expansion_and_ordering(retrieval_res: Any, project_id: str, plan: Any) -> None:
    """
    Bounded Local Context Expansion & Procedural Reading-Order Preservation (Sections 12, 13).
    Expands high-confidence procedure, setup, section, or list chunks with their immediate successor chunk.
    Preserves bounded token context (max 2 successor chunks).
    """
    if not retrieval_res or not retrieval_res.results:
        return

    target_norm = (plan.target or "").strip().lower()
    is_proc_or_section = plan.retrieval_strategy in ("section", "procedural") or plan.operation in ("procedure", "explain")
    expanded_count = 0
    cands_snapshot = list(retrieval_res.results[:3])
    for matched_ev in cands_snapshot:
        if expanded_count >= 2:
            break
        doc_id = matched_ev.documentId
        c_idx = matched_ev.metadata.get("chunkIndex") if matched_ev.metadata else None
        if not doc_id or c_idx is None:
            continue

        is_high_conf = bool((matched_ev.score and matched_ev.score >= 0.35) or (matched_ev.rerankScore and matched_ev.rerankScore >= 0.35))
        is_target_hit = bool(target_norm and len(target_norm) >= 3 and (target_norm in (matched_ev.heading or "").lower() or target_norm in (matched_ev.text or "").lower()))

        if is_high_conf or is_proc_or_section or is_target_hit:
            succ_payload = _fetch_successor_chunk(project_id, doc_id, c_idx + 1)
            if succ_payload:
                succ_chunk_id = succ_payload.get("chunkId")
                if not any(e.chunkId == succ_chunk_id for e in retrieval_res.results):
                    succ_ev = EvidenceItem(
                        evidenceId=f"ev_{uuid.uuid4().hex[:8]}",
                        chunkId=succ_chunk_id,
                        documentId=doc_id,
                        text=succ_payload.get("text", ""),
                        pageNumber=succ_payload.get("pageNumber", matched_ev.pageNumber),
                        section=succ_payload.get("section", matched_ev.section),
                        heading=succ_payload.get("heading"),
                        identifiers=succ_payload.get("identifierKeys", []),
                        sources=["context_neighborhood"],
                        rrfScore=matched_ev.rrfScore,
                        rerankScore=matched_ev.rerankScore,
                        score=matched_ev.score,
                        metadata={
                            "chunkIndex": succ_payload.get("chunkIndex", c_idx + 1),
                            **(succ_payload.get("metadata") or {})
                        }
                    )
                    idx = retrieval_res.results.index(matched_ev)
                    retrieval_res.results.insert(idx + 1, succ_ev)
                    expanded_count += 1
                    logger.info("[context expansion] Added successor chunkIndex=%d for doc=%s", c_idx + 1, doc_id)

    # Section heading sufficiency confirmation
    if retrieval_res.results and target_norm and (plan.retrieval_strategy == "section" or plan.target):
        heading_matched = any(target_norm in (ev.heading or "").lower() or (len(target_norm) >= 4 and target_norm in ev.text.lower()) for ev in retrieval_res.results)
        if heading_matched and retrieval_res.sufficiency and not retrieval_res.sufficiency.sufficient:
            retrieval_res.sufficiency.sufficient = True
            retrieval_res.sufficiency.reason = f"Section topic '{plan.target}' matched in document evidence"
            retrieval_res.sufficiency.score = max(retrieval_res.sufficiency.score or 0.0, 0.85)

    # Procedural Reading-Order Preservation
    if plan.retrieval_strategy in ("procedural", "section") or plan.operation == "procedure":
        retrieval_res.results.sort(
            key=lambda ev: (
                ev.documentId or "",
                ev.pageNumber or 1,
                (ev.metadata.get("chunkIndex", 0) if ev.metadata else 0)
            )
        )
'''

    # Insert helper before @app.middleware
    target_middleware = '@app.middleware("http")'
    if target_middleware in content and "_apply_bounded_context_expansion_and_ordering" not in content:
        content = content.replace(target_middleware, helper_code + "\n\n" + target_middleware, 1)
        print("main.py: added helper function")

    # In generate: replace local Strategy D & E with call to _apply_bounded_context_expansion_and_ordering
    target_strat_d = """        # Strategy D: Section Neighborhood Expansion (if section requested and heading matched)
        if retrieval_res and retrieval_res.results and (plan.retrieval_strategy == "section" or plan.target):"""
    
    # Check if we can find the section in generate
    pattern_strat = r'        # Strategy D: Section Neighborhood Expansion.*?        # Strategy F: Technical Parameter Grounding'
    match_strat = re.search(pattern_strat, content, re.DOTALL)
    if match_strat:
        replacement_strat = """        # Bounded Local Context Expansion & Procedural Order Preservation
        _apply_bounded_context_expansion_and_ordering(retrieval_res, payload.projectId, plan)

        # Strategy F: Technical Parameter Grounding"""
        content = content[:match_strat.start()] + replacement_strat + content[match_strat.end() - len("        # Strategy F: Technical Parameter Grounding"):]
        print("main.py: updated Strategy D/E in generate()")

    # In generate_stream: call _apply_bounded_context_expansion_and_ordering right after retrieve_evidence
    target_stream_ret = """        yield _format_sse("retrieval.completed", {"generationId": gen_id, "evidenceCount": len(retrieval_res.results)})"""
    replacement_stream_ret = """        # Bounded Local Context Expansion & Procedural Order Preservation
        _apply_bounded_context_expansion_and_ordering(retrieval_res, payload.projectId, plan)

        yield _format_sse("retrieval.completed", {"generationId": gen_id, "evidenceCount": len(retrieval_res.results)})"""

    if target_stream_ret in content:
        content = content.replace(target_stream_ret, replacement_stream_ret, 1)
        print("main.py: added bounded expansion to generate_stream()")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == '__main__':
    update_main()
