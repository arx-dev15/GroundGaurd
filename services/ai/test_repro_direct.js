async function test() {
  const projectId = 'proj_c1467d4e-20b6-442f-88d8-8e7c8ee30d40';
  const queries = [
    'what is troubleshooting frm thw source',
    'Why troubleshooting',
    'what does gnd do?',
    'what does gnd do in pin configuration',
    'explain the connectivity setup'
  ];

  for (const q of queries) {
    console.log('\n======================================================');
    console.log(`QUERY: "${q}"`);
    const res = await fetch('http://localhost:8000/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        query: q
      })
    });
    const data = await res.json();
    console.log(`STATUS: ${data.status}`);
    console.log(`ABSTENTION: ${data.metadata?.abstention}`);
    console.log(`REASON: ${data.metadata?.reason}`);
    console.log(`TASK: ${data.metadata?.task}`);
    console.log(`RETRIEVAL STRATEGY: ${data.metadata?.retrievalStrategy}`);
    console.log(`SUFFICIENCY SCORE: ${data.sufficiency?.score}`);
    console.log(`SUFFICIENCY SUFFICIENT: ${data.sufficiency?.sufficient}`);
    console.log(`ANSWER:\n${data.answer}`);
    console.log(`EVIDENCE COUNT: ${data.evidence?.length}`);
    if (data.evidence?.length) {
      data.evidence.forEach((ev, i) => {
        console.log(`  [${i}] score=${ev.score} rerank=${ev.rerankScore} text=${JSON.stringify(ev.text.slice(0, 120))}`);
      });
    }
  }
}

test().catch(console.error);
