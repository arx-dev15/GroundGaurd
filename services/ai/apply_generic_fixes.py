import os
import re

def update_prompts():
    file_path = os.path.join(os.path.dirname(__file__), "src", "pipeline", "prompts.py")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    target = "     * ABSENCE / ABSTENTION: If the retrieved evidence does not mention the subject or attribute at all, state concisely in one sentence:"
    if target not in content:
        print("prompts.py: target already modified or not found")
        return

    replacement = """      * PARTIALLY SUPPORTED QUESTIONS: If the user asks about a subject (such as what it does, why it is needed, or how it works) and the evidence establishes specific facts about that subject (such as where it is located, how it connects, its rating, or its configuration) but does not supply the full requested explanation or theoretical reason:
        - State the supported facts established by the evidence first (e.g. "The source identifies the rightmost pin as GND and instructs you to connect it to ground...").
        - Explicitly qualify what is not specified in the documentation (e.g. "It does not explain the electrical function or reason for that connection.").
        - Do NOT convert partial support into total abstention. Answer the supported portion and state what is missing.
      * ABSENCE / ABSTENTION: If the retrieved evidence does not mention the subject or attribute at all, state concisely in one sentence:"""

    new_content = content.replace(target, replacement, 1)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print("prompts.py: successfully updated")

def update_query_understanding():
    file_path = os.path.join(os.path.dirname(__file__), "src", "pipeline", "query_understanding.py")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update standalone_query post-processing to strip trailing filename
    target_post = "    # Safety: ensure standalone_query is never empty\n    if not plan.standalone_query:\n        plan.standalone_query = raw_query"
    replacement_post = """    # Clean standalone_query: strip trailing document file references (e.g. 'in document.pdf')
    if plan.standalone_query:
        clean_sa = re.sub(r'\\s+(?:in|from|within)\\s+(?:the\\s+)?[A-Za-z0-9_\\s-]+\\.(?:pdf|txt|md)\\s*$', '', plan.standalone_query, flags=re.I).strip()
        if clean_sa and len(clean_sa) >= 3:
            plan.standalone_query = clean_sa

    # Safety: ensure standalone_query is never empty
    if not plan.standalone_query:
        plan.standalone_query = raw_query"""

    if target_post in content:
        content = content.replace(target_post, replacement_post, 1)
        print("query_understanding.py: post-processing updated")
    else:
        print("query_understanding.py: post-processing target not found")

    # 2. Update extract_lexical_anchors to include case-insensitive short acronyms
    target_acro = "    for m in re.finditer(r'\\b[A-Z]{2,}\\d*\\b|\\b[A-Z]+\\d+\\b', query):\n        acro = m.group(0).strip()\n        if acro.lower() not in _STOPWORDS_SET and len(acro) >= 2:\n            anchors.append(acro)"
    replacement_acro = """    for m in re.finditer(r'\\b[A-Za-z]{2,5}\\d*\\b', query):
        token = m.group(0).strip()
        lower_t = token.lower()
        if lower_t not in _STOPWORDS_SET and (token.isupper() or len(token) <= 4 or bool(re.search(r'\\d', token))):
            if lower_t not in {w.lower() for w in anchors}:
                anchors.append(token)"""

    if target_acro in content:
        content = content.replace(target_acro, replacement_acro, 1)
        print("query_understanding.py: anchors updated")
    else:
        print("query_understanding.py: anchors target not found")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

def update_retrieval():
    file_path = os.path.join(os.path.dirname(__file__), "src", "pipeline", "retrieval.py")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # 1. Update sufficiency aggregation logic
    target_suff = """    coverage_score = scope_res.signals.evidenceCoverageScore if (scope_res and scope_res.signals) else 0.0
    if scope_res and scope_res.decision == ScopeDecision.IN_SCOPE and coverage_score >= 0.60 and top_score >= 0.25:
        aggregated_score = max(top_score, 0.45 * top_score + 0.55 * coverage_score)
    else:
        aggregated_score = top_score"""

    replacement_suff = """    coverage_score = scope_res.signals.evidenceCoverageScore if (scope_res and scope_res.signals) else 0.0
    content_overlap = scope_res.signals.contentWordOverlap if (scope_res and scope_res.signals) else 0.0
    
    # Collective Evidence Set Evaluation (Sections 15, 16):
    # When query is verified IN_SCOPE with genuine content presence (content_overlap > 0.0 and coverage_score >= 0.50):
    # evaluate whether the evidence set collectively answers or grounds the information need,
    # preventing false abstentions from single-chunk cross-encoder length dilution or phrasing divergence.
    if scope_res and scope_res.decision == ScopeDecision.IN_SCOPE and content_overlap > 0.0:
        if coverage_score >= 0.70:
            aggregated_score = max(top_score, 0.30 * top_score + 0.70 * coverage_score)
        elif coverage_score >= 0.50 and top_score >= 0.10:
            aggregated_score = max(top_score, 0.40 * top_score + 0.60 * coverage_score)
        elif coverage_score >= 0.60 and top_score >= 0.20:
            aggregated_score = max(top_score, 0.45 * top_score + 0.55 * coverage_score)
        else:
            aggregated_score = top_score
    else:
        aggregated_score = top_score"""

    if target_suff in content:
        content = content.replace(target_suff, replacement_suff, 1)
        print("retrieval.py: sufficiency aggregation updated")
    else:
        print("retrieval.py: sufficiency target not found")

    # 2. Update rerank query sanitization & multi-query corroboration
    target_rerank = """    elif rrf_pool and query:
        try:
            passages = [
                {"chunkId": c.chunkId, "text": c.text, "candidate": c}
                for c in rrf_pool
            ]
            rerank_results = rerank(query=query, passages=passages, top_n=RERANK_CANDIDATE_K)
            for res in rerank_results:
                cand = res["candidate"]
                cand.rerankScore = float(res.get("rerankScore", 0.0))
                reranked_pool.append(cand)
        except Exception as e:
            logger.error(f"Reranking stage failed: {e}")
            raise RuntimeError(f"FlashRank reranking infrastructure failure: {e}") from e"""

    replacement_rerank = """    elif rrf_pool and query:
        try:
            passages = [
                {"chunkId": c.chunkId, "text": c.text, "candidate": c}
                for c in rrf_pool
            ]
            # Sanitize query for cross-encoder reranker: strip trailing document references
            clean_rerank_q = re.sub(r'\\s+(?:in|from|within)\\s+(?:the\\s+)?[\\w\\s-]+\\.(?:pdf|txt|md)\\b', '', query, flags=re.I).strip()
            rerank_q = clean_rerank_q if len(clean_rerank_q) >= 3 else query
            rerank_results = rerank(query=rerank_q, passages=passages, top_n=RERANK_CANDIDATE_K)
            for res in rerank_results:
                cand = res["candidate"]
                cand.rerankScore = float(res.get("rerankScore", 0.0))
                reranked_pool.append(cand)

            # Corroborate with alternative high-fidelity user/semantic query if distinct
            alt_q = None
            if search_queries and len(search_queries) > 0:
                candidate_alt = re.sub(r'\\s+(?:in|from|within)\\s+(?:the\\s+)?[\\w\\s-]+\\.(?:pdf|txt|md)\\b', '', search_queries[0], flags=re.I).strip()
                if candidate_alt and candidate_alt.lower() != rerank_q.lower() and len(candidate_alt) >= 3:
                    alt_q = candidate_alt
            elif hasattr(route, "rawQuery") and route.rawQuery and route.rawQuery.lower() != rerank_q.lower():
                alt_q = route.rawQuery

            if alt_q:
                try:
                    alt_res = rerank(query=alt_q, passages=passages, top_n=RERANK_CANDIDATE_K)
                    alt_scores = {r.get("chunkId", r.get("id")): float(r.get("rerankScore", r.get("score", 0.0))) for r in alt_res}
                    for cand in reranked_pool:
                        if cand.chunkId in alt_scores:
                            cand.rerankScore = max(cand.rerankScore or 0.0, alt_scores[cand.chunkId])
                except Exception as alt_err:
                    logger.debug(f"Alt rerank failed: {alt_err}")
        except Exception as e:
            logger.error(f"Reranking stage failed: {e}")
            raise RuntimeError(f"FlashRank reranking infrastructure failure: {e}") from e"""

    if target_rerank in content:
        content = content.replace(target_rerank, replacement_rerank, 1)
        print("retrieval.py: rerank sanitization updated")
    else:
        print("retrieval.py: rerank target not found")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == '__main__':
    update_prompts()
    update_query_understanding()
    update_retrieval()
