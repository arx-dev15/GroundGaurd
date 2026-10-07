import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.pipeline.llm import llm_runtime
from src.pipeline.context import context_builder
from src.pipeline.retrieval import EvidenceItem

ev1 = EvidenceItem(
    evidenceId='ev_1',
    chunkId='chk_6bca823228fb',
    documentId='doc_dht11',
    text='The sensor compact size, affordable cost, and straightforward wiring make it a popular choice. The Connectivity & Setup Physical connection',
    pageNumber=1, score=0.98, rerankScore=0.98, metadata={'filename': 'DHT11 Notes for the Students.pdf'}
)
ev2 = EvidenceItem(
    evidenceId='ev_2',
    chunkId='chk_6bc35b5870e9',
    documentId='doc_dht11',
    text='Physical connection – Please follow either the diagram shared or just - Connect the GND pin on the right side ( check the "-" Mark) - The Middle PIN will connect to Digital PIN 5 - The Left most pin is VIN ( Connect 5 V)',
    pageNumber=1, score=0.95, rerankScore=0.95, metadata={'filename': 'DHT11 Notes for the Students.pdf'}
)

ctx_text, _, _ = context_builder.build_context([ev1, ev2])

system_snippet = """You are EvideX AI, an enterprise AI assistant for evidence-grounded project documentation.
OPERATIONAL INVARIANT: PARTIALLY SUPPORTED QUESTIONS
If the user asks about a subject (such as what it does, why it is needed, or how it works) and the evidence establishes specific facts about that subject (such as where it is located, how it connects, its rating, or its configuration) but does not provide the full requested explanation or theoretical reason:
1. State the supported facts established by the evidence first.
2. Explicitly qualify what is missing from the documentation.
Example pattern:
The source identifies the rightmost pin as GND and instructs you to connect it to ground. It does not explain the electrical function or reason for that connection.
Do NOT convert partial support into total abstention. Answer the supported portion and state what is missing.
"""

queries = [
    "what does gnd do and why is it necessary?",
    "what does gnd do?",
    "explain the connectivity setup"
]

async def test():
    for q in queries:
        prompt = f"""{system_snippet}
=== BEGIN UNTRUSTED EVIDENCE CONTEXT ===
{ctx_text}
=== END UNTRUSTED EVIDENCE CONTEXT ===

USER QUERY: {q}
"""
        res = await llm_runtime.generate_answer(prompt)
        print("=" * 60)
        print(f"QUERY: {q}")
        print(res.answer)

if __name__ == '__main__':
    asyncio.run(test())
