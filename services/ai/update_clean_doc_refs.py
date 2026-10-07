import os
import re

def update_qu():
    file_path = os.path.join(os.path.dirname(__file__), "src", "pipeline", "query_understanding.py")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Define strip helper
    helper_def = '''def strip_document_filename_references(text: str, doc_filenames: Optional[List[str]] = None) -> str:
    """
    Strips document file references (e.g. 'in Manual.pdf', 'of Notes.txt') from search queries.
    Prevents file names from polluting BM25 keyword tokens and cross-encoder reranking.
    """
    if not text:
        return ""
    clean = text
    if doc_filenames:
        for fn in doc_filenames:
            if fn and fn.lower() in clean.lower():
                clean = re.sub(rf'\\b(?:in|from|within|of|for|about)\\s+(?:the\\s+)?{re.escape(fn)}\\b', '', clean, flags=re.I)
                clean = re.sub(rf'\\b{re.escape(fn)}\\b', '', clean, flags=re.I)
    clean = re.sub(r'\\b(?:in|from|within|of|for|about)\\s+(?:the\\s+)?[A-Za-z0-9_-]+(?:\\s+[A-Za-z0-9_-]+){0,5}\\.(?:pdf|txt|md)\\b', '', clean, flags=re.I)
    clean = re.sub(r'\\b[A-Za-z0-9_-]+(?:\\s+[A-Za-z0-9_-]+){0,5}\\.(?:pdf|txt|md)\\b', '', clean, flags=re.I)
    clean = re.sub(r'\\s+', ' ', clean).strip()
    return clean if len(clean) >= 2 else text
'''

    if "def strip_document_filename_references" not in content:
        # Insert before understand_query
        target_uq = "async def understand_query("
        content = content.replace(target_uq, helper_def + "\n\n" + target_uq, 1)
        print("query_understanding.py: added strip_document_filename_references")

    # Clean standalone_query and search_queries in understand_query
    target_clean = """    # Clean standalone_query: strip trailing document file references (e.g. 'in document.pdf')
    if plan.standalone_query:
        clean_sa = re.sub(r'\\s+(?:in|from|within)\\s+(?:the\\s+)?[A-Za-z0-9_\\s-]+\\.(?:pdf|txt|md)\\s*$', '', plan.standalone_query, flags=re.I).strip()
        if clean_sa and len(clean_sa) >= 3:
            plan.standalone_query = clean_sa"""

    replacement_clean = """    # Clean standalone_query and search_queries: strip document file references
    if plan.standalone_query:
        plan.standalone_query = strip_document_filename_references(plan.standalone_query, ready_doc_titles)

    if plan.search_queries:
        cleaned_sqs = []
        for sq in plan.search_queries:
            csq = strip_document_filename_references(sq, ready_doc_titles)
            if csq and csq not in cleaned_sqs:
                cleaned_sqs.append(csq)
        if cleaned_sqs:
            plan.search_queries = cleaned_sqs"""

    if target_clean in content:
        content = content.replace(target_clean, replacement_clean, 1)
        print("query_understanding.py: updated cleaning in understand_query")
    else:
        print("query_understanding.py: clean target not found")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

def update_ret():
    file_path = os.path.join(os.path.dirname(__file__), "src", "pipeline", "retrieval.py")
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    target_rerank_old = """            # Sanitize query for cross-encoder reranker: strip trailing document references
            clean_rerank_q = re.sub(r'\\s+(?:in|from|within)\\s+(?:the\\s+)?[\\w\\s-]+\\.(?:pdf|txt|md)\\b', '', query, flags=re.I).strip()"""

    replacement_rerank_new = """            # Sanitize query for cross-encoder reranker: strip document references
            clean_rerank_q = re.sub(r'\\b(?:in|from|within|of|for|about)\\s+(?:the\\s+)?[A-Za-z0-9_-]+(?:\\s+[A-Za-z0-9_-]+){0,5}\\.(?:pdf|txt|md)\\b', '', query, flags=re.I)
            clean_rerank_q = re.sub(r'\\b[A-Za-z0-9_-]+(?:\\s+[A-Za-z0-9_-]+){0,5}\\.(?:pdf|txt|md)\\b', '', clean_rerank_q, flags=re.I)
            clean_rerank_q = re.sub(r'\\s+', ' ', clean_rerank_q).strip()"""

    if target_rerank_old in content:
        content = content.replace(target_rerank_old, replacement_rerank_new, 1)
        print("retrieval.py: updated rerank query sanitization")
    else:
        print("retrieval.py: target_rerank_old not found")

    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

if __name__ == '__main__':
    update_qu()
    update_ret()
