import { ProjectDocument, AtomicClaim } from '../types/architecture';

export interface ProjectScenario {
  projectName: string;
  projectCode: string;
  description: string;
  documents: ProjectDocument[];
  primaryQuestion: string;
  sampleQuestions: string[];
  canonicalEvidence: {
    ratedFlow: string;
    maxDischargePressure: string;
    sourceDocument: string;
    sourcePage: number;
    sourceLine: string;
  };
  draftAnswer: {
    text: string;
    ratedFlow: string;
    maxDischargePressure: string;
    status: 'DRAFT';
  };
  claims: AtomicClaim[];
  finalResponse: {
    title: string;
    equipmentTag: string;
    status: string;
    claimsCount: number;
    evidenceAttached: string;
  };
}

export const PUMP_STATION_ALPHA: ProjectScenario = {
  projectName: 'Pump Station Alpha',
  projectCode: 'PSA-ENG-2026',
  description: 'Water distribution booster station with 3 centrifugal feed pumps.',
  documents: [
    {
      id: 'doc-1',
      filename: 'P-101A Pump Datasheet.pdf',
      type: 'Technical Specification',
      size: '1.4 MB',
      sourcePage: 3,
      highlightedText: 'Rated flow: 120 m³/h | Max discharge pressure: 12.5 bar',
    },
    {
      id: 'doc-2',
      filename: 'Pump Station Equipment Specification.pdf',
      type: 'Mechanical Design Spec',
      size: '3.8 MB',
      sourcePage: 14,
      highlightedText: 'P-101A/B/C service envelope and motor rating',
    },
    {
      id: 'doc-3',
      filename: 'Process Design Basis.pdf',
      type: 'Process Engineering Guide',
      size: '2.1 MB',
      sourcePage: 7,
      highlightedText: 'Hydraulic design pressure margins and line losses',
    },
  ],
  primaryQuestion: 'What is the rated flow rate and maximum discharge pressure of P-101A?',
  sampleQuestions: [
    'What is the rated flow rate and maximum discharge pressure of P-101A?',
    'Which equipment is upstream of P-101A?',
    'What operating limits are specified for P-101A?',
  ],
  canonicalEvidence: {
    ratedFlow: '120 m³/h',
    maxDischargePressure: '12.5 bar',
    sourceDocument: 'P-101A Pump Datasheet.pdf',
    sourcePage: 3,
    sourceLine: 'Rated flow: 120 m³/h • Maximum discharge pressure: 12.5 bar (Table 2.1)',
  },
  draftAnswer: {
    text: 'P-101A has a rated flow rate of 120 m³/h and a maximum discharge pressure of 15.2 bar.',
    ratedFlow: '120 m³/h',
    maxDischargePressure: '15.2 bar',
    status: 'DRAFT',
  },
  claims: [
    {
      id: 'claim-1',
      claimNumber: 'CLAIM 01',
      statement: 'P-101A rated flow rate is 120 m³/h',
      expectedValue: '120 m³/h',
      actualEvidence: '120 m³/h',
      provenance: 'P-101A Pump Datasheet, Page 3 (Table 2.1)',
      sourceDoc: 'P-101A Pump Datasheet.pdf',
      sourcePage: 3,
      status: 'verified',
      semanticVerdict: 'ENTAILMENT',
      technicalChecks: {
        numbers: 'PASS',
        units: 'PASS',
        identifiers: 'PASS',
      },
    },
    {
      id: 'claim-2',
      claimNumber: 'CLAIM 02',
      statement: 'P-101A maximum discharge pressure is 15.2 bar',
      expectedValue: '15.2 bar',
      actualEvidence: '12.5 bar',
      provenance: 'P-101A Pump Datasheet, Page 3 (Table 2.1)',
      sourceDoc: 'P-101A Pump Datasheet.pdf',
      sourcePage: 3,
      status: 'recovered',
      semanticVerdict: 'CONTRADICTION',
      technicalChecks: {
        numbers: 'CONFLICT',
        units: 'PASS',
        identifiers: 'PASS',
      },
      recoveryAudit: {
        originalValue: '15.2 bar (Generated Draft)',
        contradictionNote: 'Mismatch with canonical engineering data sheet (15.2 ≠ 12.5 bar)',
        canonicalEvidence: '12.5 bar (P-101A Pump Datasheet, Page 3, Table 2.1)',
        revisedValue: '12.5 bar (Targeted Retrieval & Revision)',
        reverifiedStatus: 'PASS (Dual Semantic + Technical Verification Passed)',
      },
    },
  ],
  finalResponse: {
    title: 'GROUNDGUARD VERIFIED RESPONSE',
    equipmentTag: 'P-101A',
    status: 'VERIFIED',
    claimsCount: 2,
    evidenceAttached: '3 project documents indexed • Full audit trail attached',
  },
};
