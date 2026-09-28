import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfOGZkYzNkNzMtOTM4OC00ZDNmLWE2YjAtNjM0NTU2NWQ4MmEzIiwiaWF0IjoxNzkwNjI0MjQzLCJleHAiOjE3OTA3MTA2NDN9.U_3V9fA_I0LIypocK9rTUct4lmI0-Nm8vQUfwsof1cc';
  const projectId = 'proj_8fe30b91-9145-47fa-84b9-24f220a29edd';

  console.log('====================================');
  console.log('TEST B: Upload Valid PDF');
  console.log('====================================');
  const validBuffer = fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/test_relations.pdf'));
  const validBlob = new Blob([validBuffer], { type: 'application/pdf' });
  const formValid = new FormData();
  formValid.append('file', validBlob, 'test_relations_valid.pdf');

  const uploadValidRes = await fetch(`http://localhost:4000/v1/projects/${projectId}/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formValid
  });
  const validData: any = await uploadValidRes.json();
  console.log('Upload response status:', uploadValidRes.status);
  console.log('Initial document status:', validData.document?.status);
  console.log('Document ID:', validData.document?.id);

  // Poll for ready status
  let validFinalStatus = validData.document?.status;
  let chunksCount = 0;
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const checkRes = await fetch(`http://localhost:4000/v1/projects/${projectId}/documents/${validData.document.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const checkData: any = await checkRes.json();
    validFinalStatus = checkData.document?.status;
    chunksCount = checkData.document?.chunksCount || 0;
    console.log(`Poll ${i+1}: status=${validFinalStatus}, chunksCount=${chunksCount}`);
    if (validFinalStatus === 'ready') break;
  }
  console.log('\nFinal status for valid PDF:', validFinalStatus);
  console.log('Chunks indexed in vector/search stores:', chunksCount);
}

main().catch(console.error);
