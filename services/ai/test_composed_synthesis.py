import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.pipeline.llm import llm_runtime
from src.pipeline.prompts import build_grounded_user_prompt
from src.pipeline.context import context_builder
from src.pipeline.retrieval import EvidenceItem

async def test_llm():
    # Simulate Chunk 1 + Chunk 2
    ev1 = EvidenceItem(
        evidenceId="ev_1",
        chunkId="chk_6bca823228fb",
        documentId="doc_dht11",
        text="The sensor's compact size, affordable cost, and straightforward wiring make it a popular choice for beginners and hobbyists interested in environmental sensing and automation projects. The Connectivity & Setup Physical connection – Please follow either the diagram shared",
        pageNumber=1,
        score=0.98,
        rerankScore=0.98,
        metadata={"filename": "DHT11 Notes for the Students.pdf", "chunkIndex": 1}
    )
    ev2 = EvidenceItem(
        evidenceId="ev_2",
        chunkId="chk_6bc35b5870e9",
        documentId="doc_dht11",
        text="nection – Please follow either the diagram shared or just - Connect the GND pin on the right side ( check the “–“ Mark) - The Middle PIN will connect to Digital PIN 5 - The Left most pin is VIN ( Connect 5 V) Code I will provide the basic code first 1. Open a new Sketch 2. Copy and Paste the code 3. Deploy successfully.",
        pageNumber=1,
        score=0.95,
        rerankScore=0.95,
        metadata={"filename": "DHT11 Notes for the Students.pdf", "chunkIndex": 2}
    )

    ctx_text, inc, _ = context_builder.build_context([ev1, ev2])
    
    # 1. Connectivity setup
    user_prompt_1 = build_grounded_user_prompt(
        query="explain the connectivity setup",
        evidence_context=ctx_text,
        standalone_query="explain the connectivity setup",
        operation="procedure"
    )
    res_1 = await llm_runtime.generate_answer(user_prompt_1)
    print("=" * 60)
    print("QUERY: explain the connectivity setup")
    print(res_1.answer)

    # 2. What does GND do?
    user_prompt_2 = build_grounded_user_prompt(
        query="what does gnd do?",
        evidence_context=ctx_text,
        standalone_query="what does gnd do?",
        operation="explain"
    )
    res_2 = await llm_runtime.generate_answer(user_prompt_2)
    print("=" * 60)
    print("QUERY: what does gnd do?")
    print(res_2.answer)

    # 3. Partial Support: What does GND do and why is it necessary?
    user_prompt_3 = build_grounded_user_prompt(
        query="what does gnd do and why is it necessary?",
        evidence_context=ctx_text,
        standalone_query="what does gnd do and why is it necessary?",
        operation="explain"
    )
    res_3 = await llm_runtime.generate_answer(user_prompt_3)
    print("=" * 60)
    print("QUERY: what does gnd do and why is it necessary?")
    print(res_3.answer)

if __name__ == '__main__':
    asyncio.run(test_llm())
