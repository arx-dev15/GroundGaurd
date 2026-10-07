"""
GroundGuard Automated Index Reconciliation CLI (Section 4)
Maintains 3-way index consistency between PostgreSQL canonical chunks,
Qdrant dense vector store, and Tantivy BM25 lexical index.

Usage:
    python scripts/reconcile_indexes.py [--dry-run] [--project-id <id>] [--max <N>]
"""

import os
import sys
import argparse
import json
import logging

# Ensure services/ai is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.pipeline.index_verifier import reconcile_legacy_indexes

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("reconcile-cli")

def main():
    parser = argparse.ArgumentParser(description="Reconcile legacy search indexes with canonical PostgreSQL truth.")
    parser.add_argument("--dry-run", action="store_true", help="Report inconsistencies without writing changes.")
    parser.add_argument("--project-id", type=str, default=None, help="Optionally scope reconciliation to a specific project.")
    parser.add_argument("--max", type=int, default=None, help="Maximum number of documents to reconcile.")
    parser.add_argument("--json", action="store_true", help="Output result as raw JSON.")
    args = parser.parse_args()

    print(f"=== Starting GroundGuard Index Reconciliation {'(DRY RUN)' if args.dry_run else ''} ===")
    if args.project_id:
        print(f"Target Project: {args.project_id}")
    if args.max:
        print(f"Max Documents: {args.max}")

    result = reconcile_legacy_indexes(
        dry_run=args.dry_run,
        max_documents=args.max,
        target_project_id=args.project_id,
    )

    if args.json:
        print(json.dumps(result, indent=2))
        return

    print("\n=== RECONCILIATION SUMMARY ===")
    print(f"Total Audited READY Docs:    {result['totalAudited']}")
    print(f"Already Consistent:          {result['alreadyConsistent']}")
    print(f"Repaired Documents:          {result['repairedCount']}")
    print(f"Unrecoverable / Marked Fail: {result['unrecoverableCount']}")
    print(f"Remaining READY Docs in DB:  {result['remainingReadyDocs']}")
    print(f"Inconsistent READY Docs:     {result['inconsistentReadyRemaining']}")

    if result.get("repaired"):
        print("\n[Repaired Documents]:")
        for d in result["repaired"]:
            print(f"  - {d['filename']} ({d['documentId']}) in {d['projectId']}: {d['chunksCount']} chunks")

    if result.get("unrecoverable"):
        print("\n[Unrecoverable Documents]:")
        for d in result["unrecoverable"]:
            print(f"  - {d['filename']} ({d['documentId']}) in {d['projectId']}: {d['reason']}")

    if result["inconsistentReadyRemaining"] == 0:
        print("\n[SUCCESS] INVARIANT VERIFIED: 0 inconsistent READY documents remaining.")
    else:
        print(f"\n[WARNING] {result['inconsistentReadyRemaining']} inconsistent documents remain.")

if __name__ == "__main__":
    main()
