const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/groundguard',
});

async function main() {
  const tables = [
    'claims',
    'claim_recovery_attempts',
    'claim_evidence',
    'generations',
    'evaluations',
    'evaluation_results',
  ];

  console.log('=== DATABASE SCHEMA AUDIT ===');
  for (const t of tables) {
    const res = await pool.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = $1
       ORDER BY ordinal_position;`,
      [t]
    );
    console.log(`\nTable [${t}]:`);
    for (const row of res.rows) {
      console.log(`  - ${row.column_name} (${row.data_type}, nullable: ${row.is_nullable})`);
    }
  }

  console.log('\n=== SAMPLE DATA AUDIT (proj_ac77188f-e0fe-46e9-8069-10ff41889f53) ===');
  const projId = 'proj_ac77188f-e0fe-46e9-8069-10ff41889f53';

  // 1. Claim status counts
  const claimCounts = await pool.query(
    `SELECT c.status, count(*)::int
     FROM claims c
     JOIN generations g ON g.id = c.generation_id
     WHERE g.project_id = $1
     GROUP BY c.status;`,
    [projId]
  );
  console.log('\nClaims by status in project:', claimCounts.rows);

  // 2. Recovery attempts count in project
  const rcvAttempts = await pool.query(
    `SELECT count(*)::int as total_attempts,
            count(DISTINCT cra.claim_id)::int as claims_with_attempts,
            count(*) FILTER (WHERE cra.verification_label = 'entailment')::int as successful_attempts
     FROM claim_recovery_attempts cra
     JOIN claims c ON c.id = cra.claim_id
     JOIN generations g ON g.id = c.generation_id
     WHERE g.project_id = $1;`,
    [projId]
  );
  console.log('Recovery attempts stats in project:', rcvAttempts.rows[0]);

  // 3. Check recovered claims provenance
  const recoveredClaims = await pool.query(
    `SELECT c.id, c.status, c.text,
            count(cra.id)::int as attempts_count,
            min(cra.original_text) as original_text
     FROM claims c
     JOIN generations g ON g.id = c.generation_id
     LEFT JOIN claim_recovery_attempts cra ON cra.claim_id = c.id
     WHERE g.project_id = $1 AND c.status = 'recovered'
     GROUP BY c.id, c.status, c.text;`,
    [projId]
  );
  console.log('\nRecovered claims detail (sample):', recoveredClaims.rows);

  // 4. Check evaluation runs in project
  const evalRuns = await pool.query(
    `SELECT id, name, status, metrics, model_version, created_at
     FROM evaluations
     WHERE project_id = $1;`,
    [projId]
  );
  console.log('\nEvaluations in project:', evalRuns.rows);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  pool.end();
});
