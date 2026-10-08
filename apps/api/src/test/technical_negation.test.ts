/** Regression: sentence-local negation polarity (false contradiction in gen_6c84d553, claim 3). */
import assert from 'node:assert';
import { technicalChecker } from '../services/technical-checks';

const conflict = (c: string, e: string) => technicalChecker.evaluate(c, e).conflicts.some((x) => x.type === 'negation_mismatch');

// Genuine polarity conflicts must still be caught
assert.ok(conflict('The pump does not require priming.', 'The pump requires priming before every start.'));
assert.ok(conflict('Valve V-204 is open during startup.', 'Valve V-204 is not open during startup.'));
assert.ok(conflict('The DHT11 sensor never needs calibration.', 'The DHT11 sensor needs calibration every six months.'));
assert.ok(conflict('Valve V-204 is not connected to pump P-101A.', 'Valve V-204 is connected to pump P-101A.'));
assert.ok(conflict('The manual specifies the warranty period.', 'The manual does not specify the warranty period.'));

// False positives that must NOT fire
const watsonClaim = 'Dr. John H. Watson, M.D. is the author whose reminiscences are featured in the text.';
const watsonEv = 'PART I. (Being a reprint from the reminiscences of John H. Watson, M.D., late of the Army Medical Department.) ' +
  'A Continuation Of The Reminiscences Of John Watson, M.D. Our prisoner’s furious resistance did not apparently indicate any ferocity in his disposition towards ourselves.';
assert.ok(!conflict(watsonClaim, watsonEv), 'unrelated negation in another sentence is not a polarity conflict');
assert.ok(!conflict('Pump P-101A has a rated flow rate of 450 gpm.', 'Pump P-101A has a rated flow rate of 450 gpm. The seal is not field replaceable.'));
assert.ok(!conflict('The documentation does not specify the NPSH.', 'Pump P-101A has a rated flow of 450 gpm.'));
assert.ok(!conflict('The bypass valve must not be opened.', 'The bypass valve must not be opened during calibration.'));
console.log('[OK] negation polarity: 5 true conflicts caught, 4 false positives rejected');
