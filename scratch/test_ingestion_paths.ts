import fs from 'node:fs';
import path from 'node:path';

async function main() {
  console.log('1. Registering/Logging in user...');
  let loginRes = await fetch('http://localhost:4000/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'readiness@groundguard.ai', password: 'Password123!' })
  });
  let loginData: any = await loginRes.json();
  const token = loginData.token;
  console.log('Login OK. User ID:', loginData.user?.id);

  console.log('2. Creating test project...');
  const projCreateRes = await fetch('http://localhost:4000/v1/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: 'Readiness Pass Project' })
  });
  const projCreateData: any = await projCreateRes.json();
  const projectId = projCreateData.project.id;
  console.log('Created project:', projCreateData.project.name, '(', projectId, ')');

  // Negative Path Test
  console.log('\n====================================');
  console.log('TEST A: Upload Invalid / Corrupt File');
  console.log('====================================');
  const invalidBlob = new Blob([Buffer.from('Corrupted non-PDF raw text data 12345')], { type: 'application/pdf' });
  const formInvalid = new FormData();
  formInvalid.append('file', invalidBlob, 'invalid_sample.pdf');

  const uploadInvalidRes = await fetch(`http://localhost:4000/v1/projects/${projectId}/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formInvalid
  });
  const invalidData: any = await uploadInvalidRes.json();
  console.log('Upload response status:', uploadInvalidRes.status);
  console.log('Initial document status:', invalidData.document?.status);

  // Poll for status update
  let invalidFinalStatus = invalidData.document?.status;
  let invalidError = '';
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const checkRes = await fetch(`http://localhost:4000/v1/projects/${projectId}/documents/${invalidData.document.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const checkData: any = await checkRes.json();
    invalidFinalStatus = checkData.document?.status;
    invalidError = checkData.document?.errorMessage;
    if (invalidFinalStatus === 'failed') break;
  }
  console.log('Final status for invalid PDF:', invalidFinalStatus);
  console.log('Persisted safe error message:', invalidError);

  // Positive Path Test
  console.log('\n====================================');
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

  // Poll for ready status
  let validFinalStatus = validData.document?.status;
  let chunksCount = 0;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const checkRes = await fetch(`http://localhost:4000/v1/projects/${projectId}/documents/${validData.document.id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const checkData: any = await checkRes.json();
    validFinalStatus = checkData.document?.status;
    chunksCount = checkData.document?.chunksCount || 0;
    if (validFinalStatus === 'ready') break;
  }
  console.log('Final status for valid PDF:', validFinalStatus);
  console.log('Chunks indexed in vector/search stores:', chunksCount);
}

main().catch(console.error);
